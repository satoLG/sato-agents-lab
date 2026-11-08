import importlib.util
import io
import json
import sys
import types
from pathlib import Path
import pytest


SEARCH = {'function': {'name': 'web_search'}}


@pytest.mark.parametrize('exposed_tools', [[], [SEARCH]])
def test_local_runner_disables_tools_and_reports_progress(monkeypatch, exposed_tools):
    spec = importlib.util.spec_from_file_location(
        'web_chat_runner', Path(__file__).resolve().parents[1] / 'tools/web_chat_runner.py'
    )
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    executor = types.ModuleType('agent.tool_executor')
    package = types.ModuleType('agent')
    package.__path__ = []
    package.tool_executor = executor
    package.auxiliary_client = types.SimpleNamespace(resolve_provider_client=lambda *_: (None, None))
    calls = []

    def execute(agent, message, *args, **kwargs):
        calls.extend(tool.function.name for tool in message.tool_calls)

    paths = ('execute_tool_calls_concurrent', 'execute_tool_calls_sequential', 'execute_tool_calls_segmented')
    for name in paths:
        setattr(executor, name, execute)
    agent = types.SimpleNamespace(tools=exposed_tools, provider='openrouter', model='openrouter/free', _fallback_chain=[])
    search = types.SimpleNamespace(function=types.SimpleNamespace(name='web_search'))
    terminal = types.SimpleNamespace(function=types.SimpleNamespace(name='terminal'))

    def conversation(**kwargs):
        for name in paths:
            dispatch = getattr(executor, name)
            for tool in (search, terminal):
                with pytest.raises(RuntimeError, match='Tools are disabled'):
                    dispatch(agent, types.SimpleNamespace(tool_calls=[tool]), [], 'test')
        assert agent.tool_progress_callback is None
        agent.step_callback(1, [])
        return {'final_response': 'Resultado da consulta.'}

    agent.run_conversation = conversation

    class CLI:
        def __init__(self, **kwargs):
            assert kwargs['toolsets'] == [] and kwargs['max_turns'] > 1
            assert (kwargs['provider'], kwargs['model']) == ('openrouter', 'openrouter/free')
            self._fallback_model = [{'provider': 'opencode-go', 'model': 'gpt-5.6-luna'}]
            self.agent = agent

        def _ensure_runtime_credentials(self):
            assert self._fallback_model == []
            return True

        def _init_agent(self):
            return True

    monkeypatch.setitem(sys.modules, 'cli', types.SimpleNamespace(HermesCLI=CLI))
    monkeypatch.setitem(sys.modules, 'model_tools', types.SimpleNamespace(get_tool_definitions=lambda **_: []))
    monkeypatch.setitem(sys.modules, 'agent', package)
    monkeypatch.setitem(sys.modules, 'agent.tool_executor', executor)
    output = io.StringIO()
    monkeypatch.setattr(sys, 'stdout', output)
    monkeypatch.setattr(sys, 'stdin', io.StringIO(json.dumps({'root': '.', 'prompt': 'Pesquise', 'history': []})))
    if exposed_tools:
        with pytest.raises(RuntimeError, match='isolation'):
            runner.main([])
        assert not calls and not output.getvalue()
        return

    runner.main([])
    assert not calls
    events = [json.loads(line) for line in output.getvalue().splitlines()]
    assert [event['kind'] for event in events] == ['model', 'reply', 'answer']


def test_persistent_runner_builds_fresh_agents_and_explicit_conversation_history(monkeypatch):
    spec=importlib.util.spec_from_file_location('web_chat_runner',Path(__file__).resolve().parents[1]/'tools/web_chat_runner.py')
    runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
    instances=[]; received=[]
    class CLI:
        def __init__(self,**kwargs):
            assert 'resume' not in kwargs
            instances.append(self)
            self.agent=types.SimpleNamespace(tools=[],run_conversation=self.conversation,
                provider='openrouter',model='openrouter/free',_fallback_chain=[])
        def _ensure_runtime_credentials(self):return True
        def _init_agent(self):return True
        def conversation(self,**kwargs):
            received.append((self.session_id,kwargs['conversation_history']))
            return {'final_response':'OK'}
    monkeypatch.setitem(sys.modules,'model_tools',types.SimpleNamespace(get_tool_definitions=lambda **_:[]))
    monkeypatch.setattr(runner,'_bootstrap',lambda _:types.SimpleNamespace(HermesCLI=CLI))
    requests=[{'id':'one','conversation_id':'a'*32,'prompt':'First','history':[]},
              {'id':'two','conversation_id':'a'*32,'prompt':'Continue','history':[{'role':'user','content':'First'}]},
              {'id':'three','conversation_id':'b'*32,'prompt':'Other','history':[]}]
    output=io.StringIO();monkeypatch.setattr(sys,'stdout',output)
    monkeypatch.setattr(sys,'stdin',io.StringIO(''.join(json.dumps(item)+'\n' for item in requests)))
    runner.main(['--serve','--root','.'])
    assert len(instances)==3 and received==[('web-'+'a'*32,[]),('web-'+'a'*32,requests[1]['history']),('web-'+'b'*32,[])]
    events=[json.loads(line) for line in output.getvalue().splitlines()]
    assert events[0]=={'kind':'ready','protocol':3,'allowed_tools':[]}
    assert [event['request_id'] for event in events if event['kind']=='done']==['one','two','three']


def test_web_route_fails_closed_when_openrouter_credentials_are_unavailable():
    spec = importlib.util.spec_from_file_location(
        'web_chat_runner', Path(__file__).resolve().parents[1] / 'tools/web_chat_runner.py'
    )
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)

    class CLI:
        def __init__(self, *, provider, model, **kwargs):
            assert (provider, model) == ('openrouter', 'openrouter/free')
            self._fallback_model = [{'provider': 'opencode-go', 'model': 'gpt-5.6-luna'}]

        def _ensure_runtime_credentials(self):
            assert self._fallback_model == []
            return False

        def _init_agent(self):
            pytest.fail('Web chat must stop when the free route cannot authenticate')

    with pytest.raises(RuntimeError, match='initialization failed'):
        runner._answer({'prompt': 'oi'}, types.SimpleNamespace(HermesCLI=CLI), lambda *_: None)


def test_auxiliary_routes_cannot_use_shared_fallback_providers():
    spec = importlib.util.spec_from_file_location(
        'web_chat_runner', Path(__file__).resolve().parents[1] / 'tools/web_chat_runner.py'
    )
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    calls = []

    def resolve(provider, model, **kwargs):
        calls.append((provider, model, kwargs))
        return 'client', model

    auxiliary = types.SimpleNamespace(resolve_provider_client=resolve)
    runner._restrict_auxiliary_routing(auxiliary)
    assert auxiliary._resolve_task_provider_model('vision')[:2] == ('openrouter', 'openrouter/free')
    assert auxiliary.resolve_provider_client('opencode-go', 'minimax-m3') == (None, None)
    assert auxiliary.resolve_provider_client('openrouter', 'z-ai/glm-5.2') == (None, None)
    assert auxiliary.resolve_provider_client('openrouter', 'openrouter/free', async_mode=True) == ('client', 'openrouter/free')
    assert calls == [('openrouter', 'openrouter/free', {'async_mode': True})]
    assert auxiliary._is_free_model('openrouter/free')
    assert auxiliary._get_provider_chain() == []
