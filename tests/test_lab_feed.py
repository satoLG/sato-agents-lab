from hermes_dashboard import lab_feed


def test_native_history_does_not_invent_success_or_rag_runs(vm, monkeypatch):
    monkeypatch.setattr(lab_feed.state, 'available', lambda: True)
    monkeypatch.setattr(lab_feed.state, 'events', lambda **_: [dict(kind='tool_result',name='mcp__github__search',when='2026-10-03T10:00:00Z',ok=True)])
    monkeypatch.setattr(lab_feed.webhooks, 'overview', lambda: {'events': []})
    boards=lab_feed.boards({'events':{'data':{}}})
    assert boards['mcp']['rows'][0]['status']=='REGISTRADO'
    assert 'rag' not in boards


def test_cron_schedule_is_separate_from_execution_history(vm, monkeypatch):
    monkeypatch.setattr(lab_feed.state, 'available', lambda: True)
    monkeypatch.setattr(lab_feed.state, 'events', lambda **_: [])
    monkeypatch.setattr(lab_feed.webhooks, 'overview', lambda: {'events': []})
    data={'jobs':[dict(id='job1',enabled=True,next_run='2026-10-04T10:00:00Z'),dict(id='disabled',enabled=False,next_run='2026-10-04T09:00:00Z')],
          'executions':[dict(job_id='job1',start_time='2026-10-03T10:00:00Z',end_time='2026-10-03T10:01:00Z',exit_code=0)]}
    board=lab_feed.boards({'events':{'data':data}})['cron']
    assert len(board['upcoming'])==1 and board['upcoming'][0]['status']=='AGENDADO'
    assert board['rows'][0]['status']=='CONCLUÍDO'


def test_vm_telemetry_carries_fields_for_live_sistema_tab(vm, monkeypatch):
    # A aba Sistema atualiza CPU por core, memoria e swap a partir do SSE.
    monkeypatch.setattr(lab_feed, 'boards', lambda channels: {})
    data = lab_feed.collect()['channels']['vm']['data']
    assert {'total', 'cores', 'count'} <= set(data['cpu'])
    assert {'used_percent', 'used', 'total', 'swap_total', 'swap_used', 'swap_percent'} <= set(data['memory'])
    assert 'disk_breakdown' not in data
