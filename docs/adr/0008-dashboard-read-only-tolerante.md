# 0008. Dashboard read-only e tolerante a fontes ausentes

- Status: Aceito
- Data: 2026-11-22 (registra decisão já em vigor)

## Contexto
As fontes (events.db, state.db, config.yaml, cron, logs, LanceDB) pertencem ao
Hermes e mudam de formato entre versões. O dashboard é acessível pela rede.

## Decisão
- Só leitura: nenhuma escrita nas fontes do Hermes (`events.db` e `state.db` abertos em modo `ro`).
- Schema descoberto em runtime; tabela ou coluna ausente é omitida; timestamps
  ISO ou epoch normalizados.
- Fonte ausente vira "sem dados"; handler global evita 5xx (`test_routes.py`
  exige nenhuma rota 5xx com VMs falsas).
- Documentos só de dentro de `~/.hermes`; chaves com key/token/secret/password
  aparecem como `[REDIGIDO]`; webhooks e gateway nunca devolvem headers, corpos
  ou configuração de adaptadores.

## Consequências
- Atualizar o Hermes raramente quebra o painel.
- Dados podem faltar; a UI mostra a ausência explicitamente.

## Alternativas consideradas
- Schema fixo: quebra a cada versão do Hermes.
- Painel com ações (reiniciar job, editar memória): exigiria auth forte e
  auditoria; fora do escopo.

## Revisitar quando
O painel precisar executar ações.
