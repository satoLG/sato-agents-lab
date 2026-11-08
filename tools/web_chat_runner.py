"""Hermes with server-provided context in a persistent JSONL child."""
import argparse
import contextlib
import gc
import json
import os
import re
import sys
from functools import wraps
from threading import Lock


WEB_PROVIDER = 'openrouter'
WEB_MODEL = 'openrouter/free'


def _without_tools(execute):
    @wraps(execute)
    def guarded(agent, assistant_message, *args, **kwargs):
        if assistant_message.tool_calls:
            raise RuntimeError('Tools are disabled in the dashboard chat')
        return execute(agent, assistant_message, *args, **kwargs)
    return guarded


def _restrict_auxiliary_routing(auxiliary):
    resolve = auxiliary.resolve_provider_client

    @wraps(resolve)
    def free_client(provider, model=None, *args, **kwargs):
        if (provider, model) != (WEB_PROVIDER, WEB_MODEL):
            return None, None
        return resolve(provider, model, *args, **kwargs)

    # The child is private to the dashboard. Pin even auxiliary calls which
    # would otherwise use the shared profile's provider discovery and reserves.
    auxiliary._resolve_task_provider_model = lambda *args, **kwargs: (
        WEB_PROVIDER, WEB_MODEL, None, None, 'chat_completions'
    )
    auxiliary.resolve_provider_client = free_client
    auxiliary._get_provider_chain = lambda: []
    # This Hermes version recognises :free SKUs but not the free router alias.
    auxiliary._is_free_model = lambda model: model == WEB_MODEL


def _bootstrap(root):
    os.environ['HERMES_SESSION_SOURCE'] = 'web_chat'
    sys.path.insert(0, root)
    import cli
    from model_tools import get_tool_definitions
    from agent import auxiliary_client
    import agent.tool_executor as executor

    _restrict_auxiliary_routing(auxiliary_client)

    if get_tool_definitions(enabled_toolsets=[], quiet_mode=True):
        raise RuntimeError('Hermes tool isolation failed at startup')
    for name in ('execute_tool_calls_concurrent', 'execute_tool_calls_sequential', 'execute_tool_calls_segmented'):
        setattr(executor, name, _without_tools(getattr(executor, name)))
    return cli


def _answer(request, cli_module, emit):
    # Fresh agents receive only explicit, conversation-scoped history. No /resume.
    cli = cli_module.HermesCLI(
        provider=WEB_PROVIDER, model=WEB_MODEL, toolsets=[],
        max_turns=6, run_budget=180, ignore_rules=True,
    )
    # The CLI uses this chain both for credential resolution and agent setup.
    cli._fallback_model = []
    conversation = request.get('conversation_id', '')
    if re.fullmatch(r'[0-9a-f]{32}', conversation):
        cli.session_id = 'web-' + conversation
    if not cli._ensure_runtime_credentials() or not cli._init_agent():
        raise RuntimeError('Hermes initialization failed')
    agent = cli.agent
    if (agent.provider, agent.model) != (WEB_PROVIDER, WEB_MODEL) or agent._fallback_chain:
        raise RuntimeError('Unexpected Hermes dashboard model route')
    if agent.tools:
        raise RuntimeError('Hermes tool isolation failed')
    agent.quiet_mode = True
    agent.suppress_status_output = True
    for name in ('tool_start_callback', 'tool_complete_callback', 'reasoning_callback', 'stream_delta_callback', 'tool_gen_callback'):
        setattr(agent, name, None)
    def model_step(step, _tools):
        if step == 1:
            emit('model', 'Analisando a pergunta e o contexto disponível.')
        else:
            emit('model', 'Cruzando os resultados para preparar a resposta.')

    agent.step_callback = model_step
    def thinking(active=True, *args, **kwargs):
        if active:
            emit('thinking', 'O modelo está preparando a resposta.')
    agent.thinking_callback = thinking
    agent.tool_progress_callback = None
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
    write({'kind': 'ready', 'protocol': 3, 'allowed_tools': []})
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
