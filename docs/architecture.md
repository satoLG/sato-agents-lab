# Arquitetura e princípios

Regras para qualquer mudança neste repositório, feita por pessoa ou agente.
Cada princípio tem um ADR com o porquê em [`docs/adr/`](adr/README.md).
Se uma mudança precisa quebrar um princípio, escreva um ADR novo que o substitua
no mesmo PR; não quebre em silêncio.

## Visão geral

```
navegador ──HTTP/SSE──> Flask (app.py, um processo) ──> hermes_dashboard/*
                                │                         ├─ leituras read-only: events.db, state.db,
                                │                         │  ~/.hermes, /proc, LanceDB
                                │                         └─ web_chat: fila SQLite própria
                                └─ worker do chat ──> warm_runner ──> processo Hermes sem tools
```

Uma máquina, um serviço (`hermes-dashboard.service`), sem orquestrador, sem
serviços externos além do provedor de modelo do Hermes.

## Princípios

1. **Monólito modular.** Um app Flask; cada domínio é um módulo em
   `hermes_dashboard/`, rotas finas em `app.py`. Nada de serviço novo,
   broker ou container sem ADR. → [ADR 0001](adr/0001-monolito-modular.md)
2. **Servidor → navegador por SSE.** Tempo real é um único stream por página;
   ações do usuário são POST. Sem WebSocket. → [ADR 0002](adr/0002-sse-em-vez-de-websocket.md)
3. **Menor privilégio fora do modelo.** O chat público não tem tools e recebe
   contexto já selecionado e redigido pelo servidor. Regras de segurança ficam em
   código testado, nunca só em prompt. → [ADR 0003](adr/0003-chat-sem-tools-e-contexto-no-servidor.md)
4. **Trabalho lento passa por fila durável e idempotente.** Lease, tentativas
   limitadas com backoff, limite de fila (429) e ID do cliente para repetir sem
   duplicar. → [ADR 0004](adr/0004-fila-duravel-em-sqlite.md)
5. **Cache de fontes, com invalidação explícita.** TTL curto + invalidação por
   mudança na origem; idade da fonte visível; nunca reaproveitar cópia expirada em
   silêncio; nunca cachear respostas do modelo. → [ADR 0005](adr/0005-cache-de-fontes.md)
6. **Front sem build obrigatório e sem CDN.** ES modules + HTMX; dependências
   empacotadas em `static/vendor/` com licença; sem framework SPA.
   → [ADR 0006](adr/0006-front-vendorizado-sem-framework.md)
7. **Deploy por pull seguro.** Só fast-forward da `main`, validação em cópia,
   rollback automático; merge só pelo dono. → [ADR 0007](adr/0007-deploy-por-pull-com-rollback.md)
8. **Observabilidade read-only e tolerante.** O dashboard nunca escreve nas
   fontes do Hermes, descobre schema em runtime e mostra "sem dados" em vez de 5xx;
   nunca expõe segredos, headers ou corpos. → [ADR 0008](adr/0008-dashboard-read-only-tolerante.md)

## Checklist de design para PRs e issues

Responda no PR (ou na issue, em "Requisitos não funcionais") quando se aplicar:

- **Falha**: o que acontece se a dependência cair, demorar ou devolver lixo?
  Toda chamada externa (`subprocess`, rede, SQLite) tem `timeout`.
- **Repetição**: a operação pode rodar duas vezes (retry, duplo clique, cron
  atrasado) sem duplicar efeito?
- **Estado**: onde fica, quem escreve, como migra sem perder dados (migrações só
  aditivas)?
- **Cache**: qual TTL, o que invalida, a idade aparece para quem consome?
- **Limites**: memória, tamanho de payload, itens por página, tamanho da fila,
  custo em tokens. Números, não adjetivos.
- **Segurança**: o que chega ao modelo ou ao navegador passou por redação?
  Rota nova exige auth? Entrada do visitante é tratada como não confiável?
- **Movimento/UI**: respeita `prefers-reduced-motion`; teste Playwright mede o
  comportamento (posição, frames, visibilidade), não só que "carregou".
- **Observabilidade**: o erro aparece em log/painel sem vazar conteúdo privado?

## Orçamentos atuais (estimativa de envelope)

| Recurso | Limite |
|---|---|
| Processo Hermes do chat | recicla após 100 pedidos ou RSS > 384 MiB; timeout 240 s |
| Cache de contexto | 30 s, 48 entradas, 16 MiB serializados |
| Fila do chat | 3 tentativas, backoff quadrático (15 s × n²); 429 quando cheia |
| Login do chat | 12 tentativas por 15 min |
| `subprocess` do dashboard | 5–8 s por chamada (`du`, `ps`, `crontab`) |
| Cena 3D | 30 fps, DPR ≤ 1,75 |
| Histórico do chat | páginas de 40 mensagens |

Mudou um desses números? Atualize esta tabela no mesmo PR.
