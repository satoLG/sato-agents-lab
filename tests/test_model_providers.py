import sqlite3
from datetime import datetime, timezone


def test_native_usage_preserves_provider_and_tokens_for_the_same_model(client, vm):
    now=datetime.now(timezone.utc).timestamp()
    with sqlite3.connect(vm.hermes/'state.db') as conn:
        conn.executescript("""CREATE TABLE sessions(id TEXT,model TEXT,source TEXT);
            CREATE TABLE messages(id INTEGER,session_id TEXT,role TEXT,tool_name TEXT,tool_calls TEXT,timestamp REAL);
            CREATE TABLE session_model_usage(model TEXT,billing_provider TEXT,api_call_count INTEGER,
                input_tokens INTEGER,output_tokens INTEGER,actual_cost_usd REAL,estimated_cost_usd REAL,last_seen REAL);""")
        conn.executemany('INSERT INTO session_model_usage VALUES(?,?,?,?,?,?,?,?)',[
            ('shared-model','provider-a',2,100,20,.1,None,now),
            ('shared-model','provider-b',3,200,30,None,.2,now)])
    data=client.get('/api/stats').json
    assert data['total_calls']==5
    assert data['total_cost']==.3
    rows={r['provider']:r for r in data['models']}
    assert rows['provider-a']['calls']==2
    assert rows['provider-b']['input_tokens']==200
    assert rows['provider-b']['output_tokens']==30
    assert 'sessão' in data['note']


def test_legacy_usage_groups_by_provider_without_requiring_one_provider(client, vm):
    stamp=datetime.now(timezone.utc).isoformat()
    vm.db(['CREATE TABLE model_usage(timestamp TEXT,provider TEXT,model TEXT,input_tokens INTEGER,output_tokens INTEGER,cost_usd REAL)',
           'CREATE TABLE tool_calls(timestamp TEXT,tool_name TEXT)'],[
        ('INSERT INTO model_usage VALUES(?,?,?,?,?,?)',(stamp,'custom-a','same',10,2,.01)),
        ('INSERT INTO model_usage VALUES(?,?,?,?,?,?)',(stamp,'custom-b','same',20,3,.02))])
    data=client.get('/api/stats').json
    assert data['total_calls']==2
    assert {r['provider'] for r in data['models']}=={'custom-a','custom-b'}
    assert sum(r['input_tokens'] for r in data['models'])==30
