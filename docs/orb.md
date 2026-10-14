# orb

`/orb` apresenta apenas o canvas após a entrada. A câmera permanece centralizada
no mundo, com OrbitControls, zoom por roda/pinça e atalhos descritos no rótulo
acessível da cena. A água começa com ondulação de 90% e transmissão física de
100%; os reflexos e a absorção azul continuam visíveis.

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

## Verificação

Os testes de navegador bloqueiam uma textura para verificar progresso real,
conferem a ausência de painéis, validam controles de teclado/toque e usam uma
malha independente parcialmente submersa para medir a máscara de espuma na
GPU. Sem contato ou com o objeto profundamente submerso, a máscara fica vazia.
