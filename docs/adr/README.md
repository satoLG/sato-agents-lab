# Architecture Decision Records

Cada ADR registra uma decisão de arquitetura: contexto, decisão, consequências e
quando revisitar. ADRs não são editados depois de aceitos; para mudar uma decisão,
crie um ADR novo com `Substitui: NNNN` e marque o antigo como `Substituído por NNNN`.

| # | Decisão | Status |
|---|---------|--------|
| [0001](0001-monolito-modular.md) | Monólito modular em Flask | Aceito |
| [0002](0002-sse-em-vez-de-websocket.md) | SSE em vez de WebSocket | Aceito |
| [0003](0003-chat-sem-tools-e-contexto-no-servidor.md) | Chat público sem tools e contexto montado no servidor | Aceito |
| [0004](0004-fila-duravel-em-sqlite.md) | Fila durável do chat em SQLite | Aceito |
| [0005](0005-cache-de-fontes.md) | Cache de fontes com invalidação explícita | Aceito |
| [0006](0006-front-vendorizado-sem-framework.md) | Front vendorizado, sem framework e sem CDN | Aceito |
| [0007](0007-deploy-por-pull-com-rollback.md) | Deploy por pull fast-forward com rollback | Aceito |
| [0008](0008-dashboard-read-only-tolerante.md) | Dashboard read-only e tolerante a fontes ausentes | Aceito |
| [0009](0009-kanbagent-pagina-com-escrita-protegida.md) | kanbagent no site, com banco próprio e escrita protegida | Aceito (acesso substituído por 0010) |
| [0010](0010-login-do-site-protege-dashboard-e-kanbagent.md) | Login do site protege dashboard e kanbagent; só a home é pública | Aceito |
| [0011](0011-icones-svg-sem-emoji.md) | Ícones SVG do sprite Lucide, nunca emoji; botões com uma palavra | Aceito |
| [0012](0012-texto-rico-markdown-padrao.md) | Texto gerado é Markdown e aparece estilizado em todo o site | Aceito |
| [0013](0013-proposta-aprovada-e-a-spec.md) | A proposta aprovada é a spec: critérios de aceite, spec no PR, constituição do repo | Aceito |

## Modelo

```markdown
# NNNN. Título no imperativo

- Status: Proposto | Aceito | Substituído por NNNN
- Data: AAAA-MM-DD

## Contexto
Problema, forças e restrições.

## Decisão
O que foi decidido, em uma ou duas frases diretas.

## Consequências
O que fica mais fácil, o que fica mais difícil, riscos aceitos.

## Alternativas consideradas
Opção — por que não.

## Revisitar quando
Sinal concreto que reabre a decisão.
```
