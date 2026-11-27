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

## O time (ADR 0014)

| Agente | Motor | Etapa | Faz |
|---|---|---|---|
| Requisitos | Hermes, perfil `requisitos` | Proposta | escreve a proposta/spec com critérios de aceite |
| Planejador | Claude Sonnet (Opus se grande) | início da Execução | quebra a spec em tarefas que cobrem todos os critérios |
| Programador | Claude, nível por tarefa | Execução | faz as tarefas, artefatos, `specs/card-N.md` e o PR |
| Revisor | Hermes, perfil `revisor` (+ Claude em diff grande) | Revisão de código | confere o PR critério por critério |

Você (Sato) aprova a proposta e a entrega. O Sato Agent principal (Hermes `default`) cria cards,
comenta e chama o Requisitos, mas não escreve proposta: a API recusa. Os perfis ficam em
`~/.hermes/profiles/<perfil>/` (SOUL.md próprio, `KANBAGENT_AGENT` no `.env`). A página **Time** mostra
cada agente, o que está fazendo e quanto já custou.

## A proposta é a spec (ADR 0013)

A proposta do Hermes tem formato fixo e a parte que importa para a entrega é:

```
**Critérios de aceite**
- C1: o botão baixa um CSV com cabeçalho — verificar: teste
- C2: vírgula no título sai entre aspas — verificar: `pytest tests/test_csv.py`
- C3: o botão fica ao lado do filtro — verificar: visual

**Decisão de arquitetura** — não   (ou "sim: <qual>", que exige ADR no PR)

**Dúvidas** — nenhuma
```

- Sem critério, **Aprovar** fica desligado (e a API recusa `revisao → aprovado`). Dúvida em aberto só
  pede confirmação.
- O plano marca em cada tarefa os critérios que ela atende; critério sem tarefa faz o planejador
  refazer o plano uma vez, depois falha.
- O PR leva `specs/card-N.md` (ideia, proposta e ajustes pedidos nas reprovações).
- A revisão responde `- Cn: ok|falha` para cada critério; o código troca APROVAR por AJUSTAR se faltar
  `ok` num critério não visual ou se a ADR pedida não veio. Critério visual fica em "Para você conferir".
- AGENTS.md / CLAUDE.md do repositório são a constituição: o planejador lê, a revisão recebe o texto, e
  o comentário do plano avisa quando o repositório não tem nenhum dos dois.

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

## Esforço x espera

O tempo corrido de uma etapa (da entrada à saída) não é trabalho: um card esperando você abrir não gastou
esforço nenhum. Por isso cada etapa se divide em:

- **agente:** soma dos pedidos ao Hermes/Claude daquela etapa (`agent_jobs`, de `started_at` a `finished_at`);
- **você:** segundos com a página do card aberta, visível e com interação nos últimos 60 s. A página avisa
  `POST /kanbagent/card/<id>/presenca` a cada 15 s; o servidor credita só o tempo real desde o aviso
  anterior (no máximo 30 s), então avisar mais vezes não infla, e etapa fechada não conta (`card_attention`);
- **espera:** o resto. Etapas que esperam uma ação sua (`USER_STAGES`: ideia, em revisão, fila de execução,
  revisão de código) aparecem no quadro com ampulheta em vez de cronômetro.

O card mostra Esforço, Espera e Decorrido; as barras por etapa e as métricas separam os dois. Histórico
anterior a esta mudança não tem medição de atenção: o esforço dele é só o tempo do agente.

## Custo da execução

Cada chamada do Claude (planejar, tarefa, revisão) grava uma linha em `card_runs` com modelo, turnos e o
`total_cost_usd` que a CLI informa (equivalente em API, não o desconto exato da assinatura). O card mostra
o total e o gasto por modelo. O que mais custa é o número de sessões, não o trabalho: cada tarefa abre uma
sessão nova que relê o repositório e o `CARD.md`. Por isso:

- o planejador roda em sonnet (opus só se a proposta for "grande") e agrupa passos: pequeno = até 2
  tarefas, médio = até 4;
- tentativas por nível: free e haiku 2x, sonnet e opus 1x (sobe de nível em vez de repetir o caro); o nível
  em que a tarefa começa tem 2 tentativas;
- teto por execução (`KANBAGENT_CARD_BUDGET_USD`, padrão 5): ao passar, a execução para antes da próxima
  tarefa, o trabalho feito fica no branch e o card mostra o motivo.

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
