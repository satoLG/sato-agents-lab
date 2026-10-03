import { h, fmt, load, table, notice, empty } from './core.js';
import { stat } from './charts.js';

let body;
export function init(root) {
  body = root.querySelector('[data-role=webhooks]');
  refresh();
}
export function refresh() { return load(body, '/api/webhooks', render); }

function render(data) {
  const rows = data.events || [];
  const routes = data.catalog?.routes || [];
  return [
    h('div', { class: 'stat-grid' }, [
      stat('Registros recentes', fmt.num(rows.length)),
      stat('Sessões webhook', fmt.num(data.webhook_sessions || 0)),
      stat('Rotas configuradas', fmt.num(routes.length)),
    ]),
    data.catalog?.error ? notice(data.catalog.error) : null,
    data.error ? notice(data.error) : null,
    data.warning ? notice(data.warning) : null,
    h('div', { class: 'card' }, [
      h('header', {}, h('h2', { text: 'Rotas configuradas' })),
      routes.length ? table([
        { key: 'name', label: 'Rota' },
        { key: 'source', label: 'Origem' },
        { key: 'enabled', label: 'Ativa', render: r => r.enabled ? 'sim' : 'não' },
      ], routes) : empty('nenhuma rota configurada'),
    ]),
    h('div', { class: 'card' }, [
      h('header', {}, h('h2', { text: 'Histórico recente' })),
      rows.length ? table([
        { key: 'timestamp', label: 'Quando', render: r => fmt.dateTime(r.timestamp) },
        { key: 'webhook_name', label: 'Webhook' },
        { key: 'event_type', label: 'Evento' },
        { key: 'response_status', label: 'HTTP' },
        { key: 'duration_ms', label: 'Duração', render: r => fmt.ms(r.duration_ms) },
      ], rows, { scroll: true }) : empty('nenhum registro disponível'),
    ]),
  ];
}
