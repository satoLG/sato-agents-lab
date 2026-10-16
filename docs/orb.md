# orb

`/orb` apresenta o canvas, um botão discreto de som e o ícone para acordar
Sato após a entrada. A câmera permanece centralizada
no mundo, com OrbitControls, zoom por roda/pinça e atalhos descritos no rótulo
acessível da cena. A água começa com ondulação de 90% e transmissão física de
100%; a coloração azul e o brilho de um único ponto de luz branca continuam visíveis.

A lua tem 43% do raio do núcleo sob a água (0,7912 contra 1,84), com textura
de rocha Rock Boulder Dry da Poly Haven (CC0). Cor e normal map em 512 × 512 e
altura em 64 × 64 somam 78.313 bytes. A malha recebe desníveis uma única vez,
com relevo contínuo e amostragem triplanar da altura. Cor e normal map também
usam projeção triplanar, sem UVs esféricas ou textura esticada nos polos.
Bases tangentes derivadas por projeção mantêm o relevo iluminado em todos os lados. As normais geométricas coincidem na emenda e nos polos.
Fontes e reprodução estão em `static/textures/orb-moon/README.md`.
Sua órbita circular fica no plano perpendicular à direção da câmera inicial,
com raio de 4,75 e uma volta a cada cinco minutos. A lua também gira em torno
do próprio eixo a cada oito minutos. O plano permanece fixo ao
usar OrbitControls. O enquadramento de entrada acomoda a órbita inteira na
menor dimensão da tela; a câmera pode ser aproximada manualmente depois.

A direção da lua alimenta o shader da água em coordenadas do planeta. Dois
volumes de maré permanecem presentes, com uma pequena preferência pelo lado
próximo da lua. A altura de maré é sempre positiva, e a amplitude das ondas
varia de 76% a 124% da base conforme a orientação; nenhum lado fica parado.
A maré do oceano aberto chega a 0,078 no lado da lua, contra 0,048 antes.
Junto à ilha, um envelope eleva a água sobre a areia existente, deixando
uma faixa visível junto à grama. O ponto de contato foi ajustado de 0,76 para
0,92 do contorno da costa: aproximadamente três vezes a largura da primeira
faixa estreita, medida a partir do limite da grama em 0,67. O contato oscila
suavemente em torno de 0,92, com duas frequências lentas e amplitude total de
0,022, criando um vai e vem sem descobrir grandes faixas de areia.
Ondas e maré são atenuadas nessa região,
evitando que os vales descubram uma praia larga ou inundem as raízes.
O perfil, a quantidade de areia e os materiais da ilha não foram alterados.
A deformação e as normais usam a mesma função, preservando reflexos e espuma
de contato. O núcleo permanece submerso. Pausar o movimento também pausa a
órbita e a maré, e movimento reduzido mantém a cena estática por padrão.

## Fontes reutilizadas

Os trechos do [portfólio](https://github.com/satoLG/portfolio) foram adaptados da
revisão `e32fd55a0182186d89054ca4bf5628b24b887435`:

- [`src/shaders/OceanShaders.ts`](https://github.com/satoLG/portfolio/blob/e32fd55a0182186d89054ca4bf5628b24b887435/src/shaders/OceanShaders.ts): `linearizeDepthBuffer`, comparação da profundidade opaca com a profundidade analítica da água e composição que clareia a espuma.
- [`src/effects/SceneDepth.ts`](https://github.com/satoLG/portfolio/blob/e32fd55a0182186d89054ca4bf5628b24b887435/src/effects/SceneDepth.ts): pre-pass com DepthTexture de 24 bits, filtro nearest e suspensão dos shadow maps durante a captura.
- [`src/core/UI.ts`](https://github.com/satoLG/portfolio/blob/e32fd55a0182186d89054ca4bf5628b24b887435/src/core/UI.ts) e [`src/style.css`](https://github.com/satoLG/portfolio/blob/e32fd55a0182186d89054ca4bf5628b24b887435/src/style.css): botão circular com três camadas de ondas, nível de água crescente, percentual, blur, bounce e partículas azuis ao concluir. A orb usa um ícone de entrada, sem welcome text.

As árvores são as mesmas da floresta, construídas por `scene-grove.js` com
`folio-foliage.js`, a textura SDF local, a paleta e o vento existentes. Grupos
escalados preservam as proporções e a amplitude de vento do modelo original.
A grama reutiliza `home-grass.js`, com blades 42% mais baixos, uma grade mais
densa e a mesma cor e orientação de iluminação do chão. A costa passa por uma
curva suave junto ao nível da água e se enterra no núcleo; os dois materiais
compartilham a textura 3D do planeta no trecho submerso. Nove pedras
irregulares e foscas usam três malhas instanciadas com 180 faces cada,
normais suavizadas e os mesmos mapas de cor e normal da lua. As seis
internas continuam pequenas; as três externas são maiores e elevadas para
permanecer acima da água e servir como plataformas de salto. Elas ficam entre
1,32 e 1,48 vezes o raio da costa, com topos planos orientados pela gravidade
local e laterais irregulares. As bases se enterram no fundo real do planeta,
sem suspender as pedras acima dele. A colisão usa seus triângulos reais.
A atribuição da base de vegetação permanece em `scenic-environments.md`.

## Espuma e carregamento

A espuma usa a profundidade real da cena a cada render, antes da superfície de
água. Não depende de uma máscara ou raio fixo da ilha; novas malhas opacas
participam automaticamente. Água, halo, estrelas, sprites, folhas transparentes,
grama e o núcleo permanentemente submerso ficam fora desse pre-pass.

A captura usa a resolução completa do canvas para preservar sua linha de
contato estreita, mas só é refeita quando a câmera ou geometrias opacas mudam.
Lua, folhas e ondas não invalidam uma captura estática. A faixa de espuma tem
largura projetada limitada e amostras vizinhas permitem que ela ultrapasse
suavemente a silhueta do modelo. A profundidade da água vem dos vértices
deformados em view space; a
linearização mantém a correção de precisão móvel do portfólio. Targets e
texturas são redimensionados com o canvas e liberados ao sair.

A costa adapta `ripplesNode` e `shoreNode` de
[WaterSurface.js, folio-2025](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/World/WaterSurface.js)
(MIT, licença em `static/textures/folio-2025/LICENSE.txt`): fase baseada na
distância à costa, ruído com deslocamento por faixa e máscara rasa. A borda
costeira chega a 4,5 pixels; atrás dela, contornos brancos descontínuos avançam
e desaparecem numa faixa de 0,14 unidade, com antialias pelas derivadas da GPU.
Outras intersecções mantêm 2,5 pixels. A máscara limita esse detalhe à praia.

O loading acompanha preparação, textura de folhagem, compilação dos shaders e
o primeiro render com profundidade e a preparação dos arquivos de passos. Chega a 100% somente quando a cena está
pronta; a entrada fica bloqueada até então. Movimento reduzido elimina espera
e animações decorativas. Falhas interrompem o loading e mostram recuperação.

O círculo centralizado mede entre 120 e 144 px. A distância inicial da câmera
é calculada a partir desse diâmetro, da altura do canvas e do campo de visão,
para alinhar a esfera ao loading mesmo ao redimensionar a tela. Ao concluir,
o botão mantém seu estado visível e apresenta o play. O clique libera os
controles imediatamente e aproxima a câmera ao enquadramento padrão em
2,8 segundos, agora incluindo toda a órbita lunar; um gesto pode interromper
essa transição. Com movimento reduzido, a câmera assume diretamente o
enquadramento padrão. O progresso usa o tempo
entre frames para manter seu ritmo mesmo em dispositivos mais lentos.

A renderização limita o canvas a 900 mil pixels e reaproveita sombras estáticas.
A refração passa de 50% a 75% da resolução por eixo e o ambiente gerado passa
de 512 × 256 a 1024 × 512 para preservar detalhes. A malha da água usa triângulos
uniformes e vértices compartilhados, evitando anéis de latitude. A normal vem
do gradiente analítico da deformação, com uma avaliação por vértice, sem a troca
de base tangente que marcava uma linha junto ao polo. A água mantém transmissão
de 100%, com roughness 0,23, sem reflexão do ambiente ou sombras projetadas.
Um destaque branco explícito substitui os reflexos do ambiente. A refração
existente do Three r180 é filtrada: lua, árvores e grama ficam fora dessa
textura. Terreno, pedras e Sato passam sem cortes radiais; espessura zero e
IOR 1 mantêm sua imagem na posição real, evitando duplicatas refratadas. A
coloração azul mais clara preserva a leitura do personagem submerso, evita a faixa verde produzida pela areia e não há sombras
projetadas nas superfícies submersas. Isso não exige outro passe da cena. Um mínimo de azul evita que os raios que
enxergam o espaço preto criem uma faixa aparentemente refletida na borda.
Alterações em modelos, buffers,
visibilidade ou câmera continuam atualizando profundidade e sombras.

O fundo usa azul-marinho `#14243f`, com 3.400 estrelas mais claras e um brilho
azul suave. A mudança não acrescenta passes de renderização.

## Sato e caminhada esférica

`orb-sato.js` adapta diretamente o companion de `createRigFactory`: preserva
seu casco esférico, braços em forma de nadadeira e materiais. Braços e pernas
compartilham a versão arredondada dessa estrutura contínua, mais curta e grossa,
sem pés separados. A antena nasce perto da frente do casco, sobe em diagonal e
termina em um caracol; uma mola acompanha passos, impulsos e aterrissagens.
O shader flexiona a haste e sua ponta luminosa acompanha a mesma deformação.
O display preto é uma calota da mesma esfera do casco, integrada à curvatura.
Nele, o olho conserva o aro azul, a íris com 32 marcas radiais e as cores do
modelo original. Sobrancelha, piscadas, olhares e alegria também são desenhados
nessa superfície. Bateria, linhas de manutenção, obturador mecânico e emissor
de flutuação são removidos da versão da orb.
As poses de sentar, levantar, andar rápido, pular e aterrissar usam juntas
independentes, squash/stretch com mola amortecida e pequenos gestos dos braços.
O segundo pulo comprime e estica corpo e membros, sem giro rígido. A raiz física não é deslocada pelas
animações. Os modelos existentes da home e do laboratório não são alterados.

Sato começa dormindo, sentado no centro da ilha, com o olho fechado no display,
respiração suave, pequenos movimentos de cochilo e antena inclinada. O botão de
acordar é apenas um ícone circular, sem convite ou instruções visíveis. Usa a
mesma classe `scene-icon` do controle de mensagens da home, além da fonte,
paleta, vidro e sprite Lucide compartilhados do site. Sair, pular e silenciar
seguem esse estilo. As instruções continuam acessíveis aos leitores de tela.
Ao acordar, Sato abre o olho, se espreguiça com os braços e se levanta antes de
andar; ao sair, volta ao descanso, mesmo com a animação ambiente pausada.
Com movimento reduzido, as transições de entrada são imediatas e o balanço diminui.
Clique nele, ative o ícone ou use
`E`/`Enter` com foco na cena para assumir o controle. `WASD`/setas andam,
`Espaço` pula e um segundo acionamento no ar executa o pulo duplo. Um terceiro
pulo é bloqueado até a aterrissagem. Arraste para olhar e use a roda ou pinça para
ajustar a câmera entre 1,25 e 4,2 unidades. `Escape` ou Voltar à órbita devolvem OrbitControls.
No celular, o direcional e Pular aceitam dois dedos simultâneos; o pulo usa
pointerdown para não depender de cliques de compatibilidade do segundo dedo.
A câmera parte de 2,15 unidades a 0,64 radiano de elevação e acompanha a posição
com amortecimento, sem perseguir a direção em que Sato olha. Virar ou andar de
costas não gira a câmera: sua orientação só muda por arrasto ou pelo transporte
radial necessário para percorrer a esfera. O olhar manual permanece no ângulo escolhido.
Folhas, troncos, pedras e a lua entre a câmera e Sato ficam até 84% transparentes por
um dither espacial suave, preservando instâncias e testes de alpha, sem novos
passes. A posição de oclusão é calculada depois do vento e das instâncias,
para acompanhar as folhas em movimento. Obstáculos não fazem a câmera girar
nem reduzir sua distância.

O motor integra a gravidade radial a 120 Hz, com passos limitados, preservando
uma base tangente por transporte ao redor da esfera. Corpo e câmera acompanham
essa base, inclusive na parte inferior do planeta. A velocidade é 0,58 unidade/s,
a gravidade 4,8 e os impulsos de pulo 1,48 e 1,30. Raios atingem os triângulos
reais da ilha e das pedras instanciadas. Uma sonda à frente da cápsula impede
atravessar laterais de pedras; troncos também bloqueiam o corpo. A água não é um
colisor: pés se apoiam na ilha, nas pedras ou no núcleo submerso. O núcleo usa
uma busca por célula angular que testa somente os dois triângulos candidatos,
iguais aos da malha visível. A altura da água é consultada separadamente para
calcular a imersão real, inclusive no ar, com a mesma deformação do shader. O ruído
usa hash inteiro reproduzível em JS e GLSL, com equivalência verificada na GPU.

Pegadas na areia usam um pool de 96 decalques, com desaparecimento em 18 s.
Na água, pernas e corpo ficam submersos conforme a altura do fundo.
Passos e pulos alimentam até oito perturbações locais: ruído desloca a frente,
altera altura/normal e desenha três anéis finos que se afastam do contato.
Antialias por derivadas mantém as bordas suaves, sem uma mancha de espuma
branca sobre Sato. As perturbações desaparecem em 2,2 s.
Um pool de 240 partículas balísticas emite gotas claras nos pulos e impactos;
a quantidade cresce com a profundidade de imersão. Os passos produzem apenas anéis. Rastros e partículas ficam fora do pre-pass de contato. Sato também fica
fora dele enquanto está em terra, preservando o cache durante o idle.

## Som do mar e dos movimentos

O Play cria e ativa o AudioContext dentro do gesto do usuário, inclusive no
celular. Ruído colorido filtrado e duas modulações lentas produzem um fundo
suave de água, sem downloads nem gravações externas. O volume entra aos poucos.
O botão de som e a tecla `M` permitem silenciar; ocultar a aba suspende o áudio
e sair da página libera os nós e fecha o contexto. Ausência de Web Audio não
impede a exploração visual. A pausa de movimento não interrompe a ambiência.
Os contatos usam dez gravações mono MP3 do pacote JDSherbert fornecido pelo
proprietário (165.196 bytes), alternando duas variantes de grama, areia, pedra,
poça e água. Os arquivos são locais, preparados durante o loading e decodificados
após o gesto de Play. A atribuição e os hashes originais estão em
`static/audio/orb-foley/`. Impulsos têm um envelope mais curto; aterrissagens
reproduzem mais da gravação, com volume proporcional ao impacto. Contato molhado
tem prioridade sobre o chão: poça em água rasa e água acima de 0,10 unidade
de imersão, com volume crescente. A cadência segue a distância percorrida, sem
passos no ar. As dez vozes máximas são desconectadas ao terminar. O botão de som
silencia a ambiência e todos os movimentos.

## Verificação

Os testes de navegador bloqueiam uma textura para verificar progresso real,
conferem a ausência de painéis, validam controles de teclado/toque e usam uma
malha independente parcialmente submersa para medir a máscara de espuma na
GPU. Sem contato ou com o objeto profundamente submerso, a máscara fica vazia.
O fluxo com animações normais também verifica a visibilidade e o clique do
play, o alinhamento responsivo e as posições intermediária e final da câmera.
Os testes da lua verificam a trajetória circular projetada, a proporção de
tamanho e a visibilidade da órbita no desktop e no celular. A leitura da
superfície na GPU confirma que a maré troca de lado ao inverter a posição da
lua, mantém água no lado oposto e preserva ondas em ambos os lados.
Também verificam reaproveitamento da profundidade durante a animação real,
invalidação para objetos/câmera e espuma fora da silhueta com espessura limitada.
Uma leitura do shader na GPU percorre 36 direções da costa, nove distâncias,
cinco instantes e quatro posições da lua: a areia externa permanece sob a água,
e a grama e uma faixa de areia permanecem acima. A mesma leitura compara normais analíticas
com derivadas numéricas. O teste de áudio usa o AudioContext real e um analisador
para verificar saída, silêncio, suspensão da aba e liberação ao sair.
Os testes de caminhada completam uma volta passando pela face inferior,
conferem gravidade, alinhamento, pulo duplo, laterais e topo das pedras e
troncos. No navegador, cliques, teclado e dois dedos controlam o personagem;
a espuma é lida na GPU usando seu corpo parcialmente submerso, e a textura de refração é
verificada diretamente. OfflineAudioContext renderiza os quatro tipos de
passo, decolagem e aterrissagem, comparando envelopes e saída de áudio reais.

A validação também compara o piso do núcleo com a malha renderizada, garante
apoio estável enquanto a maré muda, verifica espuma proporcional à imersão e
compara a saída de áudio molhado com areia. Readbacks da GPU confirmam a
expansão e o desaparecimento da esteira e a transparência de obstáculos sem
mover a câmera, incluindo as folhas com vento e a lua. O material lunar é
renderizado no polo com UVs colapsadas para confirmar que a projeção independe
delas; remover o normal map deve alterar o relevo iluminado. Gestos reais de dois dedos verificam zoom nos dois sentidos.
