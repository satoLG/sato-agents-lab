# 0004. Processar o chat por uma fila durável em SQLite

- Status: Aceito
- Data: 2026-11-22 (registra decisão já em vigor)

## Contexto
Uma resposta do modelo leva de segundos a minutos e o provedor pode falhar.
Uma requisição HTTP presa até a resposta perde trabalho em reinícios e duplica
perguntas em reenvios.

## Decisão
`web_chat.py` grava cada pergunta como job em `web-chat.sqlite3` e responde
imediatamente. Um worker pega jobs com lease; falha volta à fila com backoff
quadrático até 3 tentativas; lease vencido é recuperado. A fila tem limite (429
"Fila cheia"). O ID de mensagem do cliente permite reconciliar confirmações
perdidas e repetir o envio sem duplicar. Migrações só adicionam colunas/tabelas.

## Consequências
- Sobrevive a reinício do serviço e a falhas transitórias do provedor.
- Uma única máquina escreve; SQLite basta.
- Ordem e concorrência ficam limitadas ao worker único.

## Alternativas consideradas
- Redis/RabbitMQ: serviço extra sem necessidade.
- Processar na própria requisição: perde jobs e trava workers HTTP.

## Revisitar quando
Mais de um processo ou máquina precisar consumir a fila.
