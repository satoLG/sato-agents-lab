# 0013. A proposta aprovada é a spec do card: critérios de aceite, spec no PR e constituição do repo

- Status: Aceito
- Data: 2026-11-27

## Contexto
O fluxo do kanbagent já tinha a forma de um spec-driven development (ideia → proposta revisada pelo
Sato → plano → execução → revisão do PR), mas a "spec" era texto livre. Nada dizia quando a entrega
estava certa: o planejador não era cobrado por atender a proposta inteira, a revisão julgava "no olho"
e a proposta sumia depois do merge. As convenções do repositório (AGENTS.md / CLAUDE.md) eram lidas só
se o planejador lembrasse, e decisões de arquitetura não deixavam registro.

## Decisão
- **Critérios de aceite são obrigatórios.** A proposta tem a seção `**Critérios de aceite**`, um por
  linha: `- C1: <comportamento observável> — verificar: teste | <comando> | visual`. Sem pelo menos um
  critério, `revisao → aprovado` é recusado (o sync do GitHub espelha estados e fica de fora). Dúvidas
  em aberto não bloqueiam, mas a página pede confirmação antes de aprovar.
- **O plano cobre todos os critérios.** Cada tarefa do `PLAN.json` diz quais critérios atende
  (`"criteria": ["C1"]`). Critério sem tarefa faz o planejador refazer o plano uma vez com o que
  faltou; se ainda faltar, a execução falha antes de gastar com tarefas.
- **A spec vai no PR.** Antes de publicar, o executor commita `specs/card-N.md` (ideia, proposta
  aprovada com os critérios e os ajustes pedidos em reprovações), e o corpo do PR aponta para ele.
- **A revisão é por critério.** O revisor responde uma linha por critério (`- C1: ok|falha — motivo`).
  O código, não o modelo, decide: APROVAR vira AJUSTAR se algum critério não visual ficou sem `ok`.
  Critérios visuais aparecem no parecer como "Para você conferir".
- **Constituição do repositório.** AGENTS.md / CLAUDE.md são lidos pelo planejador e entram no prompt
  da revisão (até 6000 caracteres). Repositório sem nenhum dos dois ganha um aviso no comentário do
  plano.
- **Decisão de arquitetura gera ADR.** A proposta declara `**Decisão de arquitetura** — não` ou
  `— sim: <qual>`. Com "sim", o plano precisa de uma tarefa de ADR e a revisão pede AJUSTAR se o diff
  não traz arquivo de ADR.
- O parser fica em `hermes_dashboard/kanbagent_spec.py` (só lê texto, sem agente).

## Consequências
- "Pronto" passa a ser verificável: cada critério tem dono no plano e veredito na revisão.
- O histórico do porquê fica no repositório (`specs/`), não só no banco do kanbagent.
- A skill `kanbagent-proposta` do Hermes precisa escrever os critérios no formato exato; proposta fora
  do formato trava a aprovação (o Sato pede ajuste ou edita).
- Revisor desleixado (não lista os critérios) gera AJUSTAR e uma volta a mais de execução: custo
  aceito em troca de não aprovar no escuro.
- Cards aprovados antes desta regra seguem sem critérios; o executor e a revisão aceitam a lista vazia.

## Alternativas consideradas
- Critérios como campos estruturados no banco: mais trabalho de UI e o Hermes já escreve Markdown; o
  texto com formato fixo resolve.
- Bloquear também com dúvidas em aberto: travaria cards em que o Sato aceita que o agente decida.
- Deixar o modelo decidir o veredito sozinho: foi o que permitiu aprovar sem checar a proposta.

## Revisitar quando
- A revisão por critério gerar muitos AJUSTAR falsos (revisor não segue o formato).
- Proposta mudar depois de aprovada com frequência (spec drift): aí a reprovação deve editar a spec.
