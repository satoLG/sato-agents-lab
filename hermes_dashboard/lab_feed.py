"""Lab uses dashboard collectors verbatim; no synthetic KPI or log rows."""
import time
from . import activity, db, events, lab, mcp, memory, rag, state, stats, vm, webhooks
from .streaming import Feed


def _read(producer):
    try:
        return {"data": producer(), "updatedAt": int(time.time() * 1000)}
    except Exception:
        return {"data": None, "error": "Fonte indisponível"}


def boards(channels):
    native = state.available()
    if native:
        rows = state.events(limit=1000)
    else:
        rows = []
        for kind, table, stamp, _ in activity.available_kinds():
            expr = activity.time_expr(table, stamp)
            records = db.query(f"SELECT *, {expr} AS _iso_ts FROM {db._ident(table)} ORDER BY {expr} DESC LIMIT 250")
            rows.extend(activity._normalize(kind, row, "_iso_ts") for row in records)
        rows.sort(key=lambda row: str(row.get("when") or ""), reverse=True)
    result = {}
    for row in rows:
        sector = "gateway" if row.get("kind") == "prompt" else lab.event_sector(row)
        # Native results do not persist a reliable success flag.
        status = "REGISTRADO" if native else "FALHA" if row.get("ok") is False else "REGISTRADO"
        result.setdefault(sector, {"rows": [], "upcoming": [], "source": "Dashboard · Atividades"})["rows"].append({
            "when": row.get("when"), "name": row.get("name"), "status": status,
            "kind": row.get("kind"), "model": row.get("model"), "duration_ms": row.get("duration_ms"), "source": row.get("source"),
        })
    catalog = channels.get("events", {}).get("data") or {}
    for row in webhooks.overview().get("events", []):
        result.setdefault("cron", {"rows": [], "upcoming": [], "source": "Dashboard · EVENTS"})["rows"].append(dict(
            when=row.get("timestamp"), name=row.get("webhook_name"), kind="webhook",
            status="FALHA" if row.get("success") is False or row.get("success") == 0 else "REGISTRADO",
            response_status=row.get("response_status"), duration_ms=row.get("duration_ms"), source="events.db · webhook_logs"))
    executions = catalog.get("executions", [])
    upcoming = [dict(when=job["next_run"], name=job.get("name") or job["id"], status="AGENDADO", kind="cron", source=job.get("source"))
                for job in catalog.get("jobs", []) if job.get("enabled") and job.get("next_run")]
    upcoming.sort(key=lambda row: str(row["when"]))
    if executions or upcoming or result.get("cron"):
        board = result.setdefault("cron", {"rows": [], "upcoming": [], "source": "Dashboard · EVENTS"})
        board["upcoming"] = upcoming
        board["rows"] = [dict(when=run.get("start_time"), name=run.get("job_name") or run.get("job_id"),
                             status="CONCLUÍDO" if run.get("end_time") and run.get("exit_code") == 0 else
                                    "FALHA" if run.get("end_time") and run.get("exit_code") is not None else "REGISTRADO",
                             kind="cron", source=run.get("source"), end_time=run.get("end_time"), exit_code=run.get("exit_code"))
                         for run in executions] + board["rows"]
        board["rows"].sort(key=lambda row: str(row.get("when") or ""), reverse=True)
    return {key: dict(value, rows=value["rows"][:250]) for key, value in result.items()}


_catalog_channels = {}
_catalog_at = 0


def collect():
    global _catalog_channels, _catalog_at
    snapshot = lab.snapshot()
    channels = {"stats": _read(stats.public_stats), "vm": _read(lambda: vm.snapshot(with_breakdown=False)), "live": _read(activity.live_snapshot)}
    if time.monotonic() - _catalog_at >= 5 or not _catalog_channels:
        def rag_summary():
            data = rag.catalog()
            data.pop("docs", None)
            return data
        _catalog_channels = {key: _read(producer) for key, producer in {
            "mcp": mcp.servers, "memory": memory.catalog, "rag": rag_summary, "events": events.overview,
        }.items()}
        _catalog_at = time.monotonic()
    channels.update(_catalog_channels)
    machine = channels["vm"].get("data") or {}
    snapshot["metrics"]["cpu"] = machine.get("cpu", {}).get("total")
    snapshot["metrics"]["memory"] = machine.get("memory", {}).get("used_percent") if machine.get("memory", {}).get("total") else None
    try:
        logs = boards(channels)
    except Exception:
        logs = {}
        snapshot["warnings"].append("Históricos temporariamente indisponíveis.")
    return {"state": snapshot, "channels": channels, "boards": logs, "sample_seconds": 2}


feed = Feed(collect)
