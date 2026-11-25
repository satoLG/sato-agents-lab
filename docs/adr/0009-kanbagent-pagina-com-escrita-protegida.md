# 0009. Hospedar o kanbagent no site, com banco próprio e escrita protegida

- Status: Aceito
- Data: 2026-11-24

## Contexto
O Sato quer um kanban pessoal (ideia → proposta → revisão → entrega, com tempo por etapa, por projeto e
repositório) numa página própria do site do Sato Agents, no mesmo endereço já publicado pelo túnel
Cloudflare. Até aqui o site é read-only (ADR 0008) e acessível publicamente (chat público, ADR 0003);
o ADR 0008 registra que um painel com ações exigiria auth forte. O Hermes tem um kanban nativo
(`~/.hermes/kanban.db`), mas ele é a fila de execução dos agentes do Hermes (cards em `ready` podem ser
pegos por workers) e não modela projeto com vários repos nem entrega no GitHub.

## Decisão
- O kanbagent é um módulo deste monólito (`hermes_dashboard/kanbagent.py`, rotas finas em `app.py`,
  página em `/kanbagent`), conforme ADR 0001. Não é serviço nem repositório separado.
- Ele tem **banco próprio** (`kanbagent.sqlite3`, caminho por `KANBAGENT_DB_PATH`, padrão
  `HERMES_HOME/kanbagent.sqlite3`), aberto para escrita. As fontes do Hermes continuam read-only; o
  ADR 0008 vale para elas sem alteração. `tests/test_architecture.py` passa a listar `kanbagent.py` entre
  os módulos donos de banco próprio, ao lado de `web_chat.py`.
- Não lê nem escreve no `kanban.db` do Hermes.
- **Acesso**: `/kanbagent` e `/kanbagent/*` ficam atrás de Cloudflare Access (login pelo e-mail do Sato),
  configurado no painel da Cloudflare por caminho. A API (`/kanbagent/api/*`) exige também
  `Authorization: Bearer <KANBAGENT_API_TOKEN>`, porque o Hermes chama pela rede local sem passar pelo
  Access; sem token configurado, a API responde 503 e não aceita escrita.
- Todas as ações de escrita são POST, como no resto do site (ADR 0002).

## Consequências
- Um deploy, um `pytest`, mesmo stack (Flask + HTMX + SQLite).
- Primeira área do site com escrita: depende do Access estar configurado antes da página ir para
  produção. Sem Access, a página fica exposta; o PR da página precisa dizer isso em destaque.
- O kanbagent sobe e cai junto com o dashboard.

## Alternativas consideradas
- Repositório e serviço separados: dois deploys e dois endereços para um único usuário; contraria ADR 0001.
- Usar o kanban nativo do Hermes: risco de o despachante executar cards e falta de projeto/repo/entrega.
- Login próprio no app: tabela de usuários e sessões para uma pessoa; o Access resolve fora do código.

## Revisitar quando
O kanbagent precisar de outros usuários, ou o Access deixar de estar na frente do túnel.
