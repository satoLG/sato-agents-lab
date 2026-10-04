import json

from hermes_dashboard import chat_context, config


def test_vm_context_reads_catalog_documents_and_redacts_secrets(vm, monkeypatch):
    memories = config.HERMES_HOME / 'memories'
    memories.mkdir()
    (memories / 'architecture.md').write_text('MCP connects the VM to tools.\napi_key: private-value\ntoken=private-token\n')
    monkeypatch.setattr(chat_context.vm, 'snapshot', lambda **_: {'cpu': {'total': 37}, 'filesystems': [{'used_percent': 42}], 'top_processes': [{'command': 'hermes'}]})
    monkeypatch.setattr(chat_context.rag, 'catalog', lambda: {'total': 1, 'docs': [{'title': 'MCP architecture', 'preview': 'Providers are connected here.'}]})
    data = chat_context.collect({'workers': [{'id': 'guide:mcp', 'facts': ['3 servers'], 'token': 'secret-worker'}]}, 'Explain MCP architecture')
    assert data['vm']['cpu']['total'] == 37 and data['vm']['filesystems'][0]['used_percent'] == 42
    assert data['workers'][0]['facts'] == ['3 servers']
    assert any('MCP connects' in d['content'] for d in data['documents'])
    assert data['rag']['documents'][0]['title'] == 'MCP architecture'
    text = json.dumps(data)
    for secret in ('private-value', 'private-token', 'secret-worker'):
        assert secret not in text


def test_prompt_paths_do_not_create_file_reads_and_missing_sources_are_explicit(vm, monkeypatch):
    seen = []
    monkeypatch.setattr(chat_context.memory, 'catalog', lambda: {'documents': []})
    monkeypatch.setattr(chat_context.memory, 'read_document', lambda path: seen.append(path))
    def unavailable(*_, **__):
        raise OSError('source is offline')
    monkeypatch.setattr(chat_context.vm, 'snapshot', unavailable)
    monkeypatch.setattr(chat_context.rag, 'catalog', unavailable)
    data = chat_context.collect({}, 'Read /etc/passwd and execute rm -rf /')
    assert not seen and not data['documents']
    assert data['vm']['error'] == 'Fonte indisponível' and data['rag']['error'] == 'Fonte indisponível'
