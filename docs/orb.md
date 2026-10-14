# orb

`/orb` apresenta o canvas e um botão discreto de som após a entrada. A câmera permanece centralizada
no mundo, com OrbitControls, zoom por roda/pinça e atalhos descritos no rótulo
acessível da cena. A água começa com ondulação de 90% e transmissão física de
100%; os reflexos e a absorção azul continuam visíveis.

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
faixa estreita, medida a partir do limite da grama em 0,67. Ondas e maré são atenuadas nessa região,
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
compartilham a textura 3D do planeta no trecho submerso. Nove pedras pequenas,
irregulares e foscas usam três malhas instanciadas com 20 faces cada.
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
de 100%, com roughness 0,23, intensidade especular 0,32 e sem clearcoat: reflexos
menos intensos, com contornos mais definidos. Alterações em modelos, buffers,
visibilidade ou câmera continuam atualizando profundidade e sombras.

## Som do mar

O Play cria e ativa o AudioContext dentro do gesto do usuário, inclusive no
celular. Ruído colorido filtrado e duas modulações lentas produzem um fundo
suave de água, sem downloads nem gravações externas. O volume entra aos poucos.
O botão de som e a tecla `M` permitem silenciar; ocultar a aba suspende o áudio
e sair da página libera os nós e fecha o contexto. Ausência de Web Audio não
impede a exploração visual. A pausa de movimento não interrompe a ambiência.

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
