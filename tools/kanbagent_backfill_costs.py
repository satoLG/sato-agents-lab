"""Importa para o banco do kanbagent o custo das execuções que só existiam nos logs
(`~/.hermes/logs/kanbagent-exec/card-N.log`). Só mexe em card que ainda não tem custo gravado.

    python tools/kanbagent_backfill_costs.py            # mostra o que importaria
    python tools/kanbagent_backfill_costs.py --apply    # grava
"""
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hermes_dashboard import config, kanbagent as kb  # noqa: E402
from hermes_dashboard.kanbagent_exec import parse_log  # noqa: E402


def main(apply=False):
    folder = config.HERMES_HOME / "logs/kanbagent-exec"
    total = 0.0
    for log in sorted(folder.glob("card-*.log")):
        card_id = int(re.search(r"card-(\d+)\.log", log.name).group(1))
        try:
            kb.card(card_id)
        except kb.NotFound:
            print(f"card {card_id}: não existe mais, ignorado")
            continue
        if kb.has_runs(card_id):
            print(f"card {card_id}: já tem custo gravado, ignorado")
            continue
        runs = parse_log(log.read_text(encoding="utf-8", errors="replace"))
        cost = sum(r[3] for r in runs)
        total += cost
        print(f"card {card_id}: {len(runs)} chamada(s), US$ {cost:.2f}")
        if apply:
            for when, kind, model, run_cost, turns, ms in runs:
                moment = datetime.fromisoformat(when).astimezone(timezone.utc)
                kb.record_run(card_id, kind, model.split("/")[-1].split(":")[0] if "/" in model else model,
                              run_cost, turns, ms, when=moment)
    print(f"total importado: US$ {total:.2f}" if apply else f"total a importar: US$ {total:.2f} (use --apply)")


if __name__ == "__main__":
    main("--apply" in sys.argv)
