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

## Repositório e referências do card

Ao anotar a ideia, o repositório vem da lista do GitHub do Sato (`kanbagent_github.py`, cache de 10 min,
mesmo token do executor) ou é um **repositório novo** (privado por padrão), que o executor cria antes de
planejar. O repositório só muda até a proposta ser aprovada; depois fica fixo. Issues e PRs não são
ligados à mão: nascem do fluxo. Links e arquivos de referência entram enquanto a ideia amadurece
(ideia, proposta, revisão) e seguem com o card.

## Claude executa o card (níveis por tarefa)

Levar um card da Fila de execução para `execucao` (ou reprovar a entrega em `revisao_codigo`) exige
repositório ligado e abre um pedido `execucao`; o card trava e o quadro mostra "executando… <passo>".
O worker `python -m hermes_dashboard.kanbagent_exec` (disparado como o do Hermes, crontab a cada 5 min)
repete a segurança do worker de issues: clona como o usuário do site, roda o Claude Code como `agent`
(sem sudo e sem token do GitHub) numa cópia, traz os commits por `git bundle` e publica o branch
`kanbagent/card-N`.

1. **Plano**: o Sonnet (ou o Opus quando a proposta diz "Tamanho: grande") lê `CARD.md` e o
   repositório e escreve `PLAN.json`: mini tarefas autocontidas, cada uma com nível
   `free | haiku | sonnet | opus` pela regra objetiva (`RUBRIC` em `kanbagent_exec.py`; na dúvida o
   mais barato) e um comando de checagem. O plano vira comentário do `claude` no card.
2. **Escada**: cada tarefa começa no nível marcado e sobe free → haiku → sonnet → opus, 2 tentativas
   por nível. Passa quem faz commit e deixa a checagem verde; entre tentativas o branch volta e o erro
   vai para a próxima. `free` é um modelo gratuito do OpenRouter (`KANBAGENT_FREE_MODEL`) e só vale em
   repositório público; em privado a escada começa no haiku.
3. **Entrega**: roda o `final_check`, publica o branch, abre (ou comenta) o PR, liga ao card e move
   para `revisao_codigo` com os níveis usados. Qualquer falha destrava o card com o motivo e
   "↻ Pedir de novo". Numa reprovação, o texto do Sato vai para o planejador e o trabalho continua no
   mesmo branch/PR. Log por card em `~/.hermes/logs/kanbagent-exec/`.

## Hermes revisa o PR

Entrar em `revisao_codigo` (pelo Claude ao entregar, ou pelo Sato) abre um pedido `revisao_codigo`; o
card trava com "revisando… <passo>". O worker `python -m hermes_dashboard.kanbagent_review` (disparado
pelo executor/site, crontab a cada 5 min) lê o diff do PR ligado ao card e pede ao Hermes um parecer
que começa com `VEREDITO: APROVAR` ou `VEREDITO: AJUSTAR`. O Claude faz uma segunda revisão (Sonnet;
Opus se alguma tarefa precisou do opus) quando o diff passa de 400 linhas, quando houve trabalho opus
ou quando o Hermes não dá veredito. Um AJUSTAR vence. O parecer vira comentário no PR e no card.

Com a revisão concluída, o card mostra o parecer e dois botões: **Aprovar (merge)** faz o merge
(squash) do PR e leva o card para `entregue`; se o merge falhar, o card fica onde está com o motivo.
**Reprovar** volta para `execucao` com o parecer pré-preenchido como texto, o que dispara o executor de
novo no mesmo branch. Arrastar continua valendo pelas mesmas regras.

## Artefatos (o que a execução devolve)

Quando o card pede um arquivo como resultado (imagem, sprite, documento, página HTML), o executor salva a
versão final em `../entregas/`, fora do repositório. No fim da execução esses arquivos (até 20, 20 MB cada,
sem seguir links) viram **Artefatos** no card, independentes do PR. Imagem (tipo conferido pelos bytes)
abre direto; SVG, HTML, PDF e texto abrem isolados com CSP `sandbox` (origem opaca, sem cookies nem acesso
ao site); o resto baixa. Mesmo nome numa nova rodada substitui o anterior. Card que só gerou artefato, sem
commit, vai para "Revisão de código" sem PR: o Sato confere e entrega.

Card aprovado sem repositório (criado antes da escolha obrigatória) ainda pode receber um, ou "novo",
enquanto espera na fila; depois de definido, trava.

## Imagens de perfil

Cada autor do histórico (sato, hermes, claude, github-sync) aparece com uma imagem. Os padrões ficam em
`static/avatars/`; a página **Ajustes** troca por PNG, JPEG ou WebP (até 2 MB, conferido pelo conteúdo,
SVG recusado), salvo em `kanbagent-avatars/` ao lado do banco. `GET /kanbagent/avatar/<autor>` serve a
atual com `?v=<mtime>` para furar o cache; "Padrão" apaga a enviada.

## Modelo de dados (banco próprio `kanbagent.sqlite3`)

- `projects` — slug, nome, descrição, criado_em, arquivado_em.
- `repos` — full_name (`owner/repo`).
- `project_repos` — projeto ↔ repositório (N:N; um projeto pode envolver vários repos).
- `cards` — projeto, repo opcional (qualquer um do GitHub; entra no projeto sozinho) ou `novo_repo` (+ `novo_repo_publico`) que o executor cria, título, `ideia_original` (nunca sobrescrita),
  proposta (markdown), `etapa_atual` (cache), criado_em, atualizado_em.
- `card_links` — issues/PRs ligados ao card pelo próprio fluxo (executor, Hermes, API), não pela página.
- `card_refs` — referências da ideia: links e arquivos anexos (em `~/.hermes/kanbagent-files/<card>/`, baixados sempre como anexo). Seguem para o Hermes (proposta) e para o Claude (`../refs/` no plano).
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
