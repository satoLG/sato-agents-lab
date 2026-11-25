# kanbagent

Página própria do site (`/kanbagent`) com o kanban pessoal do Sato: leva cada ideia da concepção até a
entrega, com datas e tempo corrido por etapa, organizado por projeto e por repositório. Decisão e
limites em [ADR 0009](adr/0009-kanbagent-pagina-com-escrita-protegida.md).

## Problema

Ideias chegam soltas (conversa, Telegram) e hoje só têm uma saída: virar issue num repositório que já
existe. Isso não serve para ideia ainda crua, para projeto novo sem repositório, nem para enxergar
quanto tempo as coisas levam e onde emperram.

## Ciclo do card

| Etapa | Entra quando | Quem move |
|---|---|---|
| `ideia` | a ideia é anotada | Sato (página) ou Hermes (API, a partir do Telegram) |
| `proposta` | o Sato Agent escreve/reescreve a proposta | Hermes (API) |
| `revisao` | proposta pronta para o Sato avaliar | Hermes (API) |
| `aprovado` (rótulo "Fila de execução") | Sato aprova; espera ser pego para executar | Sato (página) |
| `execucao` | issue criada / worker começou | sync com GitHub |
| `revisao_codigo` | PR aberto | sync com GitHub |
| `entregue` | PR mergeado ou issue fechada como concluída | sync com GitHub |
| `descartado` | Sato descarta (de qualquer etapa antes de `entregue`) | Sato (página) |

Voltas permitidas (cada uma conta como ajuste e fica registrada):

- `proposta → ideia` (comentário opcional) e `revisao → ideia` (comentário obrigatório): voltar para
  complementar a ideia; ao ir de novo para `proposta` o Hermes refaz em cima de tudo que já foi escrito.
- `revisao → proposta` ("Pedir ajuste", comentário obrigatório).
- `revisao_codigo → execucao` ("Reprovar", comentário obrigatório).

Depois que a execução começa não existe volta para ideia/proposta: só o ciclo
`execucao ⇄ revisao_codigo` até `entregue`, ou `descartado`. Proposta vazia não vai para `revisao`
(exceto pelo sync com o GitHub, que pula etapas). Na página os cards se arrastam entre as listas e só
acendem as listas permitidas por essas regras (no celular: segurar o card e arrastar).

### Hermes escreve a proposta

Quando o Sato leva um card para `proposta` (arrastando, pelo botão "Pedir proposta ao Hermes" ou pela
volta "Pedir ajuste"), entra um pedido na tabela `agent_jobs` e o card **trava** para o Sato até o
Hermes terminar (dá para abrir os detalhes, não para mover ou editar). O site dispara
`python -m hermes_dashboard.kanbagent_hermes` (via `systemd-run --user`, para não morrer num restart);
o crontab roda o mesmo comando a cada 2 minutos para pegar o que sobrar. O worker roda
`hermes chat --oneshot -s kanbagent-proposta --format stream-json`, anota cada passo como progresso
(o quadro mostra "propondo… lendo o card" ao vivo) e o Hermes grava pela API, levando o card para
`revisao`, o que fecha o pedido. Se ele sair sem gravar, travar mais de 20 min ou der erro, o pedido
falha, o card destrava e mostra o motivo com "↻ Pedir de novo". Ao voltar para `ideia` e ir de novo
para `proposta`, o Hermes reescreve em cima de tudo que já foi escrito.

## Modelo de dados (banco próprio `kanbagent.sqlite3`)

- `projects` — slug, nome, descrição, criado_em, arquivado_em.
- `repos` — full_name (`owner/repo`).
- `project_repos` — projeto ↔ repositório (N:N; um projeto pode envolver vários repos).
- `cards` — projeto, repo opcional (do projeto), título, `ideia_original` (nunca sobrescrita),
  proposta (markdown), `etapa_atual` (cache), criado_em, atualizado_em.
- `card_links` — issues/PRs ligados ao card (repo, número, url, estado conhecido).
- `events` — `stage_change` | `comment` | `link_added` | `proposal_updated`, de/para etapa, autor
  (`sato` | `hermes` | `github-sync`), texto, `occurred_at` UTC. **Só INSERT.**

## Regras

1. **Eventos são a fonte da verdade do tempo.** `etapa_atual` é cache do último `stage_change`,
   gravado na mesma transação. Durações e métricas saem sempre de `events`; correção é evento novo.
2. **Uma única função de transições** (`can_transition`), usada pela página, pela API e pelo sync.
   Transição inválida → 409.
3. **Idempotência**: sync com o GitHub repetido ou atrasado não duplica evento; criações pela API aceitam
   ID do cliente (como a fila do chat, ADR 0004).
4. **UTC no banco**, exibição em `America/Sao_Paulo`.
5. Migrações só aditivas.

## Métricas (primeira versão)

Tempo corrido por etapa e total (ideia → entregue); por projeto e repositório: tempo médio por etapa,
onde os cards ficam parados, entregues no período, voltas de ajuste. Esforço real (tempo ativo) fica
fora da primeira versão.

## O que existe

- Páginas (login do site): `/kanbagent` (quadro com filtros por projeto/repo e "Nova ideia"),
  `/kanbagent/card/<id>` (ideia, proposta editável, aprovar / pedir ajuste / descartar, links do GitHub,
  linha do tempo e tempo por etapa), `/kanbagent/metricas`, `/kanbagent/projetos`. Funciona sem JS;
  `static/js/kanbagent.js` só adiciona conforto (filtro automático, confirmação de descarte).
- API JSON em `/kanbagent/api/...` (`projects`, `cards`, `cards/<id>`, `cards/<id>/proposal|stage|comments|links`,
  `metrics`, `sync`). Aceita a sessão do site (com `X-Chat-CSRF`) ou `Authorization: Bearer
  $KANBAGENT_API_TOKEN`; sem token configurado no servidor, a via por token fica fechada (503). Pelo
  token, o autor registrado é `hermes`.
- Sync: `python -m hermes_dashboard.kanbagent_sync` (cron) ou o botão "Sincronizar GitHub". Só mexe em
  cards de `aprovado` em diante, usa as datas do GitHub e pode rodar quantas vezes quiser.

## Ordem de construção

Feito: módulo de domínio, API com token, página com quadro/detalhe/métricas/projetos e sync.

Fora deste repo (no Hermes): skill "anota" (Telegram → card em `ideia`) e skill de proposta do Sato
Agent (lê card + repos + `estilo-sato.md`, escreve em pt-BR, move para `revisao`). Acesso: o login que o
site já tem (senha do chat) protege dashboard e kanbagent; só a home é pública — ver ADR 0010.
