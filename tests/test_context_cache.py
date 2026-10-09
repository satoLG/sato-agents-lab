from concurrent.futures import ThreadPoolExecutor

import pytest

from hermes_dashboard import chat_context, config
from hermes_dashboard.context_cache import SourceCache


def test_expiration_version_and_copy_isolation(monkeypatch):
    clock=[0.0]
    monkeypatch.setattr('hermes_dashboard.context_cache.time.monotonic',lambda:clock[0])
    cache=SourceCache(); calls=[]
    def produce():
        calls.append(1)
        return {'items':[len(calls)]}
    data,meta=cache.get('source',1,30,produce)
    data['items'].append('changed')
    assert cache.get('source',1,30,produce)[0]=={'items':[1]}
    assert cache.get('source',1,30,produce)[1]['cached'] is True
    clock[0]=30
    assert cache.get('source',1,30,produce)[0]=={'items':[2]}
    assert cache.get('source',2,30,produce)[0]=={'items':[3]}


def test_failure_does_not_serve_old_value_or_cache_error():
    cache=SourceCache()
    cache.get('source',1,30,lambda:{'value':'old'})
    def unavailable():raise OSError('gone')
    with pytest.raises(OSError):cache.get('source',2,30,unavailable)
    assert not cache.entries
    cache.get('source',2,30,lambda:{'error':'unavailable'})
    assert not cache.entries
    assert cache.get('source',2,30,lambda:{'value':'recovered'})[0]['value']=='recovered'


def test_concurrent_fill_and_memory_bounds():
    cache=SourceCache(max_bytes=1024,max_entries=2); calls=[]
    def fetch():return cache.get('shared',1,30,lambda:calls.append(1) or {'value':'same'})
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda _:fetch(),range(8)))
    assert len(calls)==1
    for i in range(8):cache.get(i,1,30,lambda:{'value':'x'*100})
    assert len(cache.entries)<=2 and cache.bytes<=1024
    cache.get('big',1,30,lambda:{'value':'x'*2000})
    assert 'big' not in cache.entries


def test_documents_invalidate_immediately_telemetry_stays_live_and_cache_is_redacted(vm,monkeypatch):
    folder=config.HERMES_HOME/'memories';folder.mkdir()
    path=folder/'architecture.md';path.write_text('Architecture first.\napi_key: hidden-first\n')
    readings=iter([10,20,30]); rag_calls=[]; reads=[]
    monkeypatch.setattr(chat_context.vm,'snapshot',lambda **_: {'cpu':{'total':next(readings)}})
    monkeypatch.setattr(chat_context.rag,'catalog',lambda **_:rag_calls.append(1) or {'docs':[],'total':0})
    original=chat_context.memory.read_document
    def read(path):reads.append(path);return original(path)
    monkeypatch.setattr(chat_context.memory,'read_document',read)
    first=chat_context.collect({},'architecture')
    second=chat_context.collect({},'architecture')
    assert first['vm']['cpu']['total']==10 and second['vm']['cpu']['total']==20
    assert len(rag_calls)==1 and reads.count(str(path))==1
    assert 'hidden-first' not in str(chat_context.CACHE.entries)
    path.write_text('Architecture changed immediately.\napi_key: hidden-second\n')
    third=chat_context.collect({},'architecture')
    assert any('changed immediately' in doc['content'] for doc in third['documents'])
    assert reads.count(str(path))==2 and 'hidden-second' not in str(chat_context.CACHE.entries)


def test_rag_manifest_change_refreshes_whole_catalog(vm,monkeypatch):
    versions=config.RAG_PATH/(chat_context.rag.TABLE+'.lance')/'_versions';versions.mkdir(parents=True)
    monkeypatch.setattr(chat_context.memory,'catalog',lambda:{})
    monkeypatch.setattr(chat_context.vm,'snapshot',lambda **_: {})
    docs=[{'type':'commit','title':'A','repo':'owner/a','url':'first'}]
    monkeypatch.setattr(chat_context.rag,'catalog',lambda **_: {'docs':list(docs),'total':len(docs)})
    first=chat_context.collect({},'commits')
    docs.append({'type':'commit','title':'B','repo':'owner/a','url':'second'})
    assert chat_context.collect({},'commits')['rag']['total']==1
    (versions/'2.manifest').write_text('new version')
    refreshed=chat_context.collect({},'commits')
    assert first['rag']['total']==1 and refreshed['rag']['total']==2
    assert refreshed['rag']['commit_summary']['matching_commits']==2


def test_cached_document_never_bypasses_changed_symlink_permissions(vm,tmp_path):
    folder=config.HERMES_HOME/'contexts';folder.mkdir()
    allowed=folder/'allowed.md';allowed.write_text('Allowed content')
    link=folder/'link.md'
    try:link.symlink_to(allowed)
    except OSError:pytest.skip('symlinks not supported')
    assert chat_context._document(str(link))['content']=='Allowed content'
    outside=tmp_path.parent/'outside-cache-test.md';outside.write_text('Private outside content')
    try:
        link.unlink();link.symlink_to(outside)
        with pytest.raises(ValueError):chat_context._document(str(link))
    finally:outside.unlink()
