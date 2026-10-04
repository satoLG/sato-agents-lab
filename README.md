# Flask + HTMX Dashboard for Sato Agents

Companheiro 3D e chat informativo do Hermes na raiz, dashboard de observabilidade
em abas e laboratório interativo.

## Rodando

```bash
pip install flask pyyaml       # lancedb e fastembed so para a aba de RAG
python3 app.py                 # http://127.0.0.1:8080
```

Abra `/` para conversar, `/dashboard` para os indicadores ou `/lab` para explorar.

## Sato Agent na raiz

`/` apresenta um robô do laboratório próximo ao campo de mensagem. Após o
carregamento, o tubo da recepção desce, entrega o robô e recolhe; ele cai, diz
**Ouch!** e se levanta antes da saudação **Hello, im a Sato Agent**. Ele pisca,
acompanha o ponteiro e alterna entre aceno, cócegas, dança e timidez ao receber
toques. A dança dá uma volta completa no corpo e duas voltas nos braços.
Navegadores que bloqueiam autoplay liberam os bips sintetizados no primeiro
gesto; o modal de configurações contém o controle para silenciar.
Dashboard e Lab ficam no canto superior direito: o robô anuncia o destino antes
de navegar. A antiga página de estatísticas públicas foi removida; os indicadores
continuam em `/dashboard` e `/api/stats`.

O campo fica compacto no rodapé e expande ao digitar. O histórico abre uma
conversa com balões, datas e horários, mantendo o input disponível. Na cena,
respostas têm uma prévia de até cinco linhas/420 caracteres, e perguntas de
duas linhas/180 caracteres. **Ver mais** abre a mensagem integral no histórico.
As superfícies têm blur sem linhas de borda. Os botões usam SVGs oficiais do
Lucide, servidos localmente; licença e revisão em `static/icons/README.md`.
O layout acompanha o viewport disponível quando o teclado móvel abre e respeita
a preferência por movimento reduzido. Sem WebGL, chat e navegação continuam.

As configurações oferecem preto, laboratório e floresta, e salvam a escolha
neste navegador. Os dois cenários são miniaturas feitas com os materiais e
árvores do lab; são carregados uma vez, sob demanda, no mesmo canvas. A troca
desvanece pelo preto e oculta o cenário inativo. A cena limita a 30 fps e DPR
1,75, sem carregar o campus ou mapas HDR. Robôs da raiz e do lab compartilham
obturador dentro do encaixe branco da lente, íris azul radial, dedos articulados
e pés arredondados com dobradiças.

A raiz usa a mesma autenticação, fila persistente e processo Hermes isolado do
chat livre do Núcleo. Não há respostas locais substituindo o modelo quando ele
está indisponível. O servidor prepara contexto de todos os setores, indicadores
da VM, catálogo e trechos relevantes de memória, contexto, skills e RAG, com
limites de tamanho e remoção de credenciais. O modelo também responde assuntos
gerais, declara lacunas e não pode executar ferramentas. Esse contexto contém
leituras selecionadas das fontes do dashboard, não acesso arbitrário em tempo
real a qualquer arquivo da VM.

## Laboratório 3D

Abra `/lab` pelo link **Laboratório 3D** no dashboard ou na página inicial.
É uma segunda visualização do mesmo host e das mesmas fontes do Hermes: não
precisa de outro serviço, Node.js em produção ou conexão com CDN. Three.js
0.180.0 e sua licença MIT estão em `static/vendor/`; o cenário e os personagens
são locais. O avatar usa o GLB fornecido pelo dono do repositório; cenário e robôs
são procedurais, sem arquivos extraídos dos jogos de referência.

- Setores: núcleo Hermes (agentes, subagentes e tools), providers, MCP, RAG,
  memória/skills, EVENTS (cron jobs e webhooks) e infraestrutura. As linhas do piso representam a
  arquitetura conceitual, não tráfego de rede capturado.
- A cena Three.js ocupa toda a tela; mapa, telemetria e conversa são overlays.
  WASD/setas movem; Shift ou **Correr** alterna para corrida. Clique esquerdo/F dá um soco e Espaço/**Pular** salta. Clique direito no piso
  escolhe um destino; arraste com o botão direito para girar e use a roda para zoom.
  No celular, arrastar a área inferior esquerda anda; o analógico aparece durante
  o toque e as ações aparecem no canto inferior direito enquanto ele se move.
  Correr, pular e socar usam ícones locais do Game-icons.net (CC BY 3.0), e o som fica junto das câmeras no topo. A interação usa um
  botão flutuante, sem seleção de texto, com ícone de toque ou tecla E conforme
  o dispositivo usado. Ele escolhe uma posição acima/abaixo do personagem que
  evita cobrir o objeto. O personagem gira na direção do movimento. **Seguir** acompanha o personagem;
  **Sala** enquadra o laboratório. Placas físicas identificam as estações.
- O som é opcional. Passos, corrida e soco usam amostras locais do Portal 2;
  o salto usa um efeito arcade sintetizado, com subida imediata e altura de 1,65 m.
  robôs têm passos/servos, terminais têm teclas e feedback, equipamentos têm
  mecanismos e as linhas iluminadas têm pulsos elétricos. O volume e o estéreo
  seguem a distância e a câmera, com silêncio fora do alcance. Motores, ventiladores e água têm loops locais atenuados por distância;
  até quatro fontes próximas tocam juntas, com natureza no exterior e um fundo
  contínuo de equipamentos no salão. A recepção permanece mais silenciosa. A origem e os recortes estão em `static/audio/portal2/`.
- A lista de estações/robôs escolhe um destino e o personagem caminha até ele,
  contornando equipamentos e robôs. **Conversar** e a tecla E só funcionam
  dentro da estação, perto do robô. Durante o diálogo, a câmera sobe e recua,
  mantendo balões e formulário dentro da tela; Escape encerra a conversa.
  Sem WebGL 2, o painel de telemetria e o dashboard continuam disponíveis.
- Guias explicam cada setor. Robôs individuais representam processos detectados,
  registros em `agent_runs`/`subagent_runs`, servidores MCP e jobs. O laboratório
  lê até 48 registros por tabela de agentes. Mostra até quatro robôs por setor:
  responsável e três trabalhadores que compartilham uma única bancada por setor. Selecionar outro robô na lista reserva
  uma bancada para ele; a lista contém todos os robôs incluídos no snapshot.
  Cada setor tem uma fileira com painel numerado, seis monitores e um painel
  de histórico do mesmo tamanho do numerado, com espaço entre eles. O grid
  reserva células de 2 m no chão e na parede; detalhes em [docs/lab-grid.md](docs/lab-grid.md). O gateway fica na parede da recepção, atrás do robô. O responsável do
  núcleo tem carcaça oval maior e óptica laranja.
- O avatar usa `static/models/sato.glb`, com idle ancorado (4,8 s),
  caminhada (0,92 s) e piscar independente. As poses se misturam ao iniciar/parar. A cadência
  acompanha a velocidade real, com aceleração e desaceleração. Detalhes e
  regeneração em `static/models/README.md`. Robôs mantêm poses procedurais
  de respiração, apoio, piscar e gestos; operam seus terminais
  e se voltam para quem entra na estação; a pupila central é azul emissiva.
  As pernas seguem a distância percorrida, as juntas têm limites externos à carcaça,
  e as pálpebras mecânicas fecham sobre a óptica. Esses gestos são ambientação, não evidência de execução. O indicador e os dados
  continuam distinguindo atividade real, dados ausentes e leituras antigas.
  A cena limita a 30 fps, agrupa geometria estática, reaproveita materiais e
  atualiza as sombras reais a cada frame renderizado. Há pausa de animações no mapa e respeito
  à preferência de movimento reduzido do sistema.
- Dados ausentes aparecem como **sem telemetria**, nunca como uma execução
  fictícia. **Atividade recente** significa um evento nos últimos 180 segundos;
  **processo detectado** não confirma trabalho. Registros `running` sem um
  timestamp recente aparecem como **último estado sem confirmação**. Identidade
  e parentesco vêm de `id`/`run_id`/`agent_id` e `parent_id`/`parent_run_id`.
- A VM tem dois corredores entre armários de servidor. Seus monitores mostram
  CPU/RAM/disco em barras de progresso e os processos por uso de CPU, a cada
  snapshot (5 s). Falhas preservam a última leitura identificada; sem leitura
  anterior aparece um traço. Os tubos dos providers ficam no corredor lateral,
  com conexões alinhadas ao percurso e circulação ilustrativa de líquido por
  entrada superior e retorno inferior; o painel mantém os dados reais da amostra recente.
- A oficina de skills tem pilhas de livros e exibe o catálogo no sexto monitor.
  MCP tem caixas de ferramentas e uma blueprint; o núcleo tem um cérebro em
  água; EVENTS tem relógios de fusos reais que apitam nos horários dos crons
  próximos quando o som está ativado.
  O mural na parede mostra o calendário real de atividades (365 dias, UTC),
  atualizado a cada 15 s. O catálogo de skills usa o cache existente de 30 s.
- Exterior e recepção escurecem nas passagens das portas e são retirados da
  renderização ao avançar; perto de paredes opacas só o ambiente atual fica
  visível. Retornam ao sair pelas passagens. Portas e mural acompanham as paredes nos recortes da câmera.
  As árvores internas e externas compartilham folhagem e casca texturizada, com
  uma árvore maior e cipós num espaço livre à direita. O riacho usa reflexos e
  ondulações suaves, e as pedras têm variação mineral e musgo.
- Dentro de RAG, **Explorar rede RAG** aproxima a cúpula menor, montada sobre seu projetor: clique nos pontos ou
  na lista para abrir repositórios/categorias/documentos. A busca usa o mesmo
  `/api/rag/search` do dashboard (LanceDB/fastembed), mostra trechos e distâncias
  reais e anima as conexões dos resultados. O layout 3D é ilustrativo: não
  representa coordenadas originais dos embeddings nem o caminho interno do
  índice. São até 180 nós e 12 resultados por busca; falhas preservam o último
  grafo. O catálogo da cúpula atualiza a cada minuto fora do explorador.
- Com `HERMES_WEB_CHAT_PASSWORD_HASH` e `HERMES_WEB_CHAT_SESSION_SECRET`
  configurados, a conversa privada enfileira perguntas para o **Hermes real**.
  A pergunta e o estado ficam em SQLite (`~/.hermes/web-chat.sqlite3`, WAL), e
  a interface consulta o resultado periodicamente sem manter uma conexão longa
  com o túnel. O worker tenta novamente até três vezes e recupera trabalhos
  interrompidos após o prazo de processamento. O histórico permanece ao fechar
  a página. Sem a configuração privada, a prévia local mantém as respostas
  determinísticas de telemetria usadas antes.
- O chat web é limitado a respostas informativas. Pedidos de ação recebem
  explicações, usa dados e documentos selecionados da VM e inicia uma
  sessão Hermes separada com o toolset vazio `context_engine`. Antes
  de cada chamada, verifica no Hermes instalado que esse toolset resolve para
  **zero ferramentas**; se isso mudar, falha fechado. O texto da pergunta vai
  pela entrada padrão do runner JSON, sem shell. Assim o Hermes não recebe
  terminal, escrita de arquivos, MCP, navegador nem ferramentas de delegação.
  O bloqueio de execução é estrutural; o modelo ainda pode produzir uma resposta
  imprecisa, então estados e métricas continuam atribuídos à telemetria.
- O acesso ao chat exige senha própria, sessão assinada em cookie HttpOnly,
  Secure e SameSite Strict, token CSRF, origem coincidente e limite de tentativas
  de login. Isso protege o chat; as outras rotas do dashboard permanecem com a
  política de acesso anterior.
- `/api/lab/state` atualiza a cada 5 segundos; os catálogos têm cache de 30
  segundos por processo Flask. `/api/lab/chat` aceita JSON com `robot_id` e
  `question` (até 500 caracteres). Falhas isoladas de coleta não derrubam os
  demais setores. Polling e animação param quando a página fica oculta.

Para habilitar o chat privado na VM, defina no ambiente do serviço Flask
`HERMES_WEB_CHAT_PASSWORD_HASH` (hash gerado por
`werkzeug.security.generate_password_hash`) e
`HERMES_WEB_CHAT_SESSION_SECRET` (segredo aleatório longo). Mantenha ambos fora
do Git e preserve os valores entre reinícios. O processo Flask único da VM
executa o worker em segundo plano. O Hermes instalado deve estar em
`~/.hermes/hermes-agent`; o worker usa a configuração de provider desse Hermes.
Quando o provider falha, a pergunta continua no banco para nova tentativa.

### Campus e identidade visual

A identidade compartilhada usa a imagem fornecida pelo proprietário (`static/sato-logo.png`)
como logo e favicon e a Nunito local em todas as páginas e textos da cena.
O campus usa escala visual 0,7, com navegação em coordenadas lógicas, fachada mais baixa,
letreiro arredondado e enquadramento inicial responsivo. Os materiais CC0 de 1K e o céu
HDR da Poly Haven estão em `static/textures/polyhaven/`, com fontes e licença no README.
Nenhum desses recursos depende de CDN em produção.

A recepção tem um atendimento GATEWAY unificado, mapa físico numerado e divisória
com passagem central para visitantes e um vão de esteira. O salão é pré-compilado
em preto durante o loading; piso, equipamentos e luzes aparecem gradualmente ao
atravessar a porta, sem recriar os setores. A transição termina mesmo com movimento
reduzido. As paredes entre a câmera e o interior são recortadas suavemente.

O layout agrupa GATEWAY (00), INFRA / VM (01), CORE / HERMES (02),
INTEGRATIONS / PROVIDERS e MCP (03–04), DATA / MEMORY e RAG (05–06) e SCHEDULE / CRON (07).
O CORE tem duas sequências de degraus e patamar intermediário; a navegação e os robôs
usam as mesmas alturas da geometria. Pisos e rodapés têm afastamentos explícitos para
evitar planos coplanares. As áreas têm contornos retangulares arredondados, indicadores
verticais claros e visores digitais. Os SVGs locais são do Lucide (licença em
`static/icons/lucide/LICENSE`); o mapa usa a mesma numeração e posições físicas.
Pontos azuis no piso animam o fluxo entre o CORE e as áreas. Tubos largos transportam
pacotes ilustrativos, e o painel de atividades ocupa a parede de fundo.

O exterior segue a composição da referência do Nintendo Museum: painéis modulares
com juntas, faixas contínuas de vidro, marquise longa e painel escuro junto à quina.
A cápsula em relevo contorna somente “Sato Agents”, com “LAB” separado abaixo.
A calçada tem contorno arredondado, meios-fios, grelhas de drenagem e canteiros com
árvores e forrações; uma faixa de asfalto distingue a rua da área de pedestres.

A clareira é cercada por floresta instanciada, com menos cartões de folhagem nas
árvores distantes. O relevo usa ruído em múltiplas escalas e a mesma interpolação
dos triângulos para apoiar troncos e personagens. Um shader mistura grama e solo
Forest Floor da Poly Haven, com borda irregular. O terreno distante desvanece
sobre o céu real por alfa, eliminando a faixa sólida da fog no limite do plano.

O interior usa uma linguagem de câmara de testes inspirada nas referências de Portal 2:
placas cinza com juntas, painéis de parede, carcaças brancas, bases grafite e luzes ciano.
As texturas procedurais de 512 px acrescentam granulação, parafusos e desgaste leve,
sem texturas extraídas do jogo. Ao atravessar a entrada, o exterior e o céu escurecem
gradualmente; ao sair, recuperam a luminosidade. O multiplicador atua após a iluminação
e a mistura do terreno, sem modificar os materiais internos. A posição lateral ao
prédio não dispara essa transição. `tests/browser/chamber.spec.cjs` verifica entrada,
saída, preservação da cor interna e compilação dos materiais.

Pacotes reutilizáveis percorrem as esteiras, caem com aceleração, quicam e se acomodam
em uma bandeja de triagem com caixas acumuladas. Sete entregadores percorrem rotas que
desviam de equipamentos e posições de trabalhadores, param para coleta/depósito e
voltam sem carga. Isso continua sendo uma ilustração da arquitetura, não telemetria de tarefas.

O áudio é ativado pelo visitante: passos, portas, chegada ao salão, painéis, conversa,
coleta/queda de caixas e ambiente usam amostras locais da biblioteca indicada.
Fontes e créditos estão em `static/audio/portal2/README.md`. O som das caixas diminui
com a distância; ocultar a página pausa o áudio.

Validação: `npm run test:navigation` verifica colisões, degraus e queda de pacotes.
`tests/browser/lab-layout.spec.cjs` verifica o atendimento único, rotas, entrega,
transição reversível com movimento reduzido e decodificação das amostras de áudio.

### Plataformas e jardim interno

Os setores internos ficam em plataformas metálicas a 1,86 m, ligados por passarelas
retas e corrimãos. Uma rampa liga a recepção ao nível elevado; o CORE preserva seus
degraus acima desse nível. Geometria e navegação compartilham a mesma planta: o
personagem e os entregadores permanecem nas plataformas, e as rotas azuis seguem
somente segmentos ortogonais. Abaixo há vegetação instanciada, rochas e um riacho
com ondulação de superfície. As paredes internas têm 16 m; o calendário de atividade
fica na metade superior, com centro a 12 m, acima dos equipamentos.

Carcaças e equipamentos mantêm mapas de acabamento, relevos e reflexos metálicos
após o agrupamento de geometria. Robôs têm pistões, juntas, dissipadores, trilhas
luminosas e indicadores. Varredura do olhar, inspeção ociosa, operação de terminais,
caminhada e respostas usam poses distintas. Os sons de personalidade e piscada,
ventiladores, motores e água vêm da biblioteca Portal 2 indicada pelo proprietário;
pequenos gestos de áudio procedurais complementam os samples. Os créditos e a
revisão exata da fonte estão em `static/audio/portal2/botanical-sources.json`.

### Interações e EVENTS

O botão contextual **E** aparece perto dos robôs (**Conversar**), no RAG
(**Explorar vetores**) e nas demais estações (**Ver indicadores**). No celular,
toque no botão. O acesso adicional **Explorar rede RAG** continua disponível
na área RAG, inclusive perto de seu robô. Balões e histórico têm rolagem e
reservam espaço para o formulário de conversa dentro da tela.

O setor e a aba **EVENTS** reúnem cron jobs e webhooks via `/api/events`.
Os jobs preservam as fontes de `/api/cronjobs`. Webhooks são lidos do formato
oficial do Hermes: `platforms.webhook.extra.routes` no `HERMES_CONFIG_PATH` e
`webhook_subscriptions.json` dentro de `HERMES_HOME`. Rotas estáticas têm
precedência sobre subscriptions com o mesmo nome. A API publica apenas
metadados (nome, eventos, perfil, associação a cron e estado configurado),
sem segredos, headers de autenticação ou prompts. Essa leitura não comprova
que a VM está recebendo eventos. Se a instalação usar outro formato, a fonte
aparece indisponível e será necessário adaptar o leitor ao arquivo da VM.

### Atualizar a VM

O job Hermes `update-dashboard` roda a cada 30 minutos em modo `no_agent`.
Sua cópia instalada em `~/.hermes/scripts/update-dashboard.sh` corresponde a
[`tools/update_dashboard.sh`](tools/update_dashboard.sh). O script busca a
`main` de `satoLG/sato-agents-lab` por Git, tenta novamente em falhas de rede,
e só aceita avanço linear com os arquivos versionados locais intactos. Antes
de trocar a versão em `/home/leona/projects/hermes-dashboard`, valida Python,
templates e a rota `/lab` em uma cópia temporária. Depois reinicia
`hermes-dashboard.service` e verifica `/lab` e `/api/lab/state`. Se o serviço
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

### Validar o laboratório

```bash
python -m pytest tests/ -q
python tools/check_html.py
# Em outro terminal, mantenha python app.py rodando.
npm ci                       # ferramentas de desenvolvimento, não de produção
npx playwright install chromium
npm run test:navigation
npm run test:browser
```

`LAB_TEST_URL` pode apontar os testes de navegador para outro endereço local.
Os testes cobrem dados ausentes, eventos Unix/ISO, subagentes e parentesco,
estados antigos, isolamento de coletores, validação da conversa, renderização
WebGL em tela cheia, colisão e caminhos, acesso aos sete setores, proximidade
para conversar, subagentes, texto não confiável, reconexão, mobile e fallback sem GPU.
Em Windows sem privilégio de symlink, o teste preexistente
`test_symlink_quebrado_na_memoria` precisa ser executado em Linux ou excluído
localmente com `-k 'not symlink_quebrado'`.

Para reconstruir a dependência 3D: `npm ci && npm run build:three`. O arquivo
gerado é versionado; preserve `static/vendor/THREE-LICENSE.txt` nas atualizações.

> **Sem autenticacao.** O dashboard e as rotas `/api/*` estao abertos a quem
> alcancar a porta, e expoem processos, disco, memoria e o config (redigido) da
> VM. Rode atras de tunel SSH, firewall ou basic auth do nginx enquanto a auth
> de verdade nao existe.

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
  base.html                shell; dashboard.html; home.html; lab.html
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
