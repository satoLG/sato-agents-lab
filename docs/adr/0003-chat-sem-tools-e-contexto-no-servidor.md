# 0003. Chat público sem tools, com contexto montado no servidor

- Status: Aceito
- Data: 2026-11-22 (registra decisão já em vigor)

## Contexto
O chat da raiz recebe texto de visitantes (entrada não confiável) e usa o mesmo
Hermes que opera a máquina, que tem memória, skills e tools. Regras escritas em
prompt podem ser contornadas por prompt injection, ainda mais com modelos menores.

## Decisão
Aplicar menor privilégio fora do modelo:
- `warm_runner.py` roda o Hermes com tools bloqueadas na definição, no despacho e
  na validação de eventos; tentativa de tool descarta o processo.
- `chat_context.py` seleciona leituras e trechos de memória/skills/RAG por
  pergunta, com limite de tamanho e remoção de credenciais, antes de chegar ao modelo.
- `sato_agent.py` define a identidade pública; a memória do agente de trabalho
  não é exposta.
- Cada mensagem recebe um agente novo com só o histórico explícito da conversa.

## Consequências
- O que o modelo não vê, ele não vaza; o que ele não pode chamar, ele não executa.
- As garantias são testáveis em `pytest`.
- O Sato Agent não age nem consulta nada em tempo real fora do contexto montado;
  respostas podem declarar lacunas.

## Alternativas consideradas
- Regras no system prompt/skills do Hermes: não são garantia.
- Expor tools read-only ao chat: amplia a superfície de exfiltração.

## Revisitar quando
O chat precisar agir. Nesse caso, ADR novo com tools específicas, allow-list e
aprovação humana.
