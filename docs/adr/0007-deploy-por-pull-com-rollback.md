# 0007. Deploy por pull fast-forward com validação e rollback

- Status: Aceito
- Data: 2026-11-22 (registra decisão já em vigor)

## Contexto
O serviço roda na máquina do Hermes, sem CI/CD com acesso a ela. Agentes abrem
PRs; o dono faz o merge.

## Decisão
O job Hermes `update-dashboard` (`no_agent`, a cada 30 min) roda
`tools/update_dashboard.sh`: busca a `main` pública sem token, aceita só
fast-forward com a árvore local intacta, valida Python, templates e rota em cópia
temporária, reinicia `hermes-dashboard.service`, confere `/` e `/dashboard` e volta
para a revisão anterior se falhar. O checkout de produção fica sempre na `main`;
desenvolvimento em branch/worktree e PR.

## Consequências
- Nenhuma credencial de deploy fora da máquina; merge na `main` vira deploy em até 30 min.
- Erro que passa na validação e quebra depois exige reverter o commit na `main`.
- Mudança no próprio script exige atualizar a cópia instalada em `~/.hermes/scripts/`.

## Alternativas consideradas
- Push via GitHub Actions com SSH: expõe a máquina e credenciais.
- Deploy manual: esquecível.

## Revisitar quando
Houver mais de uma máquina ou necessidade de deploy imediato após o merge.
