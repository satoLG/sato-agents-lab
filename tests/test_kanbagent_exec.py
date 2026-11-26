"""Worker de execução do kanbagent: plano em mini tarefas e escada de níveis, com sandbox falso."""
import json

import pytest

from hermes_dashboard import kanbagent as kb
from hermes_dashboard import kanbagent_exec as worker

PR = "https://github.com/sato/app/pull/7"


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(kb, "DB_PATH", tmp_path / "kanbagent.sqlite3")
    monkeypatch.setattr(worker, "LOCK_PATH", tmp_path / "exec.lock")


def queued(proposta="**Tamanho:** pequeno"):
    project = kb.create_project("app", "App")
    repo = kb.add_repo_to_project(project, "sato/app")
    card = kb.create_card("Botão novo", "ideia", "sato", project_id=project, repo_id=repo)
    kb.change_stage(card, "proposta", "sato")
    kb.update_proposal(card, proposta, "hermes")
    kb.change_stage(card, "revisao", "hermes")
    kb.change_stage(card, "aprovado", "sato")
    kb.change_stage(card, "execucao", "sato")
    return card


class FakeBox:
    """Cada chamada do Claude vira um commit, a não ser que `outcomes` diga o contrário."""

    def __init__(self, plan, outcomes=None, public=True, checks=None):
        self.plan, self.outcomes, self.public = plan, dict(outcomes or {}), public
        self.checks = checks or {}
        self.sha, self.calls, self.resets, self.cleaned = 0, [], [], False
        self.artifacts = []

    def create_repo(self, full_name, public):
        self.created = (full_name, public)
        return full_name

    def prepare(self, item):
        return {"repo": item["repo"], "public": self.public, "branch": f"kanbagent/card-{item['id']}"}

    def run_claude(self, kind, tier, prompt):
        self.calls.append((kind, tier, prompt))
        outcome = self.outcomes.get(len(self.calls), "commit")
        if kind != "plan" and outcome == "commit":
            self.sha += 1
        if kind != "plan" and outcome.startswith("artefato:"):
            self.artifacts.append((outcome.split(":", 1)[1], b"\x89PNG\r\n\x1a\nimagem"))
        return 0

    def artifacts_stamp(self):
        return repr(self.artifacts)

    def collect_artifacts(self):
        return list(self.artifacts)

    def has_commits(self):
        return self.sha > 0

    def read(self, name):
        return json.dumps(self.plan)

    def head(self):
        return str(self.sha)

    def reset(self, sha):
        self.resets.append(sha)

    def run_check(self, command):
        results = self.checks.get(command, [])
        return results.pop(0) if results else (0, "ok")

    def publish(self, item, summary):
        self.summary = summary
        return PR

    def cleanup(self):
        self.cleaned = True


def task(title, tier, check=""):
    return {"title": title, "tier": tier, "why": "x", "instructions": f"faça {title}", "check": check}


def test_cheap_plan_runs_each_task_once_and_opens_pr(db):
    card = queued()
    box = FakeBox({"tasks": [task("texto", "free"), task("lógica", "sonnet", "pytest -q t")], "final_check": "pytest"})
    assert worker.drain(lambda job: box) == 1
    item = kb.card(card)
    assert item["etapa_atual"] == "revisao_codigo"
    assert (item["job"]["kind"], item["job"]["status"]) == ("revisao_codigo", "queued")   # entrega pede revisão
    assert [link["url"] for link in item["links"]] == [PR]
    assert [(k, t) for k, t, _ in box.calls] == [("plan", "sonnet"), ("free", "free"), ("sonnet", "sonnet")]
    assert any(e["author"] == "claude" and "[free] texto" in (e["text"] or "") for e in item["events"])
    assert "texto: free" in box.summary and box.cleaned


def test_failed_check_climbs_the_ladder_two_attempts_per_tier(db):
    queued()
    checks = {"t": [(1, "AssertionError a"), (1, "AssertionError b"), (0, "ok")]}
    box = FakeBox({"tasks": [task("t", "free", "t")]}, checks=checks)
    worker.drain(lambda job: box)
    tiers = [t for k, t, _ in box.calls if k != "plan"]
    assert tiers == ["free", "free", "haiku"]
    assert "AssertionError b" in box.calls[-1][2] and len(box.resets) == 2
    assert "t: haiku" in box.summary


def test_no_commit_counts_as_failure(db):
    queued()
    box = FakeBox({"tasks": [task("t", "haiku")]}, outcomes={2: "nada"})
    worker.drain(lambda job: box)
    assert [t for k, t, _ in box.calls if k != "plan"] == ["haiku", "haiku"]
    assert "não fez commit nem salvou artefato" in box.calls[-1][2]


def test_private_repo_never_uses_free_models(db):
    queued()
    box = FakeBox({"tasks": [task("t", "free")]}, public=False)
    worker.drain(lambda job: box)
    assert [t for k, t, _ in box.calls if k != "plan"] == ["haiku"]


def test_big_proposal_is_planned_by_opus(db):
    queued("## Tamanho\n**grande**: mexe em tudo")
    box = FakeBox({"tasks": [task("t", "opus")]})
    worker.drain(lambda job: box)
    assert box.calls[0][:2] == ("plan", "opus")


def test_task_that_fails_even_on_opus_unlocks_card_with_reason(db):
    card = queued()
    box = FakeBox({"tasks": [task("t", "sonnet", "t")]}, checks={"t": [(1, "quebrou")] * 4})
    worker.drain(lambda job: box)
    item = kb.card(card)
    assert item["etapa_atual"] == "execucao" and item["job"]["status"] == "failed"
    assert "não passou nem no opus" in item["job"]["error"] and box.cleaned
    kb.request_agent(card)    # destravou: dá para pedir de novo


def test_final_check_failure_blocks_the_pr(db):
    card = queued()
    box = FakeBox({"tasks": [task("t", "haiku")], "final_check": "pytest"}, checks={"pytest": [(2, "1 failed")]})
    worker.drain(lambda job: box)
    assert kb.card(card)["job"]["status"] == "failed" and "1 failed" in kb.card(card)["job"]["error"]


@pytest.mark.parametrize("text,reason", [
    ("não é json", "não é JSON"),
    (json.dumps({"tasks": []}), "sem tarefas"),
    (json.dumps({"tasks": [{"title": "x"}]}), "sem instruções"),
])
def test_bad_plan_is_a_clear_failure(db, text, reason):
    with pytest.raises(worker.ExecFailed, match=reason):
        worker.parse_plan(text)


def test_unknown_tier_becomes_haiku_and_ladder_order():
    assert worker.parse_plan(json.dumps({"tasks": [task("x", "gpt")]}))["tasks"][0]["tier"] == "haiku"
    assert worker.ladder("sonnet", True) == [("sonnet", 1), ("sonnet", 2), ("opus", 1), ("opus", 2)]
    assert worker.ladder("free", False)[0] == ("haiku", 1)


def test_rejected_delivery_feeds_the_planner(db):
    card = queued()
    review = kb.change_stage(card, "revisao_codigo", "claude")
    kb.finish_job(review, result="VEREDITO: AJUSTAR")
    kb.change_stage(card, "execucao", "sato", text="faltou o teste do botão")
    box = FakeBox({"tasks": [task("t", "haiku")]})
    worker.drain(lambda job: box)
    assert "faltou o teste do botão" in box.calls[0][2]


def test_proposal_worker_ignores_execution_jobs(db):
    queued()
    assert kb.claim_job("proposta") is None
    assert kb.claim_job("execucao")["kind"] == "execucao"


def test_new_repo_is_created_before_planning_and_refs_reach_the_card_md(db):
    card = kb.create_card("Jogo", "ideia", "sato", novo_repo="sato/jogo", publico=False)
    kb.add_ref_link(card, "https://example.com/arte", "sato", "Arte")
    kb.change_stage(card, "proposta", "hermes")
    kb.update_proposal(card, "p", "hermes")
    for stage, who in (("revisao", "hermes"), ("aprovado", "sato"), ("execucao", "sato")):
        kb.change_stage(card, stage, who)
    box = FakeBox({"tasks": [task("t", "free")]}, public=False)
    worker.drain(lambda job: box)
    item = kb.card(card)
    assert box.created == ("sato/jogo", False) and item["repo"] == "sato/jogo"
    assert item["etapa_atual"] == "revisao_codigo"
    assert "Arte: https://example.com/arte" in worker._card_markdown(item)


def test_artifacts_come_back_to_the_card_alongside_the_pr(db):
    card = queued()
    box = FakeBox({"tasks": [task("sprite", "sonnet"), task("usar no site", "haiku")]},
                  outcomes={2: "commit", 3: "commit"})
    box.artifacts.append(("sprite.png", b"\x89PNG\r\n\x1a\nimagem"))
    worker.drain(lambda job: box)
    item = kb.card(card)
    assert item["etapa_atual"] == "revisao_codigo" and [a["nome"] for a in item["artifacts"]] == ["sprite.png"]
    assert "../entregas/" in box.calls[0][2] and "../entregas/" in box.calls[1][2]


def test_artifact_only_card_skips_the_pr(db):
    card = queued()
    box = FakeBox({"tasks": [task("desenhar", "sonnet")]}, outcomes={2: "artefato:dino.png"})
    worker.drain(lambda job: box)
    item = kb.card(card)
    assert item["etapa_atual"] == "revisao_codigo" and not item["links"]
    assert [a["nome"] for a in item["artifacts"]] == ["dino.png"]
    assert "Artefatos prontos" in item["events"][-1]["text"]
    assert not hasattr(box, "summary")      # publish não foi chamado
