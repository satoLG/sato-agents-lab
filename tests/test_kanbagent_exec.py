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


def queued(proposta="**Tamanho:** pequeno\n**Critérios de aceite**\n- C1: funciona — verificar: teste"):
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

    def __init__(self, plan, outcomes=None, public=True, checks=None, cost=0.0):
        self.cost = cost
        self.plan, self.outcomes, self.public = plan, dict(outcomes or {}), public
        self.checks = checks or {}
        self.sha, self.calls, self.resets, self.cleaned = 0, [], [], False
        self.artifacts = []

    def create_repo(self, full_name, public):
        self.created = (full_name, public)
        return full_name

    def prepare(self, item):
        return {"repo": item["repo"], "public": self.public, "branch": f"kanbagent/card-{item['id']}",
                "constitution": self.constitution}

    constitution = ["AGENTS.md"]
    spec = None

    def write_spec(self, path, text):
        self.spec = (path, text)

    def run_claude(self, kind, tier, prompt):
        self.calls.append((kind, tier, prompt))
        if self.cost:
            kb.record_run(self.job["card_id"], kind, tier, self.cost, 5, 1000, job_id=self.job["id"])
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
        if isinstance(self.plan, list):          # um plano por rodada do planejador
            return json.dumps(self.plan.pop(0) if len(self.plan) > 1 else self.plan[0])
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


def task(title, tier, check="", criteria=("C1",)):
    return {"title": title, "tier": tier, "why": "x", "instructions": f"faça {title}", "check": check,
            "criteria": list(criteria)}


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
    queued("## Tamanho\n**grande**: mexe em tudo\n**Critérios de aceite**\n- C1: ok — verificar: teste")
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
    assert worker.ladder("sonnet", True) == [("sonnet", 1), ("sonnet", 2), ("opus", 1)]    # sobe em vez de repetir caro
    assert worker.ladder("haiku", True) == [("haiku", 1), ("haiku", 2), ("sonnet", 1), ("opus", 1)]
    assert worker.ladder("opus", True) == [("opus", 1), ("opus", 2)]                       # sem para onde subir
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
    kb.update_proposal(card, "p\n**Critérios de aceite**\n- C1: funciona — verificar: teste", "hermes")
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


def test_art_is_always_opus_but_copying_a_file_is_not():
    plan = worker.parse_plan(json.dumps({"tasks": [
        task("Desenhar SVG do dinossauro de corpo inteiro", "sonnet"),
        task("Script que renderiza o sprite em PNG", "haiku"),
        task("Copiar o PNG do sprite para public/biscuits", "free"),
        task("Ajustar texto do botão", "free")]}))
    assert [t["tier"] for t in plan["tasks"]] == ["opus", "haiku", "free", "free"]
    assert worker.planner_model("**Tamanho** — pequeno", "fazer um sprite do dinossauro") == "sonnet"   # planejar não é arte
    assert worker.planner_model("**Tamanho** — pequeno", "botão de exportar CSV") == "sonnet"
    assert "SEMPRE opus para arte" in worker.RUBRIC


def test_usage_is_recorded_per_card_and_shown(db):
    card = queued()
    box = FakeBox({"tasks": [task("a", "haiku"), task("b", "sonnet")], "final_check": ""}, cost=0.25)
    box.job = None
    worker.drain(lambda job: setattr(box, "job", job) or box)
    cost = kb.card(card)["custo"]
    assert cost["chamadas"] == 3 and round(cost["total"], 2) == 0.75
    assert {m["model"] for m in cost["por_modelo"]} == {"sonnet", "haiku"}


def test_budget_stops_the_run_and_keeps_the_work(db):
    card = queued()
    box = FakeBox({"tasks": [task("a", "haiku"), task("b", "haiku"), task("c", "haiku")]}, cost=3.0)
    worker.drain(lambda job: setattr(box, "job", job) or box)
    item = kb.card(card)
    assert item["job"]["status"] == "failed" and "Teto de gasto" in item["job"]["error"]
    assert [t for k, t, _ in box.calls if k != "plan"] == ["haiku"]      # 3 (plano) + 3 (tarefa) > 5: não faz a 2ª


def test_parse_usage_reads_the_cli_json_and_tolerates_garbage():
    assert worker.parse_usage('{"total_cost_usd": 0.31, "num_turns": 6, "duration_ms": 900}') == (0.31, 6, 900)
    assert worker.parse_usage("timeout") == (0.0, 0, 0) and worker.parse_usage("[1]") == (0.0, 0, 0)


def test_task_limit_follows_the_proposal_size():
    assert worker.task_limit("**Tamanho** — pequeno") == 2 and worker.task_limit("**Tamanho** — médio") == 4
    assert worker.task_limit("**Tamanho** — grande") == worker.MAX_TASKS and worker.task_limit("sem tamanho") == 4


def test_parse_log_reads_old_executor_logs_even_when_output_was_cut():
    text = ('\n== 2026-11-25T19:20:01.5 plan sonnet rc=0\n{"type":"result","duration_ms":10218,"num_turns":4,'
            '"total_cost_usd":0.1226642}\n\n'
            '== 2026-11-25T19:22:10.1 free nvidia/nemotron-3.5-super-vl:free rc=0\ncortado...","num_turns":8,'
            '"total_cost_usd":0}\n'
            '== 2026-11-25T19:30:00.0 opus opus rc=124\n\ntimeout\n')
    runs = worker.parse_log(text)
    assert [(r[1], r[2], r[3], r[4]) for r in runs] == [("plan", "sonnet", 0.1226642, 4),
                                                       ("free", "nvidia/nemotron-3.5-super-vl:free", 0.0, 8),
                                                       ("opus", "opus", 0.0, 0)]
    assert runs[0][5] == 10218



SPEC = ("**Problema** — x\n**Tamanho:** pequeno\n**Critérios de aceite**\n- C1: exporta CSV — verificar: teste\n"
        "- C2: botão ao lado do filtro — verificar: visual\n**Decisão de arquitetura** — não\n**Dúvidas** — nenhuma")


def test_planner_gets_the_criteria_and_pr_carries_the_spec_file(db):
    card = queued(SPEC)
    box = FakeBox({"tasks": [task("csv", "haiku", criteria=["c1", "C2"])]})
    worker.drain(lambda job: box)
    plan_prompt = box.calls[0][2]
    assert "- C1: exporta CSV (verificar: teste)" in plan_prompt and "C2: botão ao lado do filtro" in plan_prompt
    assert box.spec[0] == f"specs/card-{card}.md" and "- C1: exporta CSV" in box.spec[1]
    assert "specs/card-" in box.summary and kb.card(card)["etapa_atual"] == "revisao_codigo"
    plan_note = next(e["text"] for e in kb.card(card)["events"] if (e["text"] or "").startswith("Plano"))
    assert "(C1, C2)" in plan_note and "AGENTS.md" not in plan_note


def test_plan_missing_a_criterion_is_redone_once_then_fails(db):
    card = queued(SPEC)
    partial = {"tasks": [task("csv", "haiku", criteria=["C1"])]}
    full = {"tasks": [task("csv", "haiku", criteria=["C1"]), task("layout", "haiku", criteria=["C2"])]}
    box = FakeBox([partial, full])
    worker.drain(lambda job: box)
    assert [k for k, _, _ in box.calls][:2] == ["plan", "plan"] and "C2 (botão ao lado do filtro) sem tarefa" in box.calls[1][2]
    assert kb.card(card)["etapa_atual"] == "revisao_codigo"


def test_plan_that_still_misses_a_criterion_fails_the_job(db):
    card = queued(SPEC)
    box = FakeBox([{"tasks": [task("csv", "haiku", criteria=["C1"])]}])
    worker.drain(lambda job: box)
    item = kb.card(card)
    assert item["etapa_atual"] == "execucao" and item["job"]["status"] == "failed"
    assert "não cobre a spec" in item["job"]["error"] and all(k == "plan" for k, _, _ in box.calls)


def test_architecture_decision_requires_an_adr_task(db):
    queued(SPEC.replace("**Decisão de arquitetura** — não", "**Decisão de arquitetura** — sim: troca SQLite por Postgres"))
    box = FakeBox([{"tasks": [task("migra", "sonnet", criteria=["C1", "C2"])]},
                   {"tasks": [task("migra", "sonnet", criteria=["C1", "C2"]), task("ADR 0013", "haiku", criteria=[])]}])
    worker.drain(lambda job: box)
    assert "troca SQLite por Postgres" in box.calls[0][2] and "como ADR" in box.calls[1][2]
    assert box.spec is not None


def test_missing_constitution_is_flagged_in_the_plan_comment(db):
    card = queued()
    box = FakeBox({"tasks": [task("t", "haiku")]})
    box.constitution = []
    worker.drain(lambda job: box)
    assert any("não tem AGENTS.md nem CLAUDE.md" in (e["text"] or "") for e in kb.card(card)["events"])
