# 0006. Front com ES modules e dependências vendorizadas, sem CDN

- Status: Aceito
- Data: 2026-11-22 (registra decisão já em vigor)

## Contexto
A máquina pode ficar sem internet e o site deve funcionar mesmo assim. O front
mistura painéis simples (HTMX) e uma cena Three.js pesada.

## Decisão
Sem framework SPA e sem build para rodar: ES modules em `static/js/`, HTMX para
fragmentos. Bibliotecas (Three.js, HTMX, Cytoscape, markdown-it,
typewriter-effect) ficam em `static/vendor/` com licença, geradas por esbuild
(`npm run build:*`) e versionadas. Assets servidos com digest (`/assets/<versão>/`).

## Consequências
- Funciona offline; versões travadas no Git; nada de CDN.
- Atualizar biblioteca é um PR explícito que regenera o bundle.
- Sem tipagem nem componentes; a organização depende de módulos pequenos por aba/cena.

## Alternativas consideradas
- React/Vue com build: complexidade e pipeline desnecessários.
- CDN: dependência externa e privacidade.

## Revisitar quando
A UI ganhar estado compartilhado complexo que módulos simples não sustentem.
