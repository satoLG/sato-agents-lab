"""O time do kanbagent: quatro agentes, cada um com papel, motor e etapas próprias (ADR 0014).

    Requisitos  (Hermes, perfil `requisitos`)  escreve a proposta/spec        etapa Proposta
    Planejador  (Claude Sonnet; Opus se grande) quebra a spec em tarefas      início da Execução
    Programador (Claude, nível por tarefa)     faz as tarefas e abre o PR    Execução
    Revisor     (Hermes, perfil `revisor`)      confere o PR contra a spec    Revisão de código

Os dois Hermes rodam em perfis isolados (`hermes -p <perfil>`: SOUL, memória e skills próprios) e se
identificam na API pelo cabeçalho `X-Kanbagent-Agent`. O domínio recusa quem age fora do papel (ex.: só
Requisitos e o Sato escrevem proposta). "hermes" e "claude" seguem como autores dos eventos antigos e o
"hermes" é o Sato Agent principal (Telegram/chat), que cria cards e comenta mas não escreve proposta.
"""

AGENTS = {
    "requisitos": {
        "nome": "Requisitos", "motor": "hermes", "perfil": "requisitos", "modelo": "do perfil Hermes",
        "cargo": "Analista de requisitos",
        "resumo": "Transforma a ideia em proposta com critérios de aceite: a spec que o time segue.",
        "faz": ["Escreve e ajusta a proposta", "Define critérios de aceite verificáveis",
                "Levanta dúvidas antes de alguém codar"],
        "nao_faz": "Não aprova, não planeja, não programa, não revisa PR.",
        "etapas": ["proposta"], "cor": "#4aa8ff",
    },
    "planejador": {
        "nome": "Planejador", "motor": "claude", "perfil": None, "modelo": "Sonnet (Opus se o card é grande)",
        "cargo": "Arquiteto de execução",
        "resumo": "Lê a spec e o repositório e quebra o card em poucas tarefas, cada uma com nível e checagem.",
        "faz": ["Plano de tarefas cobrindo todos os critérios", "Escolhe o modelo de cada tarefa",
                "Lê a constituição do repositório (AGENTS.md / CLAUDE.md)"],
        "nao_faz": "Não altera código, não escreve proposta, não revisa.",
        "etapas": ["execucao"], "cor": "#b07cff",
    },
    "programador": {
        "nome": "Programador", "motor": "claude", "perfil": None, "modelo": "free → Haiku → Sonnet → Opus (arte: Opus)",
        "cargo": "Desenvolvedor",
        "resumo": "Faz cada tarefa do plano no branch do card, com commit e checagem, e abre o PR.",
        "faz": ["Implementa as tarefas", "Gera artefatos (imagens, documentos)", "Commita a spec e abre o PR"],
        "nao_faz": "Não muda a spec, não aprova a própria entrega.",
        "etapas": ["execucao"], "cor": "#ff8a3d",
    },
    "revisor": {
        "nome": "Revisor", "motor": "hermes", "perfil": "revisor", "modelo": "do perfil Hermes (+ Claude em diff grande)",
        "cargo": "Revisor de código",
        "resumo": "Confere o PR contra a spec, critério por critério, e contra as regras do repositório.",
        "faz": ["Veredito por critério de aceite", "Aponta bug, risco e fuga de escopo",
                "Cobra ADR quando a proposta decide arquitetura"],
        "nao_faz": "Não altera código, não escreve proposta, não faz merge.",
        "etapas": ["revisao_codigo"], "cor": "#3ecf8e",
    },
}
ORDER = ("requisitos", "planejador", "programador", "revisor")
CLAUDE_AGENTS = tuple(slug for slug in ORDER if AGENTS[slug]["motor"] == "claude")
HERMES_AGENTS = tuple(slug for slug in ORDER if AGENTS[slug]["motor"] == "hermes")
PROPOSAL_AUTHORS = ("sato", "requisitos")    # quem escreve a proposta (a spec)


def agent(slug):
    data = AGENTS.get(slug)
    return {"slug": slug, **data} if data else None


def team():
    return [agent(slug) for slug in ORDER]


def status(jobs):
    """{slug: texto} do que cada agente está fazendo, a partir dos pedidos abertos `[{card_id, kind, status,
    progress, titulo}]`. Sem pedido: livre."""
    found = {}
    for job in jobs:
        progress = (job.get("progress") or "").lower()
        if job["kind"] == "proposta":
            slug = "requisitos"
        elif job["kind"] == "revisao_codigo":
            slug = "revisor"
        elif job["kind"] == "execucao":
            slug = "planejador" if (not progress or progress.startswith(("planejando", "preparando", "criando"))) \
                else "programador"
        else:
            continue
        found.setdefault(slug, job)
    return found
