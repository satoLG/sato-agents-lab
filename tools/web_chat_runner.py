"""Tool-free Hermes requests, optionally served by a persistent JSONL child."""
import argparse
import contextlib
import gc
import json
import os
import re
import sys


def _bootstrap(root):
    os.environ['HERMES_SESSION_SOURCE'] = 'web_chat'
    sys.path.insert(0, root)
    import cli
    from model_tools import get_tool_definitions
    from toolsets import validate_toolset
    assert validate_toolset('context_engine')
    assert get_tool_definitions(enabled_toolsets=['context_engine'], quiet_mode=True) == []
    import agent.tool_executor as executor
    def deny_execution(*args, **kwargs):
        raise RuntimeError('Tool execution is disabled in conversation mode')
    for name in ('execute_tool_calls_concurrent', 'execute_tool_calls_sequential', 'execute_tool_calls_segmented'):
        setattr(executor, name, deny_execution)
    return cli


def _answer(request, cli_module, emit):
    from model_tools import get_tool_definitions
    assert get_tool_definitions(enabled_toolsets=['context_engine'], quiet_mode=True) == []
    # Fresh agents receive only explicit, conversation-scoped history. No /resume.
    cli = cli_module.HermesCLI(toolsets=['context_engine'], max_turns=1, run_budget=180, ignore_rules=True)
    conversation = request.get('conversation_id', '')
    if re.fullmatch(r'[0-9a-f]{32}', conversation):
        cli.session_id = 'web-' + conversation
    if not cli._ensure_runtime_credentials() or not cli._init_agent():
        raise RuntimeError('Hermes initialization failed')
    agent = cli.agent
    if agent.tools:
        raise RuntimeError('Tool isolation failed')
    agent.quiet_mode = True
    agent.suppress_status_output = True
    for name in ('tool_start_callback', 'tool_complete_callback', 'reasoning_callback', 'stream_delta_callback', 'tool_gen_callback'):
        setattr(agent, name, None)
    agent.step_callback = lambda step, tools: emit('model', f'Consultando o modelo · etapa {step}.')
    def thinking(active=True, *args, **kwargs):
        if active:
            emit('thinking', 'O modelo está preparando a resposta.')
    agent.thinking_callback = thinking
    def progress(kind, *args, **kwargs):
        if kind in {'tool.started', 'tool.completed'}:
            raise RuntimeError('Tool execution is disabled in conversation mode')
    agent.tool_progress_callback = progress
    if request.get('id'):
        emit('isolation', 'Modo conversa: ferramentas desabilitadas e verificadas.')
    emit('model', 'Enviando a mensagem ao modelo configurado no Hermes.')
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
    def write(event):
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
    write({'kind': 'ready', 'protocol': 1, 'tools_disabled': True})
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
