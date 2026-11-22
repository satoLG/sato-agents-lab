# 0005. Cachear fontes, nunca respostas, com invalidação explícita

- Status: Aceito
- Data: 2026-11-22 (registra decisão já em vigor)

## Contexto
Montar o contexto lê catálogos, documentos e o LanceDB a cada pergunta. Cache
ingênuo traria dado velho; cachear respostas do modelo serviria conteúdo de uma
pergunta para outra.

## Decisão
`context_cache.py` guarda só fontes, por até 30 s, limitado a 48 entradas e
16 MiB. Mudança de mtime, metadados, manifests do LanceDB ou checkpoint de sync
invalida antes do prazo. Falha ao atualizar não reaproveita cópia expirada em
silêncio. O contexto informa a idade de cada fonte. A seleção de trechos continua
por pergunta.

## Consequências
- Menos I/O por pergunta, sem respostas cruzadas.
- Toda fonte nova precisa declarar como é invalidada.

## Alternativas consideradas
- Sem cache: latência e CPU maiores a cada pergunta.
- Cache de respostas: risco de vazamento entre conversas e respostas desatualizadas.

## Revisitar quando
Uma fonte não tiver sinal confiável de mudança, ou o volume exigir cache compartilhado.
