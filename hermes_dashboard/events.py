"""Read-only EVENTS catalog: existing cron jobs and Hermes webhook routes.

Hermes upstream stores static routes in platforms.webhook.extra.routes and
subscriptions in ~/.hermes/webhook_subscriptions.json. Credentials and prompts
are intentionally excluded from this public catalog.
"""
import json
from . import config, cron


def webhooks():
    cfg, config_error = config.load_config()
    platform = config.as_dict(config.as_dict(cfg.get('platforms')).get('webhook'))
    static = config.as_dict(config.as_dict(platform.get('extra')).get('routes'))
    path = config.HERMES_HOME / 'webhook_subscriptions.json'
    dynamic, error = {}, None
    try:
        if path.exists():
            value = json.loads(path.read_text(encoding='utf-8-sig'))
            if not isinstance(value, dict):
                raise ValueError('catálogo de subscriptions deve ser um mapa')
            dynamic = value
    except (OSError, ValueError) as exc:
        error = f'Não foi possível ler webhook_subscriptions.json: {type(exc).__name__}'
    routes = []
    # The upstream adapter gives static routes precedence over dynamic routes.
    for name, route in {**dynamic, **static}.items():
        if not isinstance(route, dict):
            continue
        events = route.get('events', [])
        routes.append({'id': str(name), 'name': str(name),
                       'description': str(route.get('description', ''))[:300],
                       'events': [str(e)[:100] for e in events] if isinstance(events, list) else [],
                       'profile': str(route.get('profile') or 'default'),
                       'enabled': bool(platform.get('enabled')) and route.get('enabled', True) is not False,
                       'cron_job': str(route.get('cron_job') or ''),
                       'source': 'config.yaml' if name in static else 'webhook_subscriptions.json'})
    return {'routes': sorted(routes, key=lambda r: r['name']),
            'available': bool(platform or path.exists()) and not error,
            'enabled': bool(platform.get('enabled')), 'error': error,
            'config_error': 'Configuração de webhooks indisponível' if config_error and not platform and not path.exists() else None}


def overview():
    return {**cron.overview(), 'webhooks': webhooks()}
