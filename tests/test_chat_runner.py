import importlib.util
import io
import json
import sys
import types
from pathlib import Path
import pytest


SEARCH = {'function': {'name': 'web_search'}}
TERMINAL = {'function': {'name': 'terminal'}}


@pytest.mark.parametrize('exposed_tools', [[SEARCH], [SEARCH, TERMINAL]])
def test_search_runner_allows_only_search_and_reports_progress(monkeypatch, exposed_tools):
    spec = importlib.util.spec_from_file_location(
        'web_chat_runner', Path(__file__).resolve().parents[1] / 'tools/web_chat_runner.py'
    )
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    executor = types.ModuleType('agent.tool_executor')
    package = types.ModuleType('agent')
    package.__path__ = []
    package.tool_executor = executor
    calls = []

    def execute(agent, message, *args, **kwargs):
        calls.extend(tool.function.name for tool in message.tool_calls)

    paths = ('execute_tool_calls_concurrent', 'execute_tool_calls_sequential', 'execute_tool_calls_segmented')
    for name in paths:
        setattr(executor, name, execute)
    agent = types.SimpleNamespace(tools=exposed_tools)
    search = types.SimpleNamespace(function=types.SimpleNamespace(name='web_search'))
    terminal = types.SimpleNamespace(function=types.SimpleNamespace(name='terminal'))

    def conversation(**kwargs):
        for name in paths:
            dispatch = getattr(executor, name)
            with pytest.raises(RuntimeError, match='Only web_search'):
                dispatch(agent, types.SimpleNamespace(tool_calls=[search, terminal]), [], 'test')
            dispatch(agent, types.SimpleNamespace(tool_calls=[search]), [], 'test')
        agent.tool_progress_callback('tool.started', 'web_search', 'private query')
        agent.tool_progress_callback('tool.completed', 'web_search', result='private result')
        return {'final_response': 'Resultado da consulta.'}

    agent.run_conversation = conversation

    class CLI:
        def __init__(self, **kwargs):
            assert kwargs['toolsets'] == ['search'] and kwargs['max_turns'] > 1
            self.agent = agent

        def _ensure_runtime_credentials(self):
            return True

        def _init_agent(self):
            return True

    monkeypatch.setitem(sys.modules, 'cli', types.SimpleNamespace(HermesCLI=CLI))
    monkeypatch.setitem(sys.modules, 'model_tools', types.SimpleNamespace(get_tool_definitions=lambda **_: [SEARCH]))
    monkeypatch.setitem(sys.modules, 'agent', package)
    monkeypatch.setitem(sys.modules, 'agent.tool_executor', executor)
    output = io.StringIO()
    monkeypatch.setattr(sys, 'stdout', output)
    monkeypatch.setattr(sys, 'stdin', io.StringIO(json.dumps({'root': '.', 'prompt': 'Pesquise', 'history': []})))
    if exposed_tools != [SEARCH]:
        with pytest.raises(RuntimeError, match='isolation'):
            runner.main([])
        assert not calls and not output.getvalue()
        return

    runner.main([])
    assert calls == ['web_search'] * len(paths)
    assert 'private' not in output.getvalue()
    events = [json.loads(line) for line in output.getvalue().splitlines()]
    assert [event['kind'] for event in events] == ['model', 'search', 'search', 'reply', 'answer']


def test_persistent_runner_builds_fresh_agents_and_explicit_conversation_history(monkeypatch):
    spec=importlib.util.spec_from_file_location('web_chat_runner',Path(__file__).resolve().parents[1]/'tools/web_chat_runner.py')
    runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
    instances=[]; received=[]
    class CLI:
        def __init__(self,**kwargs):
            assert 'resume' not in kwargs
            instances.append(self)
            self.agent=types.SimpleNamespace(tools=[SEARCH],run_conversation=self.conversation)
        def _ensure_runtime_credentials(self):return True
        def _init_agent(self):return True
        def conversation(self,**kwargs):
            received.append((self.session_id,kwargs['conversation_history']))
            return {'final_response':'OK'}
    monkeypatch.setitem(sys.modules,'model_tools',types.SimpleNamespace(get_tool_definitions=lambda **_:[SEARCH]))
    monkeypatch.setattr(runner,'_bootstrap',lambda _:types.SimpleNamespace(HermesCLI=CLI))
    requests=[{'id':'one','conversation_id':'a'*32,'prompt':'First','history':[]},
              {'id':'two','conversation_id':'a'*32,'prompt':'Continue','history':[{'role':'user','content':'First'}]},
              {'id':'three','conversation_id':'b'*32,'prompt':'Other','history':[]}]
    output=io.StringIO();monkeypatch.setattr(sys,'stdout',output)
    monkeypatch.setattr(sys,'stdin',io.StringIO(''.join(json.dumps(item)+'\n' for item in requests)))
    runner.main(['--serve','--root','.'])
    assert len(instances)==3 and received==[('web-'+'a'*32,[]),('web-'+'a'*32,requests[1]['history']),('web-'+'b'*32,[])]
    events=[json.loads(line) for line in output.getvalue().splitlines()]
    assert events[0]=={'kind':'ready','protocol':2,'allowed_tools':['web_search']}
    assert [event['request_id'] for event in events if event['kind']=='done']==['one','two','three']
