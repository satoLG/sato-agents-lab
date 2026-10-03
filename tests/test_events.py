import json
from hermes_dashboard import events, config


def test_webhooks_merge_real_hermes_stores_and_never_expose_credentials(tmp_path, monkeypatch):
    monkeypatch.setattr(config, 'HERMES_HOME', tmp_path)
    monkeypatch.setattr(config, 'CONFIG_PATH', tmp_path / 'config.yaml')
    (tmp_path / 'config.yaml').write_text('''platforms:
  webhook:
    enabled: true
    extra:
      routes:
        github:
          secret: STATIC_SECRET
          prompt: PRIVATE_PROMPT
          events: [pull_request]
          cron_job: review
''')
    (tmp_path / 'webhook_subscriptions.json').write_text(json.dumps({
        'github': {'secret': 'DYNAMIC_SECRET', 'events': ['wrong']},
        'deploy': {'secret': 'HOOK_SECRET', 'auth': 'TOKEN', 'profile': 'lab', 'events': ['push']},
    }))
    data = events.webhooks()
    assert data['available'] and data['enabled']
    assert len(data['routes']) == 2
    assert next(r for r in data['routes'] if r['id'] == 'github')['events'] == ['pull_request']
    assert 'SECRET' not in json.dumps(data) and 'TOKEN' not in json.dumps(data) and 'PRIVATE_PROMPT' not in json.dumps(data)


def test_missing_and_malformed_webhook_sources_are_explicit(tmp_path, monkeypatch):
    monkeypatch.setattr(config, 'HERMES_HOME', tmp_path)
    monkeypatch.setattr(config, 'CONFIG_PATH', tmp_path / 'missing.yaml')
    assert events.webhooks()['available'] is False
    (tmp_path / 'webhook_subscriptions.json').write_text('[1,2]')
    data = events.webhooks()
    assert not data['available'] and data['error'] and not data['routes']


def test_disabled_platform_does_not_claim_routes_are_active(tmp_path, monkeypatch):
    monkeypatch.setattr(config, 'HERMES_HOME', tmp_path)
    monkeypatch.setattr(config, 'CONFIG_PATH', tmp_path / 'config.yaml')
    (tmp_path / 'config.yaml').write_text('platforms: {webhook: {enabled: false, extra: {routes: {ping: {}}}}}')
    assert events.webhooks()['routes'][0]['enabled'] is False


def test_events_endpoint_preserves_cron_and_adds_sanitized_webhooks(client, vm, monkeypatch):
    monkeypatch.setattr(events.cron, '_system_crontab', lambda: [])
    monkeypatch.setattr(events.cron, '_systemd_timers', lambda: [])
    vm.cron('[{"id":"nightly","schedule":"0 2 * * *","enabled":true}]')
    vm.config_yaml('platforms: {webhook: {enabled: true, extra: {routes: {ping: {secret: DO_NOT_EXPOSE}}}}}')
    response = client.get('/api/events')
    assert response.status_code == 200
    assert response.json['jobs'][0]['id'] == 'nightly'
    assert response.json['webhooks']['routes'][0]['id'] == 'ping'
    assert b'DO_NOT_EXPOSE' not in response.data
    state=client.get('/api/lab/state').json
    assert any(w['kind']=='webhook' and w['sector']=='cron' for w in state['workers'])
    assert next(s for s in state['sectors'] if s['id']=='cron')['name']=='EVENTS'


def test_monitor_rag_summary_keeps_counts_without_document_bodies(client, monkeypatch):
    from hermes_dashboard import rag
    monkeypatch.setattr(rag, 'catalog', lambda: {'docs': [{'text':'long document'}], 'total':1, 'by_repo':[], 'by_type':{'doc':1}})
    assert client.get('/api/rag/list?summary=1').json == {'total':1, 'by_repo':[], 'by_type':{'doc':1}}
    assert client.get('/api/rag/list').json['docs'] == [{'text':'long document'}]
