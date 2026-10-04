import json
from datetime import datetime, timezone

from hermes_dashboard import chat_context, config


def test_vm_context_reads_catalog_documents_and_redacts_secrets(vm, monkeypatch):
    memories = config.HERMES_HOME / 'memories'
    memories.mkdir()
    (memories / 'architecture.md').write_text('MCP connects the VM to tools.\napi_key: private-value\ntoken=private-token\n')
    monkeypatch.setattr(chat_context.vm, 'snapshot', lambda **_: {'cpu': {'total': 37}, 'filesystems': [{'used_percent': 42}], 'top_processes': [{'command': 'hermes'}]})
    monkeypatch.setattr(chat_context.rag, 'catalog', lambda **_: {'total': 1, 'docs': [{'title': 'MCP architecture', 'preview': 'Providers are connected here.'}]})
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


def test_commit_ranking_counts_entire_catalog_and_deduplicates_urls():
    docs = [{'id': str(i), 'type': 'commit', 'repo': 'satoLG/a',
             'title': f'Commit {i}: historical change', 'preview': 'message',
             'updated': '2026-09-01T00:00:00Z', 'url': f'https://github.com/satoLG/a/commit/{i}'}
            for i in range(110)]
    docs += [{**docs[0], 'id': 'legacy-id'},
             {**docs[0], 'type': 'pr', 'id': 'pr', 'url': 'pr-url'},
             {**docs[0], 'repo': 'satoLG/b', 'id': 'old', 'url': 'old-url', 'updated': '2015-01-01T00:00:00Z'}]
    summary, matching = chat_context._commit_context(docs, 'Ranking dos commits nos últimos 3 meses',
                                                   datetime(2026, 10, 4, tzinfo=timezone.utc))
    assert summary['indexed_unique_commits'] == 111
    assert summary['matching_commits'] == len(matching) == 110
    assert summary['since'].startswith('2026-07-04')
    assert summary['by_repo'][0]['commit_count'] == 110
    assert len(summary['by_repo'][0]['examples']) == 8
    assert summary['by_repo'][0]['examples_are_partial']


def test_commit_filter_scopes_repository_and_explicit_dates():
    docs = [{'id': repo, 'type': 'commit', 'repo': f'satoLG/{repo}', 'title': 'Commit x',
             'updated': '2026-09-01T12:00:00Z', 'url': repo} for repo in ['portfolio', 'other']]
    summary, matching = chat_context._commit_context(docs, 'commits portfolio entre 2026-09-01 e 2026-09-01')
    assert len(matching) == 1 and summary['selected_repositories'] == ['satoLG/portfolio']


def test_collect_exposes_exact_counts_and_preserves_examples_through_scrubbing(vm, monkeypatch):
    docs = [{'id': str(i), 'type': 'commit', 'repo': 'satoLG/a', 'title': f'Commit {i}',
             'preview': 'Some message', 'updated': '2026-09-01T00:00:00Z', 'url': str(i)} for i in range(20)]
    monkeypatch.setattr(chat_context.memory, 'catalog', lambda: {})
    monkeypatch.setattr(chat_context.vm, 'snapshot', lambda **_: {})
    monkeypatch.setattr(chat_context.rag, 'catalog', lambda **_: {'total': 20, 'docs': docs})
    data = chat_context.collect({}, 'Todos os commits')
    assert data['rag']['commit_summary']['matching_commits'] == 20
    assert len(data['rag']['documents']) == 8
    assert data['rag']['documents_are_partial']
    assert data['rag']['commit_summary']['by_repo'][0]['examples'][0]['title'] is not None
