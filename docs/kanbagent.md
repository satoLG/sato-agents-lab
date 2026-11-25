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
| `aprovado` | Sato aprova | Sato (página) |
| `execucao` | issue criada / worker começou | sync com GitHub |
| `revisao_codigo` | PR aberto | sync com GitHub |
| `entregue` | PR mergeado ou issue fechada como concluída | sync com GitHub |
| `descartado` | Sato descarta (de qualquer etapa antes de `entregue`) | Sato (página) |

"Pedir ajuste" é `revisao → proposta`, com comentário obrigatório do Sato. Cada volta fica registrada.

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

## Ordem de construção

Uma issue por vez para o worker do Claude; a próxima só depois do merge da anterior.

1. Módulo `hermes_dashboard/kanbagent.py`: banco, migrações, transições, testes.
2. API para o Hermes (`/kanbagent/api/...`) com token.
3. Página `/kanbagent` (HTMX): colunas, filtros por projeto/repo, criar card, aprovar, pedir ajuste,
   descartar.
4. Detalhe do card e linha do tempo com tempos por etapa.
5. Sync com o GitHub (issues/PRs → `execucao`, `revisao_codigo`, `entregue`).
6. Métricas por projeto/repositório.

Fora deste repo (no Hermes): skill "anota" (Telegram → card em `ideia`) e skill de proposta do Sato
Agent (lê card + repos + `estilo-sato.md`, escreve em pt-BR, move para `revisao`). O Sato configura o
Cloudflare Access para o caminho `/kanbagent` antes de o PR da página ir para produção.
