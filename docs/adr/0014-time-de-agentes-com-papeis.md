# 0014. Time de agentes com papéis: Mapeador, Planejador, Programador e Revisor

- Status: Aceito
- Data: 2026-11-27

## Contexto
O mesmo Hermes escrevia a proposta e depois revisava o PR que a implementava: revisava o próprio
trabalho, com a mesma memória e o mesmo viés. O Claude planejava e executava sob um único nome
("claude"), e o histórico do card não dizia quem fez o quê. O Sato quer enxergar o fluxo como um time
de colaboradores, cada um com papel claro, e conversar com cada um.

## Decisão
- **Quatro agentes, cada um numa etapa** (`hermes_dashboard/kanbagent_team.py`):
  - **Mapeador**: Hermes no perfil `requisitos`. Escreve a proposta (spec) na etapa Proposta.
  - **Planejador**: Claude Sonnet, ou Opus quando o card é grande. Faz o plano no início da Execução.
  - **Programador**: Claude, com o nível escolhido por tarefa. Faz as tarefas, os artefatos e o PR.
  - **Revisor**: Hermes no perfil `revisor`. Confere o PR contra a spec; o Claude entra como segunda
    revisão quando o diff é grande.
- **Perfis Hermes isolados** (`hermes profile create … --clone`): cada um tem SOUL.md com o seu papel,
  memória própria e só as skills dele. Mapeador tem só `kanbagent-proposta`; o Revisor não tem skills.
  O worker roda `hermes -p <perfil>`.
- **O domínio confere o papel**, não só o prompt:
  - Só o Mapeador e o Sato escrevem a proposta e a mandam para revisão.
  - Só o Sato aprova a proposta.
  - Os autores dos eventos passam a ser os agentes: `requisitos`, `planejador`, `programador`, `revisor`.
- **Identidade na API:** o perfil define `KANBAGENT_AGENT` no `.env` e o `kanbagent.sh` manda
  `X-Kanbagent-Agent`. Só nomes de agentes Hermes do time são aceitos; sem o cabeçalho, quem fala é o
  `hermes`.
- **O Sato Agent principal** (Hermes `default`, Telegram/chat) continua como assistente pessoal: cria
  cards, comenta e chama o Mapeador movendo o card para Proposta. Não escreve proposta.
- **`hermes` e `claude` ficam como autores legados** dos eventos de antes do time.
- **Página Time** (`/kanbagent/time`): mostra cada agente com avatar, cargo, motor e modelo, a etapa,
  uma frase do que faz, se está ocupado (e em qual card) e números (cards, ações, custo).
- **Avatar = o robô da home** (`companion-bot.js`) com carcaça na cor do agente e LED do visor numa
  segunda cor. `team-bots.js` usa um só renderer WebGL para todos os avatares da página (copia cada
  quadro para o `<canvas>` do agente), a 24 fps, só para os que estão na tela e com a aba visível; com
  `prefers-reduced-motion` desenha um quadro parado. O three.js só carrega onde há avatar de agente.
  Fora da página Time e do chat (histórico do card, mensagens) vai um PNG parado do mesmo robô. Se o
  Sato troca a imagem em Ajustes, a foto dele vale e o 3D não aparece.

- **Chat direto com cada agente** (`/kanbagent/time/<agente>`, tabela `agent_messages`, worker
  `kanbagent_chat`): conversa no papel do agente, com os cards citados por `#N`. Hermes responde no
  perfil; Claude responde sem repositório nem ferramentas.

## Consequências
- Quem escreve a spec não é quem julga a entrega: o Revisor não tem a memória da proposta.
- Para mudar o comportamento de um agente, edite o SOUL.md do perfil dele em
  `~/.hermes/profiles/<perfil>/`. Isso não mexe no Sato Agent.
- Três perfis Hermes para manter. Atualização de skill vale por perfil.
- Agente novo no time exige mudança no código (`AGENTS`) e, se for Hermes, um perfil.

## Alternativas consideradas
- **Um Hermes só, com prompts diferentes:** mesma memória entre proposta e revisão, o que mantém o
  viés. Os perfis nativos resolvem sem custo extra.
- **Agentes configuráveis no banco:** flexível demais para quatro papéis fixos. Fica para quando o time
  crescer.

## Revisitar quando
- O time precisar de um papel novo (ex.: QA visual, documentação).
- Os perfis Hermes divergirem de versão ou de configuração a ponto de dar manutenção.
