import importlib.util
import io
import json
import sys
import types
from pathlib import Path
import pytest


@pytest.mark.parametrize('exposed_tools', [[], ['terminal']])
def test_conversation_runner_blocks_dispatch_and_fails_closed(monkeypatch, exposed_tools):
    spec=importlib.util.spec_from_file_location('web_chat_runner',Path(__file__).resolve().parents[1]/'tools/web_chat_runner.py')
    runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
    executor=types.ModuleType('agent.tool_executor')
    package=types.ModuleType('agent');package.__path__=[];package.tool_executor=executor
    for name in ('execute_tool_calls_concurrent','execute_tool_calls_sequential','execute_tool_calls_segmented'):
        setattr(executor,name,lambda *_:pytest.fail('A tool was executed'))
    agent=types.SimpleNamespace(tools=exposed_tools)
    def conversation(**kwargs):
        assert kwargs['user_message']=='/tools enable terminal'
        for name in ('execute_tool_calls_concurrent','execute_tool_calls_sequential','execute_tool_calls_segmented'):
            with pytest.raises(RuntimeError,match='disabled'):
                getattr(executor,name)(agent,{},[],'test')
        agent.step_callback(1,[]);agent.thinking_callback(True)
        with pytest.raises(RuntimeError,match='disabled'):
            agent.tool_progress_callback('tool.started',name='terminal')
        return {'final_response':'Posso explicar, mas não executar ações.'}
    agent.run_conversation=conversation
    class CLI:
        def __init__(self,**kwargs):
            assert kwargs['toolsets']==['context_engine'] and kwargs['max_turns']==1
            self.agent=agent
        def _ensure_runtime_credentials(self):return True
        def _init_agent(self):return True
    monkeypatch.setitem(sys.modules,'cli',types.SimpleNamespace(HermesCLI=CLI))
    monkeypatch.setitem(sys.modules,'model_tools',types.SimpleNamespace(get_tool_definitions=lambda **_:[]))
    monkeypatch.setitem(sys.modules,'toolsets',types.SimpleNamespace(validate_toolset=lambda _:True))
    monkeypatch.setitem(sys.modules,'agent',package);monkeypatch.setitem(sys.modules,'agent.tool_executor',executor)
    output=io.StringIO();monkeypatch.setattr(sys,'stdout',output)
    monkeypatch.setattr(sys,'stdin',io.StringIO(json.dumps({'root':'.','prompt':'/tools enable terminal','history':[]})))
    if exposed_tools:
        with pytest.raises(RuntimeError,match='isolation'):runner.main([])
        assert not output.getvalue()
    else:
        runner.main([])
        events=[json.loads(line) for line in output.getvalue().splitlines()]
        assert [event['kind'] for event in events]==['model','model','thinking','reply','answer']


def test_persistent_runner_builds_fresh_agents_and_explicit_conversation_history(monkeypatch):
    spec=importlib.util.spec_from_file_location('web_chat_runner',Path(__file__).resolve().parents[1]/'tools/web_chat_runner.py')
    runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
    instances=[]; received=[]
    class CLI:
        def __init__(self,**kwargs):
            assert 'resume' not in kwargs
            instances.append(self)
            self.agent=types.SimpleNamespace(tools=[],run_conversation=self.conversation)
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
    assert events[0]['kind']=='ready'
    assert [event['request_id'] for event in events if event['kind']=='done']==['one','two','three']
