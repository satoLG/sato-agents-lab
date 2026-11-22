# Sato Agents Lab

Interface web do **Sato Agent**, o nome do agente [Hermes](https://github.com/NousResearch/hermes-agent) do Sato neste projeto.

- **`/`: chat com o Sato Agent.** É a parte principal: um robô 3D que conversa usando o Hermes, com histórico de sessões, cenários (Padrão, Laboratório e Floresta) e modo de exploração.
- **`/dashboard`: painel de observabilidade.** É privado e só lê dados. Mostra o que acontece na estrutura de agentes: atividade, modelos, tools, MCPs, memória, RAG, cron e VM.

Tudo roda na mesma máquina do Hermes e lê os arquivos reais dele. Não há CDN nem serviço externo além do provedor de modelo que o próprio Hermes usa.

## Sato Agent (`/`)

- **Chat privado:** login por senha (veja [Chat privado](#chat-privado)). Cada pergunta entra numa fila durável e é respondida por um processo Hermes isolado e já aquecido, que **não executa ferramentas**. O servidor monta o contexto de cada pergunta com leituras do dashboard, memória, skills e trechos do RAG, já sem credenciais.
- **Conversas:** várias sessões salvas, cada uma com histórico e contexto próprios. As respostas chegam por SSE com efeito de digitação. As prévias na cena são curtas e o **Ver mais** abre a mensagem completa.
- **Cena 3D (Three.js):** o robô chega por um tubo, reage a toques e tem som opcional. Há fundos Padrão, Laboratório e Floresta, e a troca entre Laboratório e Floresta é feita por um portal. O **Play** assume o controle do robô (WASD ou analógico no celular).
- **Imitações (Sato Mimic):** o modelo descreve uma coreografia usando um catálogo limitado de tools do próprio robô (visor, braços, corpo). Detalhes em [`docs/mimic-tools.md`](docs/mimic-tools.md).
- Respeita `prefers-reduced-motion`. Sem WebGL, o chat continua funcionando.

O comportamento detalhado (balões, histórico, câmera, cenários, worker e cache) está em [`docs/sato-agent.md`](docs/sato-agent.md).

## Dashboard (`/dashboard`)

| Aba | Conteúdo | Fonte |
|-----|----------|-------|
| Sistema | CPU, memória, swap, discos e processos, ao vivo | `/proc`, `df`, `du`; SSE `/api/lab/stream` |
| Atividade | O que roda agora e um calendário de eventos por dia | `events.db`, `ps`, `~/.hermes/logs/` |
| Providers | Uso por modelo e provider (tokens e custo), além do modelo principal e do fallback configurados | `session_model_usage` / `model_usage`, `config.yaml` |
| Gateway | Estado dos adaptadores do Hermes, sem configuração nem segredos | `~/.hermes/gateway_state.json` |
| Tools | Catálogo e estatísticas de tool calling | `events.db` (`tool_calls`) |
| MCPs | Servidores, ações e uso | `config.yaml` e `mcp__servidor__acao` |
| Memória | Memórias, skills e contextos, com leitura do conteúdo | `~/.hermes/{memories,skills,contexts}` |
| RAG | Grafo navegável, lista e busca semântica | LanceDB em `~/rag-db` |
| Cron | Jobs e histórico de execução | `~/.hermes/cron/`, `crontab -l`, `systemctl list-timers` |
| Webhooks | Histórico de chamadas, sem headers nem corpo | `events.db` (`webhook_logs`) |

Garantias: tudo é somente leitura. O schema do `events.db` é descoberto em tempo de execução, com tabelas ou colunas ausentes omitidas e timestamps ISO ou epoch normalizados. Sem banco, a aba mostra "sem dados", nunca um erro 500. Documentos só são servidos de dentro de `~/.hermes`, e chaves com `key`/`token`/`secret`/`password` aparecem como `[REDIGIDO]`.

## Tecnologias

| Camada | Uso |
|--------|-----|
| Backend | Python 3, Flask, PyYAML, SQLite (`events.db` e fila do chat), SSE |
| RAG | LanceDB e fastembed (embeddings de 384 dimensões), sincronizado com os repositórios do GitHub ([`docs/rag-sync.md`](docs/rag-sync.md)) |
| Front | HTMX, ES modules sem framework, Cytoscape (grafo do RAG) |
| 3D e áudio | Three.js 0.180, shaders próprios (portal, grama, água), Web Audio |
| Chat | markdown-it, typewriter-effect, ícones Lucide |
| Testes | pytest, `node --test`, Playwright 1.63 (Chromium) |
| Build | esbuild, só para gerar os bundles em `static/vendor/` |

Todas as dependências de front ficam em `static/vendor/`, com as licenças ao lado. Regenere os bundles com `npm run build:three`, `build:typewriter` e `build:chat-markdown`.

## Estrutura

```
app.py                  rotas Flask
hermes_dashboard/
  web_chat.py           API do chat privado: login, fila, jobs, SSE
  warm_runner.py        processo Hermes aquecido e sem tools
  chat_context.py       contexto por pergunta (dashboard, memória, RAG)
  context_cache.py      cache de fontes (30 s, invalidação por mtime)
  sato_agent.py         identidade e fatos públicos do Sato Agent
  mimic.py              catálogo e planejador das imitações
  lab.py, lab_feed.py   telemetria ao vivo (/api/lab/stream)
  activity, stats, vm, tools, mcp, memory, rag, cron, gateways, webhooks
                        um módulo por aba do dashboard
  config.py, db.py      caminhos, config.yaml e acesso ao events.db
static/
  js/home*.js           cena, navegação, portal, cenários e áudio da raiz
  js/tab-*.js           um módulo por aba do dashboard
  js/lab-*.js, scene-*.js, robot-mimic.js   robô, equipamentos e natureza
  css/, data/, audio/, textures/, icons/, vendor/
templates/              base, home, dashboard e fragments/
tools/                  atualização da VM, RAG, senha do chat, selfcheck, builds
tests/                  pytest (*.py), unitários JS (*.test.mjs), browser/ (Playwright)
docs/                   sato-agent, mimic-tools, rag-sync, scenic-environments
```

## Rodando localmente

```bash
pip install flask pyyaml            # lancedb e fastembed só para o RAG
python3 app.py                      # http://127.0.0.1:8080
```

Fora da máquina do Hermes, as abas mostram os recursos da máquina local, ou "sem dados".

| Variável | Padrão |
|----------|--------|
| `HERMES_HOME` | `~/.hermes` |
| `HERMES_DB_PATH` | `~/hermes-observability/events.db` |
| `HERMES_RAG_PATH` | `~/rag-db` |
| `HERMES_CONFIG_PATH` | `~/.hermes/config.yaml` |
| `HERMES_CRON_DIR` | `~/.hermes/cron` |
| `HERMES_LOG_PATH` | autodetectado em `~/.hermes/logs/` |

### Chat privado

O chat só funciona com `HERMES_WEB_CHAT_PASSWORD_HASH` e `HERMES_WEB_CHAT_SESSION_SECRET` definidas no `.env`. Para criar ou trocar a senha sem que ela passe pelo Git ou pela linha de comando:

```bash
python3 tools/set_chat_password.py ~/.hermes/.env
```

## Testes

```bash
python3 -m pytest tests/ -q
python3 tools/check_html.py          # Jinja, balanço de tags, atributos hx-*
npm ci && npm run test:unit
npm run test:browser                 # com app.py rodando
```

O Playwright tem dois projetos: `ui` (chat, dashboard, interface) e `scenes` (WebGL, marcado com `@scene`). O CI (`.github/workflows/lab-checks.yml`) roda os testes de navegador só quando a mudança toca a web. `tools/selfcheck.py` faz um diagnóstico rápido: versões, caminhos, schema e o status de cada rota.

## Deploy e fluxo

- O checkout de produção fica em `/home/leona/projects/hermes-dashboard`, sempre na `main` limpa, e roda como `hermes-dashboard.service`.
- O job Hermes `update-dashboard` (`no_agent`, a cada 30 min) roda [`tools/update_dashboard.sh`](tools/update_dashboard.sh). O script só aceita fast-forward, valida numa cópia temporária, reinicia o serviço e volta à versão anterior se `/` ou `/dashboard` não responderem.
- Desenvolvimento acontece em branch e PR, e o merge fica com o Sato. Issues com a label `claude` são implementadas à noite pelo worker do Claude Code. Regras completas em [`AGENTS.md`](AGENTS.md).
