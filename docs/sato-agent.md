# Sato Agent: comportamento detalhado

Especificação da página `/` e do worker do chat. Visão geral no [README](../README.md).

## Cena e robô

`/` apresenta um robô do laboratório próximo ao campo de mensagem. Após o
carregamento, o tubo da recepção desce, entrega o robô e recolhe; ele cai e
volta a flutuar. A conversa começa vazia, sem balões de saudação. Ele pisca,
acompanha o ponteiro e alterna entre aceno, cócegas, dança e timidez ao receber
toques. A dança dá uma volta completa no corpo e duas voltas nos braços.
Navegadores que bloqueiam autoplay liberam os bips sintetizados no primeiro
gesto; o modal de configurações contém o controle para silenciar.
A página não tem links para o Dashboard.
O Sato Agent da raiz tem corpo esférico com três linhas de encaixe, olho recuado
em uma área mecânica escura e braços lisos, sem mãos ou pernas. Corpo e braços
mantêm suas dimensões durante os gestos. Uma pequena antena gira e pisca na cor
do olho; a base magnética menor emite três anéis que descem, encolhem e somem.
Os braços ficam recolhidos até a carcaça inteira sair pela boca aberta do tubo.
Durante a espera, o chat alterna frases e exibe três pontos SVG animados ao fim do texto; o indicador
some quando a resposta ou o erro chega. Movimento reduzido desativa a animação.

## Chat, histórico e balões

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
Ao abrir uma conversa, o histórico fica invisível até as mensagens chegarem e
então mostra a mais recente, com as últimas entrando em sequência. Ao fechar o
histórico, os balões da cena só voltam depois que o painel sai, um após o outro.
A resposta sobe para não ficar sob o botão **?** ao lado do robô; quando o
cabeçalho não deixa espaço, o **?** sai de cena até a prévia recolher.
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

## Fundos e cenários

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
mesmo canvas. A troca desvanece pelo preto e oculta o cenário inativo. Na travessia
pelo portal, o próximo cenário só aparece dentro do rasgo e ocupa a tela junto
com a expansão dele. A cena
preenche todo o viewport, inclusive atrás do chat. O cenário salvo é preparado
durante o loading e revelado suavemente. Com o som ativo, laboratório e floresta
tocam loops locais: o laboratório usa o arquivo `amb_machinery_factory_lp_01.wav`
enviado pelo usuário, convertido para Ogg e em volume baixo. A floresta mantém
o loop de natureza com volume menor e filtro suave nas frequências agudas,
reduzindo o destaque dos pássaros. O controle de som também silencia a digitação.

## Exploração (Play/Stop)

Nos cenários Laboratório e Floresta, o botão Play entre Enviar e Configurações
assume o controle do robô e vira Stop. No desktop, WASD/setas movem em relação à
câmera; arrastar o fundo gira a visão; Esc sai. No celular, o primeiro contato
à esquerda revela um único analógico no local do dedo, ocultado ao soltar. O
restante do fundo gira a câmera, inclusive com dois dedos simultâneos. Paredes,
equipamentos, margem do rio e arbustos bloqueiam o robô e encurtam a câmera.
Ao sair, o robô permanece onde parou e a câmera escolhe uma vista frontal livre,
sem atravessar a sala. Entrar e sair da exploração não corta a imagem: o primeiro quadro
repete o anterior e posição, direção, campo de visão e enquadramento deslizam
até a nova vista em 0,8 s (sem animação com movimento reduzido). A íris segue cursor/toque nos dois eixos, limitada a 0,025
unidade dentro da abertura mecânica; o conjunto óptico fica fixo na carcaça.

## Câmera e desempenho

A câmera inicial segue a posição no chão, sem acompanhar a queda do tubo.
Fora da exploração, a câmera depende somente do viewport: perguntas, balões e histórico não alteram
o zoom, a distância nem as proporções da cena;
resizes reais são agrupados no frame que já desenha a cena.
A cena limita a 30 fps e DPR 1,75, sem carregar o campus ou mapas HDR.

## Contexto do modelo

A raiz usa a mesma autenticação, fila persistente e processo Hermes isolado do
chat livre do Núcleo. Não há respostas locais substituindo o modelo quando ele
está indisponível. O servidor prepara contexto de todos os setores, indicadores
da VM, catálogo e trechos relevantes de memória, contexto, skills e RAG, com
limites de tamanho e remoção de credenciais. O modelo também responde assuntos
gerais, declara lacunas e não pode executar ferramentas. Esse contexto contém
leituras selecionadas das fontes do dashboard, não acesso arbitrário em tempo
real a qualquer arquivo da VM.

## Worker do chat e cache de contexto

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
