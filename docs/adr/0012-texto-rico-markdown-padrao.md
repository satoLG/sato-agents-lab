# 0012. Texto gerado é Markdown e aparece estilizado em todo o site

- Status: Aceito
- Data: 2026-11-25

## Contexto
Hermes e Claude escrevem com marcação (`**negrito**`, listas, `código`, tabelas). O chat da página
inicial já renderizava isso com `markdown-it` vendorizado, mas o kanbagent (proposta, parecer da
revisão, comentários) e o dashboard (memórias `.md`, trechos do RAG) mostravam o texto cru, com os
asteriscos aparecendo.

## Decisão
- **Todo texto que um agente ou o Sato escreve e pode ter marcação é Markdown** e aparece estilizado. O
  banco e as APIs guardam o texto cru; a formatação acontece só na tela.
- **Um renderizador só:** `static/js/rich-text.js` (`markdown-it`, HTML desligado, links só `http(s)`
  abrindo fora, sem imagens, quebra de linha simples vira `<br>`). O chat usa a mesma fábrica
  (`createMarkdown`), mantendo as quebras do Markdown padrão.
- **Como usar:** em template, o texto cru dentro de um elemento com `data-rich` (o JS da página chama
  `enhanceRich()`; sem JS fica o texto legível); em JS, `richElement(texto)` ou `richHtml(texto)`.
- **Estilo único** em `static/css/rich-text.css` (classe `.rich`): parágrafos, listas, negrito,
  código, citações e tabelas com a mesma leitura em qualquer página.
- Agentes podem (e devem) usar Markdown no que escrevem para o site.

## Consequências
- Texto de agente fica legível sem mudar como ele é gravado; nada de HTML vindo de texto.
- Página nova que mostra texto gerado precisa marcar `data-rich` (ou usar `richElement`); revisão de
  código cobra isso.
- O teste `tests/rich-text.test.mjs` garante que o texto não injeta HTML, imagens nem links fora de http.

## Alternativas consideradas
- Renderizar no servidor (biblioteca Python) — dois renderizadores com regras diferentes do chat.
- Tirar a marcação do texto dos agentes — perde estrutura útil (listas, tabelas).

## Revisitar quando
Precisar de conteúdo rico que o Markdown não cobre (imagens de anexos, diagramas).
