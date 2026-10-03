"""Hermes native databases remain readable when the old events.db is stale."""
import json
import sqlite3
from datetime import datetime, timezone


def test_native_history_drives_activity_tools_mcp_and_cron(client, vm):
    now = datetime.now(timezone.utc).timestamp()
    conn = sqlite3.connect(vm.hermes / 'state.db')
    conn.executescript('''
        CREATE TABLE sessions (id TEXT PRIMARY KEY, model TEXT, source TEXT);
        CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT, role TEXT,
                               content TEXT, tool_name TEXT, tool_calls TEXT,
                               timestamp REAL);
        CREATE TABLE session_model_usage (model TEXT, billing_provider TEXT,
            api_call_count INTEGER, input_tokens INTEGER, output_tokens INTEGER,
            actual_cost_usd REAL, estimated_cost_usd REAL, last_seen REAL);
    ''')
    conn.execute('INSERT INTO sessions VALUES (?,?,?)', ('s1', 'test-model', 'cron'))
    call = json.dumps([{'function': {'name': 'mcp__calendar__list',
                                      'arguments': '{"password":"private"}'}}])
    conn.executemany('INSERT INTO messages VALUES (?,?,?,?,?,?,?)', [
        (1, 's1', 'user', 'private prompt', None, None, now-4),
        (2, 's1', 'assistant', '', None, call, now-3),
        (3, 's1', 'tool', 'private result', 'mcp__calendar__list', None, now-2),
        (4, 's1', 'assistant', 'private answer', None, None, now-1),
    ])
    conn.execute('INSERT INTO session_model_usage VALUES (?,?,?,?,?,?,?,?)',
                 ('test-model', 'provider', 2, 100, 40, None, 0.01, now))
    conn.commit()
    conn.close()
    vm.cron(jobs_text=json.dumps({'jobs': [{'id': 'j1', 'name': 'job', 'prompt': 'private job',
        'schedule': {'display': 'every day'}, 'next_run_at': '2026-10-04T10:00:00Z'}]}),
        executions_ddl=["""CREATE TABLE executions (job_id TEXT, started_at TEXT,
                            finished_at TEXT, status TEXT)""",
                        """INSERT INTO executions VALUES ('j1', '2026-10-02T10:00:00+00:00',
                            '2026-10-02T10:00:04+00:00', 'completed')"""])

    heat = client.get('/api/activity/heatmap?days=30').json
    assert heat['total'] == 4
    assert heat['by_kind'] == {'prompt': 1, 'tool': 1, 'tool_result': 1, 'response': 1}
    day = client.get('/api/activity/day/' + datetime.now(timezone.utc).date().isoformat()).json
    assert day['count'] == 4
    assert 'private' not in json.dumps(day)
    live = client.get('/api/live').json
    assert len(live['events']) == 4
    assert client.get('/api/tools').json['total_calls'] == 1
    assert client.get('/api/mcps').json['total_calls'] == 1
    assert client.get('/api/stats').json['total_calls'] == 2
    cron = client.get('/api/cronjobs').json
    assert cron['total_runs'] == 1
    assert cron['jobs'][0]['schedule'] == 'every day'
    assert 'private job' not in json.dumps(cron)
