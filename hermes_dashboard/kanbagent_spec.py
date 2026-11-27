"""A proposta aprovada é a spec do card (ADR 0013).

Formato que o Hermes escreve (skill kanbagent-proposta), uma seção por linha em negrito:

    **Critérios de aceite**
    - C1: o botão exporta CSV com cabeçalho — verificar: teste
    - C2: vírgulas no texto saem entre aspas — verificar: `pytest tests/test_csv.py`
    - C3: o botão fica ao lado do filtro — verificar: visual
    **Decisão de arquitetura** — não  (ou "sim: troca X por Y", que exige ADR no PR)
    **Dúvidas** — nenhuma

Aqui só se lê esse texto: quais critérios existem, quais o revisor precisa confirmar, se pede ADR e se
ainda há dúvida em aberto. Nada aqui chama agente.
"""
import re
import unicodedata

HEADING = re.compile(r"^\s*\*\*([^*]+?)\*\*\s*(?:[—:–-]+\s*)?(.*)$")
CRITERION = re.compile(r"^\s*(?:[-*+]|\d+[.)])?\s*\**\s*(C\d+)\s*\**\s*[:.)—–-]\s*(.+)$", re.IGNORECASE)
VERIFY = re.compile(r"\s*[—–-]+\s*verificar\s*:\s*", re.IGNORECASE)
REVIEW_MARK = re.compile(r"\b(C\d+)\b\**\s*[:—–-]\s*\**\s*(ok|falha|falhou|n[ãa]o verificad[oa]|pendente)", re.IGNORECASE)


def _plain(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text or "") if not unicodedata.combining(c)).lower().strip()


def sections(text):
    """{nome sem acento em minúsculas: conteúdo} das seções `**Nome** — ...` da proposta."""
    found, name, lines = {}, None, []
    for line in (text or "").splitlines():
        match = HEADING.match(line)
        if match:
            if name is not None:
                found[name] = "\n".join(lines).strip()
            name, lines = _plain(match.group(1)).rstrip(":"), [match.group(2)]
        elif name is not None:
            lines.append(line)
    if name is not None:
        found[name] = "\n".join(lines).strip()
    return found


def criteria(text):
    """[{id, texto, verificar, visual}] da seção Critérios de aceite, na ordem."""
    block = sections(text).get("criterios de aceite", "")
    result = []
    for line in block.splitlines():
        match = CRITERION.match(line)
        if not match:
            continue
        parts = VERIFY.split(match.group(2), maxsplit=1)
        verify = parts[1].strip() if len(parts) > 1 else ""
        result.append({"id": match.group(1).upper(), "texto": parts[0].strip(), "verificar": verify,
                       "visual": "visual" in _plain(verify) or "sato confere" in _plain(verify)})
    return result


def needs_adr(text):
    return _plain(sections(text).get("decisao de arquitetura", "")).startswith("sim")


def open_doubts(text):
    """O texto das dúvidas em aberto, ou None quando a proposta diz "nenhuma"."""
    doubts = sections(text).get("duvidas", "").strip()
    plain = _plain(doubts).strip("-*. ")
    if not plain or plain.startswith(("nenhuma", "nenhum", "sem duvida")):
        return None
    return doubts


def summary(text):
    return {"criterios": criteria(text), "adr": needs_adr(text), "duvidas": open_doubts(text)}


def criteria_block(items):
    return "\n".join(f"- {c['id']}: {c['texto']}" + (f" (verificar: {c['verificar']})" if c["verificar"] else "")
                     for c in items)


def unmet(items, review_text):
    """Critérios (não visuais) que o revisor não marcou como ok: falha, pendente ou nem citou."""
    marks = {}
    for cid, state in REVIEW_MARK.findall(review_text or ""):
        cid, ok = cid.upper(), _plain(state) == "ok"
        marks[cid] = marks.get(cid, True) and ok
    return [c["id"] for c in items if not c["visual"] and not marks.get(c["id"], False)]
