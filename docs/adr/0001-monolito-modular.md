# 0001. Manter um monólito modular em Flask

- Status: Aceito
- Data: 2026-11-22 (registra decisão já em vigor)

## Contexto
O projeto roda numa única máquina, junto do Hermes, com um dono e agentes
contribuindo. Tráfego baixo; o gargalo é o modelo, não o servidor web.

## Decisão
Um único app Flask (`app.py` com rotas finas) e um módulo por domínio em
`hermes_dashboard/`. Workers em background (fila do chat, telemetria) rodam no
mesmo serviço.

## Consequências
- Deploy, logs e testes simples; um `pytest` cobre tudo.
- Fronteiras dependem de disciplina: módulos de domínio não importam `app.py`;
  `app.py` só traduz HTTP.
- Uma falha grave derruba tudo; mitigado por timeouts e pelo rollback do deploy (ADR 0007).

## Alternativas consideradas
- Microsserviços (chat, telemetria, RAG separados): custo operacional sem ganho
  de escala numa máquina só.
- Framework assíncrono (FastAPI): não resolve gargalo real; reescrita alta.

## Revisitar quando
O chat precisar escalar além de uma máquina, ou um módulo exigir ciclo de deploy próprio.
