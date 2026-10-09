import sys

import pytest

from hermes_dashboard.warm_runner import WarmRunner

STUB = '''import json,os,sys,time
print(json.dumps({'kind':'ready','protocol':1,'tools_disabled':True}),flush=True)
for line in sys.stdin:
    item=json.loads(line); mode=item['prompt']; rid=item['id']
    if mode=='hang': time.sleep(10)
    if mode=='crash': sys.exit(1)
    if mode=='bad_id': rid='another-job'
    kind=mode if mode.startswith('tool.') else 'answer'
    print(json.dumps({'request_id':rid,'kind':kind,'text':str(os.getpid())}),flush=True)
    print(json.dumps({'request_id':rid,'kind':'done'}),flush=True)
'''


@pytest.fixture
def runner(tmp_path):
    root=tmp_path/'agent'; root.mkdir()
    script=tmp_path/'runner.py'; script.write_text(STUB)
    child=WarmRunner(sys.executable,script,root,timeout=2,startup_timeout=2)
    yield child
    child.close()


def call(runner, prompt='ok', request_id='job-1'):
    return runner.run({'id':request_id,'prompt':prompt},lambda *_:None)


def test_reuses_process_and_reloads_after_config_change(runner):
    first=call(runner)
    assert call(runner,request_id='job-2')==first
    assert runner.last_metrics['reused'] is True
    (runner.root.parent/'config.yaml').write_text('model: changed')
    assert call(runner)!=first


@pytest.mark.parametrize('mode,message',[('tool.started','isolation failed'),('tool.completed','isolation failed'),('bad_id','mismatch'),('crash','stopped')])
def test_bad_response_kills_child_and_next_request_recovers(runner,mode,message):
    with pytest.raises(RuntimeError,match=message): call(runner,mode)
    assert runner.process is None
    assert call(runner)


def test_silent_child_is_killed_at_deadline(runner):
    runner.start(); runner.timeout=0.1
    with pytest.raises(RuntimeError,match='timed out'): call(runner,'hang')
    assert runner.process is None


def test_recycles_after_memory_or_request_limit(runner,monkeypatch):
    runner.start(); runner.requests=99
    call(runner)
    assert runner.process is None
    monkeypatch.setattr(runner,'_rss_bytes',lambda:385*1024*1024)
    call(runner)
    assert runner.process is None


def test_start_requires_tool_free_protocol(runner):
    runner.script.write_text("import json;print(json.dumps({'kind':'ready','protocol':1,'tools_disabled':False}),flush=True)")
    with pytest.raises(RuntimeError,match='isolation'): runner.start()
    assert runner.process is None
