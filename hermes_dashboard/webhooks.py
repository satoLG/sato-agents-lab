"""Webhook history when an instrumented source exists.

Do not return request headers or bodies: the dashboard is publicly reachable.
"""
from . import db, state, events as event_catalog


def overview(limit=100):
    rows = []
    error = None
    if db.table_exists('webhook_logs'):
        try:
            rows = db.query('''SELECT timestamp, webhook_name, event_type,
                                      response_status, duration_ms, success
                               FROM webhook_logs ORDER BY timestamp DESC LIMIT ?''', (limit,))
        except db.DatabaseUnavailable as exc:
            error = str(exc)
    sessions = 0
    if state.available():
        with state.connect() as conn:
            sessions = conn.execute("SELECT COUNT(*) FROM sessions WHERE source='webhook'").fetchone()[0]
    return {'events': rows, 'total_visible': len(rows), 'webhook_sessions': sessions,
            'catalog': event_catalog.webhooks(),
            'source': 'events.db · webhook_logs', 'error': error,
            'warning': None if rows else 'Nenhuma requisição de webhook foi registrada na fonte estruturada. A ausência de registros não comprova ausência de tráfego.'}
