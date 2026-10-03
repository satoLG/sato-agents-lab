"""Read the Hermes state database without copying private message contents.

The legacy events.db is optional. Hermes itself persists messages, tool results,
sessions and usage in state.db, which is the authoritative history on this VM.
"""
import sqlite3
from datetime import datetime, timezone, timedelta

from . import config


def available():
    if not config.STATE_DB_PATH.is_file():
        return False
    try:
        with connect() as conn:
            tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        return {'messages', 'sessions'} <= tables
    except sqlite3.Error:
        return False


def connect():
    conn = sqlite3.connect(f'file:{config.STATE_DB_PATH}?mode=ro', uri=True, timeout=3)
    conn.row_factory = sqlite3.Row
    return conn


def _kind(row):
    if row['role'] == 'user':
        return 'prompt'
    if row['role'] == 'tool':
        return 'tool_result'
    if row['tool_calls'] not in (None, '', '[]'):
        return 'tool'
    return 'response'


def _event(row):
    kind = _kind(row)
    name = {'prompt': 'Prompt recebido', 'response': 'Resposta do Hermes',
            'tool': 'Chamada de ferramenta', 'tool_result': 'Retorno da ferramenta'}[kind]
    if kind == 'tool_result' and row['tool_name']:
        name = row['tool_name']
    elif kind == 'tool' and row['tool_calls']:
        # Tool arguments may contain secrets; use the function name only.
        import json
        try:
            calls = json.loads(row['tool_calls'])
            name = ', '.join(str(c.get('function', {}).get('name') or 'tool')
                             for c in calls if isinstance(c, dict))[:160] or name
        except (ValueError, TypeError):
            pass
    return {
        'kind': kind, 'when': row['when_utc'],
        'clock': row['when_utc'][11:19] if row['when_utc'] else '',
        'name': name, 'model': row['model'],
        'provider': None, 'duration_ms': None,
        'input_tokens': None, 'output_tokens': None, 'cost_usd': None,
        'ok': True, 'error': '', 'source': row['source'] or 'unknown',
    }


_SELECT = """SELECT m.role, m.tool_name, m.tool_calls, s.model, s.source,
                   strftime('%Y-%m-%dT%H:%M:%SZ', m.timestamp, 'unixepoch') AS when_utc
            FROM messages m LEFT JOIN sessions s ON s.id = m.session_id
            WHERE m.role IN ('user', 'assistant', 'tool')"""


def events(start=None, end=None, limit=500):
    where, params = '', []
    if start is not None:
        where += ' AND m.timestamp >= ?'
        params.append(start)
    if end is not None:
        where += ' AND m.timestamp < ?'
        params.append(end)
    with connect() as conn:
        rows = conn.execute(_SELECT + where + ' ORDER BY m.timestamp DESC, m.id DESC LIMIT ?',
                            (*params, limit)).fetchall()
    return [_event(r) for r in rows]


def heatmap(days=365, kinds=None):
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days-1)
    since = datetime.combine(start, datetime.min.time(), timezone.utc).timestamp()
    with connect() as conn:
        rows = conn.execute("""SELECT date(m.timestamp, 'unixepoch') AS day, m.role,
                                      (m.tool_calls IS NOT NULL AND m.tool_calls != ''
                                       AND m.tool_calls != '[]') AS calls, COUNT(*) AS n
                               FROM messages m WHERE m.timestamp >= ?
                                 AND m.role IN ('user', 'assistant', 'tool')
                               GROUP BY day, m.role, calls""", (since,)).fetchall()
    counts = {}
    totals = {}
    for row in rows:
        kind = ('prompt' if row['role'] == 'user' else
                'tool_result' if row['role'] == 'tool' else
                'tool' if row['calls'] else 'response')
        if kinds and kind not in kinds:
            continue
        bucket = counts.setdefault(row['day'], {})
        bucket[kind] = bucket.get(kind, 0) + row['n']
        totals[kind] = totals.get(kind, 0) + row['n']
    out = []
    for i in range(days):
        date = (start + timedelta(days=i)).isoformat()
        by = counts.get(date, {})
        out.append({'date': date, 'total': sum(by.values()), 'kinds': by})
    labels = {'prompt': 'Prompts', 'response': 'Respostas',
              'tool': 'Chamadas de ferramenta', 'tool_result': 'Retornos de ferramenta'}
    return {'start': start.isoformat(), 'end': today.isoformat(), 'days': out,
            'max': max((d['total'] for d in out), default=0),
            'total': sum(totals.values()), 'by_kind': totals,
            'series': [{'kind': k, 'label': v} for k, v in labels.items()
                       if not kinds or k in kinds],
            'source': 'Hermes state.db'}


def day_activity(day, kinds=None, limit=500):
    date = datetime.strptime(day, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    rows = events(date.timestamp(), (date + timedelta(days=1)).timestamp(), 100000)
    rows = [r for r in rows if not kinds or r['kind'] in kinds]
    total = len(rows)
    by = {}
    for row in rows:
        by[row['kind']] = by.get(row['kind'], 0) + 1
    rows = rows[:limit]
    return {'date': day, 'events': rows, 'count': total, 'by_kind': by,
            'cost_usd': 0, 'errors': 0, 'source': 'Hermes state.db',
            'truncated': total > limit}


def tool_rows(days=30):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).timestamp()
    with connect() as conn:
        return [dict(r) for r in conn.execute("""SELECT m.tool_name,
                      strftime('%Y-%m-%dT%H:%M:%SZ', m.timestamp, 'unixepoch') AS timestamp
                      FROM messages m WHERE m.role='tool'
                      AND m.timestamp >= ? AND m.tool_name IS NOT NULL
                      ORDER BY m.timestamp DESC""", (since,))]


def model_usage(days=30, since=None):
    since = since if since is not None else (datetime.now(timezone.utc) - timedelta(days=days)).timestamp()
    with connect() as conn:
        return [dict(r) for r in conn.execute("""SELECT model, billing_provider,
                      SUM(api_call_count) AS calls, SUM(input_tokens) AS input_tokens,
                      SUM(output_tokens) AS output_tokens,
                      SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)) AS cost,
                      MAX(last_seen) AS last_seen
                      FROM session_model_usage WHERE last_seen >= ?
                      GROUP BY model, billing_provider ORDER BY calls DESC""", (since,))]
