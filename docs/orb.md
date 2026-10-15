# orb

`/orb` apresenta o canvas, um botão discreto de som e o convite para explorar
com Sato após a entrada. A câmera permanece centralizada
no mundo, com OrbitControls, zoom por roda/pinça e atalhos descritos no rótulo
acessível da cena. A água começa com ondulação de 90% e transmissão física de
100%; a absorção azul e o brilho de um único ponto de luz branca continuam visíveis.

A lua tem 43% do raio do núcleo sob a água (0,7912 contra 1,84), com textura
de rocha Rock Boulder Dry da Poly Haven (CC0). Cor e normal map em 512 × 512 e
altura em 64 × 64 somam 78.313 bytes. A malha recebe desníveis uma única vez,
com relevo contínuo e amostragem triplanar da altura; o normal map acrescenta
detalhes de iluminação. As normais geométricas coincidem na emenda e nos polos.
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
irregulares e foscas usam três malhas instanciadas com 20 faces cada. As seis
internas continuam pequenas; as três externas são maiores e elevadas para
permanecer acima da água e servir como plataformas de salto.
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

O loading acompanha preparação, textura de folhagem, compilação dos shaders e
o primeiro render com profundidade. Chega a 100% somente quando a cena está
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
textura, enquanto a parte submersa do terreno e das pedras continua presente.
Isso não exige outro passe da cena. Um mínimo de azul evita que os raios que
enxergam o espaço preto criem uma faixa aparentemente refletida na borda.
Alterações em modelos, buffers,
visibilidade ou câmera continuam atualizando profundidade e sombras.

## Sato e caminhada esférica

`orb-sato.js` adapta diretamente o companion de `createRigFactory`: preserva
seu casco esférico, braços em forma de nadadeira, materiais e antena. As duas
pernas clonam a mesma geometria dos braços, encurtada, e a antena fica central.
O display preto é uma calota da mesma esfera do casco, integrada à curvatura.
Nele, o olho conserva o aro azul, a íris com 32 marcas radiais e as cores do
modelo original. Sobrancelha, piscadas, olhares e alegria também são desenhados
nessa superfície. Bateria, linhas de manutenção, obturador mecânico e emissor
de flutuação são removidos da versão da orb.
As poses de sentar, levantar, andar rápido, pular e aterrissar usam juntas
independentes, squash/stretch com mola amortecida e pequenos gestos dos braços.
O segundo pulo também faz um giro curto. A raiz física não é deslocada pelas
animações. Os modelos existentes da home e do laboratório não são alterados.

Sato começa dormindo, sentado no centro da ilha, com o olho fechado no display,
respiração suave, pequenos movimentos de cochilo e antena inclinada. O botão de
acordar é apenas um ícone circular, sem convite ou instruções visíveis. Usa a
mesma classe `scene-icon` do controle de mensagens da home, além da fonte,
paleta, vidro e sprite Lucide compartilhados do site. Sair, pular e silenciar
seguem esse estilo. As instruções continuam acessíveis aos leitores de tela.
Ao acordar, Sato abre o olho, se espreguiça com os braços e se levanta antes de
andar; ao sair, volta ao descanso, mesmo com a animação ambiente pausada.
Com movimento reduzido, essas transições e o giro do pulo são imediatos.
Clique nele, ative o ícone ou use
`E`/`Enter` com foco na cena para assumir o controle. `WASD`/setas andam,
`Espaço` pula e um segundo acionamento no ar executa o pulo duplo. Um terceiro
pulo é bloqueado até a aterrissagem. Arraste para olhar e use a roda para
ajustar a câmera. `Escape` ou Voltar à órbita devolvem OrbitControls.
No celular, o direcional e Pular aceitam dois dedos simultâneos; o pulo usa
pointerdown para não depender de cliques de compatibilidade do segundo dedo.
A câmera consulta limites das copas instanciadas e procura um ângulo livre
quando a vista pretendida encobre o personagem, sem raycast de cada folha.

O motor integra a gravidade radial a 120 Hz, com passos limitados, preservando
uma base tangente por transporte ao redor da esfera. Corpo e câmera acompanham
essa base, inclusive na parte inferior do planeta. A velocidade é 0,58 unidade/s,
a gravidade 4,8 e os impulsos de pulo 1,48 e 1,30. Raios atingem os triângulos
reais da ilha e das pedras instanciadas. Uma sonda à frente da cápsula impede
atravessar laterais de pedras; troncos também bloqueiam o corpo. A água é um
piso caminhável que acompanha a mesma função de deformação do shader. O ruído
usa hash inteiro reproduzível em JS e GLSL, com equivalência verificada na GPU.

Pegadas na areia usam um pool de 96 decalques, com desaparecimento em 18 s.
Na água, os pés ficam 0,012 unidade imersos e entram na profundidade da espuma.
Passos e pulos alimentam até oito ondulações locais com ruído e um pool de 80
partículas de espuma com movimento balístico. As ondulações desaparecem em
1,6 s. Rastros e partículas ficam fora do pre-pass de contato. Sato também fica
fora dele enquanto está em terra, preservando o cache durante o idle.

## Som do mar e dos movimentos

O Play cria e ativa o AudioContext dentro do gesto do usuário, inclusive no
celular. Ruído colorido filtrado e duas modulações lentas produzem um fundo
suave de água, sem downloads nem gravações externas. O volume entra aos poucos.
O botão de som e a tecla `M` permitem silenciar; ocultar a aba suspende o áudio
e sair da página libera os nós e fecha o contexto. Ausência de Web Audio não
impede a exploração visual. A pausa de movimento não interrompe a ambiência.
O mesmo contexto produz passos distintos de grama, areia, rocha e água, além
de impulsos e aterrissagens com envelopes próprios. Ruído filtrado, pequenas
ressonâncias e tons curtos variam por superfície; a cadência segue a distância
percorrida, sem passos no ar. As vozes são limitadas a dez e desconectadas ao
terminar. O botão de som silencia a ambiência e todos os movimentos.

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
a espuma é lida na GPU usando seus próprios pés, e a textura de refração é
verificada diretamente. OfflineAudioContext renderiza os quatro tipos de
passo, decolagem e aterrissagem, comparando envelopes e saída de áudio reais.
