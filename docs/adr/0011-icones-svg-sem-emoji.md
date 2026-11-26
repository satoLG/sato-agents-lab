# 0011. Ícones SVG do sprite Lucide, nunca emoji; botões com uma palavra

- Status: Aceito
- Data: 2026-11-25

## Contexto
O kanbagent e o dashboard usavam emoji e símbolos de texto como ícone (lixeira, relógio, setas,
"✓", "≡"). Cada sistema desenha emoji de um jeito, o tamanho e o alinhamento variam, e o visual fica
amador perto da casca do app (barra lateral no estilo do app do Claude). Os botões também tinham frases
longas ("Pedir proposta ao Hermes", "Voltar para execução"), que quebram linha no celular.

## Decisão
- **Nenhum emoji ou símbolo de texto como ícone** em templates, JS e textos que o site mostra. Todo ícone
  vem do sprite vendorizado `static/icons/lucide.svg` (Lucide, ISC), regenerado por
  `node tools/vendor-home-icons.mjs` (a lista de nomes fica no script).
- **Como usar:** em template, `{{ icon('nome') }}` (decorativo) ou `{{ icon('nome', 'Rótulo') }}` (ícone
  sozinho que precisa de nome acessível); em JS, `icon('nome')` de `static/js/core.js` (ou o helper local
  do `kanbagent.js`). O CSS `.i` dá tamanho, traço 1.9 e cor do texto.
- **Botão = ícone + uma palavra de ação** ("Aprovar", "Executar", "Descartar"). Se o ícone sozinho já é
  óbvio (fechar, menu, enquadrar), o botão fica só com ícone e `aria-label`.
- **O detalhe vai no tooltip:** `data-tip="Fazer merge do PR e entregar"` mostra um balão escuro no hover
  e no foco do teclado (`data-tip-pos="below"` perto do topo). No toque não aparece; por isso o texto do
  botão sozinho precisa bastar.
- Setas tipográficas em prosa ("de → para") continuam permitidas: são texto, não ícone.

## Consequências
- Visual consistente em qualquer sistema; ícones herdam cor e tamanho do texto.
- Ícone novo exige acrescentar o nome no script e regenerar o sprite (o teste
  `test_no_emoji_in_the_site` barra emoji em templates, JS e Python do site).
- Ações longas perdem a frase no botão; quem não usa mouse lê o tooltip pelo foco ou o `aria-label`.

## Alternativas consideradas
- Emoji — inconsistente entre sistemas, sem controle de traço e cor.
- Fonte de ícones (Font Awesome etc.) — mais um asset pesado; o sprite SVG já existe e é local (ADR 0006).
- Tooltip nativo (`title`) — feio, lento e não estilizável; fica só onde é dado longo (erro, data).

## Revisitar quando
O Lucide deixar de ter um ícone necessário, ou o site passar a ter um design system próprio.
