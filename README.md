# Flask + HTMX Dashboard for Sato Agents

Sato Agent 3D e chat na raiz, dashboard de observabilidade
em abas.

## Rodando

```bash
pip install flask pyyaml       # lancedb e fastembed so para a aba de RAG
python3 app.py                 # http://127.0.0.1:8080
```

Abra `/` para conversar ou `/dashboard` para os indicadores. A principal não contém links para o Dashboard. As páginas `/lab`, `/orb` e `/models` foram removidas, assim como seus recursos exclusivos. Os cenários opcionais da principal continuam disponíveis.

## UI e telemetria compartilhadas

`fragments/site-ui.html` e `sato-ui.css` definem navegação, superfícies e loading
na principal e no Dashboard. Cada aba do Dashboard apresenta diretamente os indicadores
recebidos por `/api/lab/stream`. O endpoint de telemetria e a API privada de chat conservam seus endereços por compatibilidade.
`telemetry-indicators.js` e `telemetry-ui.js` compartilham indicadores, históricos
e a tabela de modelos do Dashboard.

A aba Providers agrega por modelo **e provider**, incluindo tokens e custo,
sem consultar APIs de um provedor específico. A fonte é `session_model_usage`
do Hermes ou `model_usage` legado. Não há um segundo log de inferências no
dashboard; o histórico nativo disponível é agregado por sessão, sem horário
individual de cada chamada. Provider ausente fica como não registrado.
A configuração principal/fallback é exibida separadamente do uso observado.

A câmera inicial segue a posição no chão, sem acompanhar a queda do tubo.

## Worker do chat e contexto preparado

O worker da fila aquece um processo Hermes quando o chat privado inicia. O processo
mantém os módulos carregados; cada mensagem recebe um CLI/agente novo e somente
o histórico explícito da sua conversa. O identificador Hermes `web-<conversation_id>`
é estável dentro dessa conversa, sem usar `/resume` nem carregar histórico implícito.
Ferramentas continuam bloqueadas na definição, no despacho e na validação de eventos.

O servidor coleta o contexto ao processar a mensagem, em vez de capturá-lo na entrada
da fila e refazê-lo depois. CPU, RAM e processos são observados em cada pedido.
Catálogos, documentos redigidos e RAG têm cache em memória por até 30 segundos;
mudanças nos arquivos, metadados dos documentos, manifests LanceDB e checkpoint
de sincronização invalidam a fonte correspondente antes desse prazo. A seleção de
trechos continua sendo feita para cada pergunta, e os rankings de commits continuam
contando todo o catálogo indexado. O contexto inclui a idade e validade de suas fontes.
Falha ao atualizar uma fonte não reaproveita silenciosamente uma cópia expirada.

O cache é de fontes, não de respostas, e limita a representação serializada a 16 MiB
e 48 entradas. O processo é reciclado entre mensagens após 100 pedidos ou RSS acima
de 384 MiB. Queda, erro de protocolo, tentativa de ferramenta ou timeout de 240 segundos
descartam o processo; a fila durável mantém sua recuperação existente. Alterações em
`config.yaml`, `.env`, `cli.py`, `run_agent.py` ou no runner também recriam o processo.
Aquecer não faz inferência: o provedor é chamado somente ao processar uma mensagem.

Os logs do serviço registram PID, reutilização do worker, RSS, tamanho do prompt,
quantidade de mensagens de histórico e tempos de contexto/runner, sem registrar o
conteúdo da pergunta ou credenciais nesses registros de desempenho.

## Sato Agent na raiz

`/` apresenta um robô do laboratório próximo ao campo de mensagem. Após o
carregamento, o tubo da recepção desce, entrega o robô e recolhe; ele cai e
volta a flutuar. A conversa começa vazia, sem balões de saudação. Ele pisca,
acompanha o ponteiro e alterna entre aceno, cócegas, dança e timidez ao receber
toques. A dança dá uma volta completa no corpo e duas voltas nos braços.
Navegadores que bloqueiam autoplay liberam os bips sintetizados no primeiro
gesto; o modal de configurações contém o controle para silenciar.
Dashboard e Lab ficam no canto superior direito: o robô anuncia o destino antes
de navegar. A antiga página de estatísticas públicas foi removida; os indicadores
continuam em `/dashboard` e `/api/stats`.

O campo fica compacto no rodapé e expande ao digitar. A pergunta aparece no
balão e o input é limpo imediatamente, mesmo com a confirmação do servidor
demorada. Em uma falha, o texto volta ao campo; um ID de mensagem permite
reconciliar confirmações perdidas e repetir o envio sem duplicar a pergunta.
Sem conversa ativa, o histórico abre a lista de sessões salvas, com o título baseado
na primeira pergunta, e permite continuar uma delas ou iniciar uma nova. Depois de
selecionar uma sessão ou enviar uma mensagem, o botão abre o histórico dessa conversa.
Nesse histórico, **Lista de sessões** retorna à lista; **Nova conversa** aparece
somente na lista. A seta fecha o painel em ambas as telas. O título
permanece no header da conversa. Cada sessão tem histórico e contexto do modelo
próprios. Recarregar a página começa uma nova conversa vazia; as sessões anteriores
continuam disponíveis no histórico. Mensagens anteriores à migração ficam em
**Conversa anterior**. A migração SQLite adiciona uma coluna e uma tabela sem
remover dados; voltar ao código anterior é possível mantendo esse schema.
O chat do Lab mantém os campos e endpoints anteriores. Na cena,
respostas têm uma prévia de até cinco linhas/420 caracteres, e perguntas de
duas linhas/180 caracteres. **Ver mais** abre a mensagem integral no histórico.
Cada balão tem um botão para copiar a mensagem completa, incluindo as prévias
cortadas. **Ver mais** fica à esquerda; copiar e horário ficam juntos à direita.
Respostas que chegam usam o pacote oficial `typewriter-effect` 2.22.0 (MIT),
com texto literal, até o trecho que cabe nas linhas visíveis da prévia. A largura
real e o limite de linhas são medidos antes de iniciar a digitação. Um loop discreto de teclado acompanha
a digitação e para ao terminar, silenciar, trocar de conversa ou ocultar a aba.
Histórico retomado e movimento reduzido mostram o texto completo da prévia
imediatamente. O bundle e a licença são locais; para regenerar, execute
`npm ci && npm run build:typewriter`.
Somente o conteúdo do chat e os campos de texto podem ser selecionados.
No histórico, mensagens longas também começam resumidas; **Ver mais** expande
somente o balão escolhido. A expansão permanece ao atualizar ou reabrir o
histórico nesta página. Ícones, horários e balões já respondidos são preservados
durante a espera por outra resposta. Conversas extensas carregam mensagens
anteriores em páginas de 40, preservando o que já foi carregado.
O histórico usa blur de 1 px, mantendo a cena visível. Os botões usam SVGs oficiais do
Lucide, servidos localmente; licença e revisão em `static/icons/README.md`.
O layout acompanha o viewport disponível quando o teclado móvel abre e respeita
a preferência por movimento reduzido. Sem WebGL, chat e navegação continuam.

Os últimos balões recolhem após cinco segundos de leitura para um ícone de chat
acima do robô. Clicar revela ambos novamente e reinicia o ciclo. Durante a
resposta pendente, digitação ou interação nos balões, a leitura permanece
visível. As transições respeitam movimento reduzido. O título fica no histórico,
sem uma segunda cópia solta acima da pergunta.

As configurações oferecem Padrão, laboratório e floresta, além de quatro cores
de chat: azul, verde, violeta e âmbar. As escolhas ficam salvas neste navegador.
O fundo Padrão é cinza escuro, com os 32 desenhos genéricos disponíveis da coleção
Popsy Hand Drawn do SVG Repo, sem marcas de sites ou plataformas. Os ícones pequenos
preenchem uma malha compacta de espaçamento uniforme, com cerca de 1px de separação
mínima, sem sobreposição inclusive nas emendas do padrão. O canvas transparente fica acima dos
desenhos: nenhum deles cobre os modelos 3D. Laboratório e floresta não exibem
esses desenhos. Fontes e licenças: `static/images/doodles/README.md`. No fundo Padrão, cada desenho reage ao cursor ou ao toque com uma mola: cresce,
empurra os vizinhos e volta ao encaixe quando o contato termina. A interação ignora
o chat, menus e o robô, e respeita movimento reduzido. O laboratório é uma sala
fechada com portal de testes, gerador helicoidal, bancadas, racks e equipamentos
em todas as direções. A floresta tem céu, terreno contínuo, rio, árvores ao redor
e névoa que encobre o limite externo. A grama procedural adapta a grade irregular,
os triângulos voltados à câmera e o vento nas pontas de `folio-2025/Grass.js`. Os cenários ultrapassam as
laterais do celular. São carregados uma vez, sob demanda, no
mesmo canvas. A troca desvanece pelo preto e oculta o cenário inativo. A cena
preenche todo o viewport, inclusive atrás do chat. O cenário salvo é preparado
durante o loading e revelado suavemente. Com o som ativo, laboratório e floresta
tocam loops locais: o laboratório usa o arquivo `amb_machinery_factory_lp_01.wav`
enviado pelo usuário, convertido para Ogg e em volume baixo. A floresta mantém
o loop de natureza com volume menor e filtro suave nas frequências agudas,
reduzindo o destaque dos pássaros. O controle de som também silencia a digitação.
Nos cenários Laboratório e Floresta, o botão Play entre Enviar e Configurações
assume o controle do robô e vira Stop. No desktop, WASD/setas movem em relação à
câmera; arrastar o fundo gira a visão; Esc sai. No celular, o primeiro contato
à esquerda revela um único analógico no local do dedo, ocultado ao soltar. O
restante do fundo gira a câmera, inclusive com dois dedos simultâneos. Paredes,
equipamentos, margem do rio e arbustos bloqueiam o robô e encurtam a câmera.
Ao sair, o robô permanece onde parou e a câmera escolhe uma vista frontal livre,
sem atravessar a sala. A íris segue cursor/toque nos dois eixos, limitada a 0,025
unidade dentro da abertura mecânica; o conjunto óptico fica fixo na carcaça.

Fora da exploração, a câmera depende somente do viewport: perguntas, balões e histórico não alteram
o zoom, a distância nem as proporções da cena;
resizes reais são agrupados no frame que já desenha a cena.
A cena limita a 30 fps e DPR 1,75, sem carregar o campus ou mapas HDR.
O Sato Agent da raiz tem corpo esférico com três linhas de encaixe, olho recuado
em uma área mecânica escura e braços lisos, sem mãos ou pernas. Corpo e braços
mantêm suas dimensões durante os gestos. Uma pequena antena gira e pisca na cor
do olho; a base magnética menor emite três anéis que descem, encolhem e somem.
Os braços ficam recolhidos até a carcaça inteira sair pela boca aberta do tubo.
Durante a espera, o chat alterna frases e exibe três pontos SVG animados ao fim do texto; o indicador
some quando a resposta ou o erro chega. Movimento reduzido desativa a animação.

A raiz usa a mesma autenticação, fila persistente e processo Hermes isolado do
chat livre do Núcleo. Não há respostas locais substituindo o modelo quando ele
está indisponível. O servidor prepara contexto de todos os setores, indicadores
da VM, catálogo e trechos relevantes de memória, contexto, skills e RAG, com
limites de tamanho e remoção de credenciais. O modelo também responde assuntos
gerais, declara lacunas e não pode executar ferramentas. Esse contexto contém
leituras selecionadas das fontes do dashboard, não acesso arbitrário em tempo
real a qualquer arquivo da VM.

### Atualizar a VM

O job Hermes `update-dashboard` roda a cada 30 minutos em modo `no_agent`.
Sua cópia instalada em `~/.hermes/scripts/update-dashboard.sh` corresponde a
[`tools/update_dashboard.sh`](tools/update_dashboard.sh). O script busca a
`main` de `satoLG/sato-agents-lab` por Git, tenta novamente em falhas de rede,
e só aceita avanço linear com os arquivos versionados locais intactos. Antes
de trocar a versão em `/home/leona/projects/hermes-dashboard`, valida Python,
templates e a rota `/` em uma cópia temporária. Depois reinicia
`hermes-dashboard.service` e verifica `/` e `/dashboard`. Se o serviço
não voltar saudável, restaura a revisão anterior. Sem commit novo, não reinicia
nem envia notificação. Para alterar o próprio procedimento de atualização,
atualize também a cópia instalada no Hermes após integrar o PR.

O fetch atualiza também `origin/main`; compare commits somente após esse fetch.
O checkout de produção deve permanecer na `main`. Desenvolva em outro worktree,
publique a branch e abra um PR; o proprietário faz o merge. Não troque a branch
do diretório que o serviço Flask e o cron utilizam.

Atualizar este repositório público não exige token. Para push e PR, confira
`gh auth status` e o acesso ao repositório antes de concluir que falta credencial.
Um token configurado no ambiente/MCP do Hermes não implica que o CLI `gh` esteja
autenticado. Na VM, o `gh` foi autenticado com a credencial existente do Hermes,
e o Git desse checkout usa `gh auth git-credential`. Nunca imprima tokens nem
peça que sejam enviados pelo chat.

As variáveis `HERMES_*` continuam sendo as mesmas documentadas abaixo. O
processo precisa ler os arquivos reais do Hermes para mostrar atividade real;
rodar em outra máquina mostra os recursos dessa outra máquina.

### Validar o site

```bash
python -m pytest tests/ -q
python tools/check_html.py
npm ci
npm run test:unit
# Com python app.py rodando em outro terminal:
npm run test:browser
```

Playwright separa a interface e o chat (`--project=ui`) das cenas WebGL da
principal (`--project=scenes`). Os testes mantêm desenho e compilação reais,
limitando a resolução e a frequência dos frames de teste para não saturar GPUs por software. O CI só executa navegador quando a alteração toca a aplicação web, templates, recursos, configuração ou testes de navegador; alterações isoladas nos coletores e no contexto do Hermes passam pelos testes Python.
Não há testes de páginas Orb, Lab ou estúdio de modelos: essas páginas foram removidas.

### Se algo nao aparecer ou der erro

```bash
python3 tools/selfcheck.py
```

Imprime versoes, caminhos, o schema do `events.db`, o formato do `config.yaml`,
o estado do RAG e o codigo de resposta de toda rota, com traceback de quem
falhar. Sai com 1 se alguma rota der 5xx.

### Caminhos

O dashboard procura tudo em `~`. Se o seu Hermes estiver noutro lugar:

| Variavel | Padrao |
|----------|--------|
| `HERMES_DB_PATH` | `~/hermes-observability/events.db` |
| `HERMES_HOME` | `~/.hermes` |
| `HERMES_RAG_PATH` | `~/rag-db` |
| `HERMES_CONFIG_PATH` | `~/.hermes/config.yaml` |
| `HERMES_CRON_DIR` | `~/.hermes/cron` |
| `HERMES_LOG_PATH` | autodetectado em `~/.hermes/logs/` |

## Abas

| Aba | O que mostra | De onde vem |
|-----|--------------|-------------|
| Atividade | Painel do que roda agora + calendario tipo GitHub; clicar num dia abre os eventos daquele dia | `events.db`, `ps`, `~/.hermes/logs/` |
| VM | CPU (total e por core), memoria, swap, discos e o que ocupa cada espaco | `/proc`, `df`, `du` |
| Tools | Catalogo de tools e estatisticas de tool calling | `events.db` (`tool_calls`) |
| MCPs | Servidores MCP, acoes e uso | `config.yaml` + `tool_calls` com nome `mcp__servidor__acao` |
| Memoria | Memorias, skills e contextos, com leitura do conteudo | `~/.hermes/{memories,skills,contexts}` |
| RAG | Mapa mental navegavel, lista e busca semantica | lancedb em `~/rag-db` |
| Cron | Jobs e historico de execucao | `~/.hermes/cron/`, `crontab -l`, `systemctl list-timers` |

O painel "processando agora" usa HTMX (`hx-trigger="every 3s"`), com filtro que
segura o polling enquanto a aba nao esta visivel. O resto das abas busca JSON dos
`/api/*` e monta o DOM no cliente.

## Estrutura

```
app.py                     rotas Flask (e so isso)
hermes_dashboard/
  config.py                caminhos, config.yaml, precos
  db.py                    acesso read-only ao events.db + descoberta de schema
  stats.py                 numeros do mes (dashboard e API)
  activity.py              heatmap, detalhe do dia, snapshot ao vivo
  vm.py                    CPU/memoria/disco
  tools.py                 catalogo e estatisticas de tools
  mcp.py                   servidores MCP
  memory.py                catalogo de documentos + leitura com guarda de path
  rag.py                   lancedb, montagem do grafo e busca
  cron.py                  jobs e execucoes
static/
  css/app.css              design system (mobile-first, paleta validada)
  js/                      um modulo ES por aba + core/charts compartilhados
  vendor/                  htmx e cytoscape servidos localmente, sem CDN
templates/
  base.html                shell; dashboard.html; home.html
  fragments/live.html      fragmento trocado pelo HTMX
```

### Notas de implementacao

- **Schema flexivel**: `activity.py` descobre em runtime quais tabelas de evento
  existem (`prompts`, `model_usage`, `tool_calls`, `agent_runs`, `subagent_runs`).
  Se o seu `events.db` tiver uma tabela a mais, ela vira uma serie no heatmap
  sozinha; se tiver a menos, nada quebra. Colunas ausentes (`cost_usd`, `error`,
  `success`) sao simplesmente omitidas da consulta em vez de derrubar a aba.
- **Timestamp em qualquer formato**: ISO, epoch em segundos ou em milissegundos.
  O formato e detectado por amostragem e normalizado em SQL - com epoch e
  `date(coluna)`, o dashboard inteiro aparecia zerado sem erro nenhum.
- **Sem banco nao quebra**: `query()` levanta `DatabaseUnavailable` e a tela
  mostra "sem dados" em vez de 500. Um `@app.errorhandler(Exception)` global
  garante que nem uma excecao inesperada vira tela branca: a rota `/api/*`
  devolve o erro em JSON e a pagina mostra a mensagem com o traceback.
- **Segredos**: a leitura de documentos so serve caminhos dentro de
  `~/.hermes` e do diretorio da app, e o `config.yaml` sai redigido (valores de
  chaves com `key`/`token`/`secret`/`password` viram `[REDIGIDO]`).
- **Sem CDN**: htmx e cytoscape estao em `static/vendor/`, entao a VM nao
  precisa de saida pra internet pro dashboard funcionar.

## Validando os templates

```bash
python3 tools/check_html.py                    # valida templates/ (inclusive fragments/)
python3 tools/check_html.py templates/x.html   # valida arquivos especificos
```

O script confere, por arquivo:

- sintaxe Jinja (`{% if %}` / `{% for %}` / `{{ }}` mal fechados), com linha do erro
- balanco de tags HTML (`<div>` sem `</div>`, fechamento sobrando), ignorando o
  conteudo de `<script>`/`<style>` e as tags de fechamento opcional do HTML5
- atributos `hx-*` escritos errado (ex: `hx-gett`)

E confere que todo `render_template("x.html")` do `app.py` aponta pra um arquivo
que existe. Sai com codigo 1 se achar problema, entao serve pra CI/pre-commit.

## Testes

```bash
pip install pytest
python3 -m pytest tests/ -q
```

`tests/test_routes.py` monta VMs falsas (schema minimo, colunas com outro nome,
timestamp em epoch, valores nulos, nove formatos de `config.yaml`, seis de
`jobs.json`, diretorio sem permissao, symlink quebrado, RAG levantando seis
excecoes diferentes) e exige que **nenhuma rota responda 5xx** em nenhum deles.
`tests/test_rag_real.py` roda contra um lancedb de verdade, inclusive com tabela
sem colunas opcionais, sem `content`, vazia e com outro nome.
