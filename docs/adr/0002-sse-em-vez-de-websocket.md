# 0002. Usar SSE para tempo real, não WebSocket

- Status: Aceito
- Data: 2026-11-22 (registra decisão já em vigor)

## Contexto
Dashboard e chat precisam de atualização ao vivo. O fluxo é quase todo
servidor → navegador; o navegador só envia perguntas e logins.

## Decisão
Server-Sent Events: um `EventSource` por página (`/api/lab/stream`, compartilhado
pelas abas em `dashboard-live.js`) e `/api/lab/hermes-chat/stream` para o chat.
Ações do usuário são POST. O broadcaster (`streaming.py`) envia `id:` por versão,
heartbeat a cada 15 s e só os canais que mudaram.

## Consequências
- Funciona no Flask síncrono, sem biblioteca extra; atravessa proxy/túnel como HTTP.
- Reconexão automática do navegador.
- Cada aba aberta segura uma conexão; aceitável com poucos visitantes.

## Alternativas consideradas
- WebSocket: exige servidor assíncrono e dependência nova, sem necessidade bidirecional.
- Só polling: mais requisições e atraso visível; mantido apenas no fragmento
  "processando agora" (HTMX, 3 s).

## Revisitar quando
Surgir interação bidirecional contínua (controle remoto do agente, edição
colaborativa) ou muitas conexões simultâneas.
