"""Read-only search with Hermes in a persistent JSONL child."""
import argparse
import contextlib
import gc
import json
import os
import re
import sys
from functools import wraps
from threading import Lock


SEARCH_TOOL = 'web_search'


def _tool_names(definitions):
    return {tool['function']['name'] for tool in definitions}


def _search_only(execute):
    @wraps(execute)
    def guarded(agent, assistant_message, *args, **kwargs):
        if any(call.function.name != SEARCH_TOOL for call in assistant_message.tool_calls):
            raise RuntimeError('Only web_search is allowed in the dashboard chat')
        return execute(agent, assistant_message, *args, **kwargs)
    return guarded


def _bootstrap(root):
    os.environ['HERMES_SESSION_SOURCE'] = 'web_chat'
    sys.path.insert(0, root)
    import cli
    from model_tools import get_tool_definitions
    import agent.tool_executor as executor

    if _tool_names(get_tool_definitions(enabled_toolsets=['search'], quiet_mode=True)) != {SEARCH_TOOL}:
        raise RuntimeError('Hermes search tool isolation failed at startup')
    for name in ('execute_tool_calls_concurrent', 'execute_tool_calls_sequential', 'execute_tool_calls_segmented'):
        setattr(executor, name, _search_only(getattr(executor, name)))
    return cli


def _answer(request, cli_module, emit):
    # Fresh agents receive only explicit, conversation-scoped history. No /resume.
    cli = cli_module.HermesCLI(toolsets=['search'], max_turns=6, run_budget=180, ignore_rules=True)
    conversation = request.get('conversation_id', '')
    if re.fullmatch(r'[0-9a-f]{32}', conversation):
        cli.session_id = 'web-' + conversation
    if not cli._ensure_runtime_credentials() or not cli._init_agent():
        raise RuntimeError('Hermes initialization failed')
    agent = cli.agent
    if _tool_names(agent.tools) != {SEARCH_TOOL}:
        raise RuntimeError('Hermes search tool isolation failed')
    agent.quiet_mode = True
    agent.suppress_status_output = True
    for name in ('tool_start_callback', 'tool_complete_callback', 'reasoning_callback', 'stream_delta_callback', 'tool_gen_callback'):
        setattr(agent, name, None)
    agent.step_callback = lambda step, tools: emit('model', f'Consultando o modelo · etapa {step}.')
    def thinking(active=True, *args, **kwargs):
        if active:
            emit('thinking', 'O modelo está preparando a resposta.')
    agent.thinking_callback = thinking
    def progress(kind, tool_name, *args, **kwargs):
        if tool_name != SEARCH_TOOL:
            return
        if kind == 'tool.started':
            emit('search', 'Buscando informações na web.')
        elif kind == 'tool.completed':
            text = 'A busca retornou um erro.' if kwargs.get('is_error') else 'Busca concluída. Analisando os resultados.'
            emit('search', text)

    agent.tool_progress_callback = progress
    emit('model', 'Enviando a pergunta ao Hermes.')
    result = agent.run_conversation(user_message=request['prompt'], conversation_history=request.get('history', []))
    if not isinstance(result, dict) or result.get('failed') or not result.get('final_response'):
        raise RuntimeError('Hermes returned no answer')
    answer = result['final_response']
    if not isinstance(answer, str) or len(answer) > 10000:
        raise RuntimeError('Hermes returned no usable response')
    emit('reply', 'Resposta recebida do modelo.')
    emit('answer', answer)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--root')
    args = parser.parse_args(argv)
    transport = sys.stdout
    output_lock = Lock()

    def write(event):
        with output_lock:
            transport.write(json.dumps(event, ensure_ascii=False) + '\n')
            transport.flush()
    if not args.serve:
        request = json.load(sys.stdin)
        with contextlib.redirect_stdout(sys.stderr):
            module = _bootstrap(request['root'])
            _answer(request, module, lambda kind, text: write({'kind': kind, 'text': text}))
        return
    if not args.root:
        parser.error('--root is required with --serve')
    with contextlib.redirect_stdout(sys.stderr):
        module = _bootstrap(args.root)
    write({'kind': 'ready', 'protocol': 2, 'allowed_tools': [SEARCH_TOOL]})
    for line in sys.stdin:
        request = json.loads(line)
        request_id = request['id']
        def emit(kind, text):
            write({'request_id': request_id, 'kind': kind, 'text': text})
        try:
            with contextlib.redirect_stdout(sys.stderr):
                _answer(request, module, emit)
            emit('done', '')
        except Exception:
            emit('error', 'Hermes indisponível')
            return
        finally:
            gc.collect()


if __name__ == '__main__':
    main()
