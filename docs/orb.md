# orb

`/orb` apresenta apenas o canvas após a entrada. A câmera permanece centralizada
no mundo, com OrbitControls, zoom por roda/pinça e atalhos descritos no rótulo
acessível da cena. A água começa com ondulação de 90% e transmissão física de
100%; os reflexos e a absorção azul continuam visíveis.

A lua tem metade do raio do núcleo sob a água (0,92 contra 1,84), com textura
local de crateras ilustradas, manchas lavanda e iluminação em faixas suaves.
Sua órbita circular fica no plano perpendicular à direção da câmera inicial,
com raio de 3,4 e uma volta a cada cinco minutos. O plano permanece fixo ao
usar OrbitControls. O enquadramento de entrada acomoda a órbita inteira na
menor dimensão da tela; a câmera pode ser aproximada manualmente depois.

A direção da lua alimenta o shader da água em coordenadas do planeta. Dois
volumes de maré permanecem presentes, com uma pequena preferência pelo lado
próximo da lua. A altura de maré é sempre positiva, e a amplitude das ondas
varia de 82% a 118% da base conforme a orientação; nenhum lado fica parado.
A deformação e as normais usam a mesma função, preservando reflexos e espuma
de contato. O núcleo permanece submerso. Pausar o movimento também pausa a
órbita e a maré, e movimento reduzido mantém a cena estática por padrão.

## Fontes reutilizadas

Os trechos do [portfólio](https://github.com/satoLG/portfolio) foram adaptados da
revisão `e32fd55a0182186d89054ca4bf5628b24b887435`:

- [`src/shaders/OceanShaders.ts`](https://github.com/satoLG/portfolio/blob/e32fd55a0182186d89054ca4bf5628b24b887435/src/shaders/OceanShaders.ts): `linearizeDepthBuffer`, comparação da profundidade opaca com a profundidade analítica da água e composição que clareia a espuma.
- [`src/effects/SceneDepth.ts`](https://github.com/satoLG/portfolio/blob/e32fd55a0182186d89054ca4bf5628b24b887435/src/effects/SceneDepth.ts): pre-pass com DepthTexture de 24 bits, filtro nearest e suspensão dos shadow maps durante a captura.
- [`src/core/UI.ts`](https://github.com/satoLG/portfolio/blob/e32fd55a0182186d89054ca4bf5628b24b887435/src/core/UI.ts) e [`src/style.css`](https://github.com/satoLG/portfolio/blob/e32fd55a0182186d89054ca4bf5628b24b887435/src/style.css): botão circular com três camadas de ondas, nível de água crescente, percentual, blur, bounce e partículas azuis ao concluir. A orb usa um ícone de entrada, sem controles de áudio ou welcome text.

As árvores são as mesmas da floresta, construídas por `scene-grove.js` com
`folio-foliage.js`, a textura SDF local, a paleta e o vento existentes. Grupos
escalados preservam as proporções e a amplitude de vento do modelo original.
A grama reutiliza `home-grass.js`, com blades maiores e uma grade mais densa.
A atribuição da base de vegetação permanece em `scenic-environments.md`.

## Espuma e carregamento

A espuma usa a profundidade real da cena a cada render, antes da superfície de
água. Não depende de uma máscara ou raio fixo da ilha; novas malhas opacas
participam automaticamente. Água, halo, estrelas, sprites, folhas transparentes,
grama e o núcleo permanentemente submerso ficam fora desse pre-pass.

A captura usa a resolução completa da orb para preservar sua linha de contato
estreita. A profundidade da água vem dos vértices deformados em view space; a
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
