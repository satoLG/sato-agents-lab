"""Sync do kanbagent com o GitHub: issues e PRs ligados movem o card até a entrega.

Regras (docs/kanbagent.md, "Ciclo do card"), sempre pelo caminho principal e com as datas do GitHub:
- card `aprovado` com issue ou PR ligado → `execucao` (quando a issue/PR foi criada);
- PR aberto ou mergeado (ligado direto ou que fecha a issue) → `revisao_codigo` (quando o PR foi aberto);
- PR mergeado → `entregue` (merged_at); issue fechada como concluída → `entregue` (closed_at).

Usa o `gh` já autenticado na máquina, com timeout. Repetir não duplica: `advance_to` é no-op
quando o card já passou da etapa, e PR descoberto só é ligado uma vez.
"""
import json
import logging
import subprocess

from . import kanbagent as kb

LOG = logging.getLogger(__name__)
GH_TIMEOUT = 20

ISSUE_QUERY = """query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){
issue(number:$number){state stateReason createdAt closedAt
closedByPullRequestsReferences(first:5,includeClosedPrs:true){nodes{number url state createdAt mergedAt}}}}}"""
PR_QUERY = """query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){
pullRequest(number:$number){number url state createdAt mergedAt}}}"""


def _graphql(query, full_name, number):
    owner, name = full_name.split("/", 1)
    result = subprocess.run(
        ["gh", "api", "graphql", "-f", f"query={query}", "-f", f"owner={owner}", "-f", f"name={name}",
         "-F", f"number={number}"],
        capture_output=True, text=True, timeout=GH_TIMEOUT, check=False)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "gh falhou").strip()[:300])
    return json.loads(result.stdout)["data"]["repository"]


def fetch(link):
    """Normaliza um link: {'state', 'created', 'done_at', 'prs': [...]} com datas ISO."""
    data = _graphql(ISSUE_QUERY if link["tipo"] == "issue" else PR_QUERY, link["repo"], link["numero"])
    if link["tipo"] == "issue":
        issue = data["issue"]
        prs = issue["closedByPullRequestsReferences"]["nodes"]
        done = issue["closedAt"] if issue["state"] == "CLOSED" and issue["stateReason"] == "COMPLETED" else None
        return {"state": issue["state"].lower(), "created": issue["createdAt"], "done_at": done, "prs": prs}
    pr = data["pullRequest"]
    return {"state": pr["state"].lower(), "created": pr["createdAt"], "done_at": pr["mergedAt"], "prs": [pr]}


def sync(fetcher=fetch):
    """Uma passada por todos os links de cards em andamento. Devolve um resumo."""
    report = {"links": 0, "moved": 0, "errors": []}
    by_card = {}
    for link in kb.links_to_sync():
        by_card.setdefault(link["card_id"], []).append(link)
    for card_id, links in by_card.items():
        for link in links:
            report["links"] += 1
            try:
                info = fetcher(link)
            except Exception as error:  # um link quebrado não para os outros
                LOG.warning("kanbagent sync: %s falhou: %s", link["url"], error)
                report["errors"].append({"url": link["url"], "error": str(error)})
                continue
            kb.set_link_state(link["id"], info["state"])
            steps = [("execucao", info["created"])]
            for pr in info["prs"]:
                if link["tipo"] == "issue" and pr.get("url"):
                    kb.add_link(card_id, pr["url"], "github-sync", occurred_at=pr["createdAt"])
                if pr["state"] in ("OPEN", "MERGED"):
                    steps.append(("revisao_codigo", pr["createdAt"]))
            if info["done_at"]:
                steps.append(("entregue", info["done_at"]))
            for target, when in sorted(steps, key=lambda step: kb.MAIN_PATH.index(step[0])):
                moved = kb.advance_to(card_id, target, "github-sync", occurred_at=when,
                                      text=f"GitHub: {link['url']}")
                report["moved"] += len(moved)
    return report


if __name__ == "__main__":  # pragma: no cover - uso pelo cron: python -m hermes_dashboard.kanbagent_sync
    print(json.dumps(sync(), ensure_ascii=False))
