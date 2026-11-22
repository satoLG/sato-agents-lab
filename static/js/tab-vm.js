// Aba: Sistema - CPU (agregado e por core), memoria, swap, discos e o que ocupa espaco.
//
// O painel e montado uma unica vez a partir de /api/vmstats. Depois disso:
// - CPU, memoria, swap, load e uptime vem do evento `dashboard:telemetry`
//   (SSE /api/lab/stream, ~2s), compartilhado com dashboard-live.js;
// - discos, du e processos sao relidos de /api/vmstats a cada 60s.
// Em ambos os casos os elementos existentes sao atualizados no lugar.
import { h, fmt, render, getJSON, empty, table, notice, skeleton, statusClass } from "./core.js";
import { bars, meter, stat, seriesColor } from "./charts.js";

const HEAVY_MS = 60000;

let refs = {};
let timer = null;
let active = false;
let built = false;
let heavyAt = 0;
let sampleAt = null;
let inflight = null;

export function init(root) {
  refs.body = root.querySelector("[data-role=sistema]");
  refs.status = root.querySelector("[data-role=sistema-status]");
  active = true;
  // ao voltar para a aba: aplica a ultima leitura do SSE na hora
  const last = window.hermesTelemetry?.payload;
  if (built && last) applyTelemetry(last);
  showStatus();
  schedule();
}

export function stop() {
  active = false;
  clearInterval(timer);
  timer = null;
}

function schedule() {
  clearInterval(timer);
  timer = null;
  if (!active || document.hidden) return;
  if (!built || Date.now() - heavyAt >= HEAVY_MS) refreshHeavy();
  timer = setInterval(refreshHeavy, HEAVY_MS);
}

async function refreshHeavy() {
  if (!active || document.hidden || inflight) return inflight;
  if (!built) render(refs.body, skeleton());
  inflight = (async () => {
    try {
      const d = await getJSON("/api/vmstats");
      if (d.error) {
        if (!built) render(refs.body, notice(d.error));
        return;
      }
      heavyAt = Date.now();
      if (!built) build(d);
      else updateHeavy(d);
      // a leitura do SSE costuma ser mais nova; so usa esta se nao houver outra.
      // Um evento que chegou antes do painel existir ficou em hermesTelemetry.
      if (!sampleAt) {
        const last = window.hermesTelemetry?.payload;
        if (last?.channels?.vm?.data) applyTelemetry(last);
        else applyFast(d, d.timestamp);
      }
    } catch (err) {
      if (!built) render(refs.body, notice(err.message));
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

document.addEventListener("dashboard:telemetry", (e) => {
  if (active && built) applyTelemetry(e.detail);
});
document.addEventListener("dashboard:connection", showStatus);
document.addEventListener("visibilitychange", () => {
  if (!active) return;
  if (document.hidden) { clearInterval(timer); timer = null; }
  else schedule();
});

function applyTelemetry(payload) {
  const vm = payload?.channels?.vm?.data;
  if (vm) applyFast(vm, payload.state?.now || vm.timestamp);
}

/* ---------- montagem inicial ---------- */

function build(d) {
  const cpu = d.cpu || {};
  const mem = d.memory || {};

  refs.cpuStat = stat("CPU", "-", "-");
  refs.memStat = stat("Memoria", "-", "-");
  refs.loadStat = stat("Load (1 min)", "-", "-");
  refs.upStat = stat("Uptime", "-", "-");
  refs.coresCard = card("CPU por core", coreBars(cpu.cores || []));
  refs.memCard = card("Memoria", memoryContent(mem));
  refs.heavy = h("div", { class: "sistema-heavy" });

  render(refs.body, [
    h("div", { class: "stat-grid" }, [refs.cpuStat, refs.memStat, refs.loadStat, refs.upStat]),
    h("div", { class: "grid cols-2" }, [refs.coresCard, refs.memCard]),
    refs.heavy,
  ]);
  built = true;
  updateHeavy(d);
}

function coreBars(cores) {
  refs.coreCount = cores.length;
  return cores.length
    ? bars(cores.map((c) => ({ label: `core ${c.core}`, value: c.usage })), {
        max: 100,
        valueLabel: (i) => fmt.pct(i.value),
        color: (i) => coreColor(i.value),
      })
    : empty("sem leitura de /proc/stat");
}

function memoryContent(mem) {
  refs.hasSwap = !!mem.swap_total;
  return [
    meter("RAM em uso", mem.used_percent, `${fmt.bytes(mem.used)} / ${fmt.bytes(mem.total)}`),
    mem.swap_total
      ? meter("Swap", mem.swap_percent, `${fmt.bytes(mem.swap_used)} / ${fmt.bytes(mem.swap_total)}`)
      : h("p", { class: "muted", style: { fontSize: "0.8rem" }, text: "sem swap configurado" }),
    h("div", { class: "tags", style: { marginTop: "var(--sp-3)" } }, [
      h("span", { class: "pill", dataset: { mem: "cached" }, text: `cache ${fmt.bytes(mem.cached)}` }),
      h("span", { class: "pill", dataset: { mem: "buffers" }, text: `buffers ${fmt.bytes(mem.buffers)}` }),
      h("span", { class: "pill", dataset: { mem: "free" }, text: `livre ${fmt.bytes(mem.free)}` }),
    ]),
  ];
}

/* ---------- atualizacao no lugar ---------- */

function applyFast(d, when) {
  const cpu = d.cpu || {};
  const mem = d.memory || {};
  const loadAvg = d.load || {};
  const total = cpu.total ?? 0;

  setStat(refs.cpuStat, fmt.pct(total), `${cpu.count || 0} cores · livre ${fmt.pct(100 - total)}`);
  setStat(refs.memStat, fmt.pct(mem.used_percent),
    `${fmt.bytes(mem.available)} disponiveis de ${fmt.bytes(mem.total)}`);
  if (d.load) setStat(refs.loadStat, (loadAvg["1min"] ?? 0).toFixed(2), `${fmt.pct(loadAvg.per_core ?? 0)} por core`);
  if (d.uptime_seconds !== undefined) setStat(refs.upStat, fmt.duration(d.uptime_seconds), d.hostname || "");

  const cores = cpu.cores || [];
  const rows = refs.coresCard.querySelectorAll(".bar-row");
  if (cores.length !== refs.coreCount || (cores.length && rows.length !== cores.length)) {
    replaceContent(refs.coresCard, coreBars(cores));
  } else {
    cores.forEach((c, index) => {
      const row = rows[index];
      const value = fmt.pct(c.usage);
      setText(row.querySelector(".v"), value);
      const fill = row.querySelector(".bar-fill");
      setStyle(fill, "width", `${Math.max(1, Number(c.usage) || 0)}%`);
      setStyle(fill, "background", coreColor(c.usage));
      fill.title = `core ${c.core}: ${value}`;
    });
  }

  if (!!mem.swap_total !== refs.hasSwap) {
    replaceContent(refs.memCard, memoryContent(mem));
  } else {
    const meters = refs.memCard.querySelectorAll(".meter-row");
    setMeter(meters[0], mem.used_percent, `${fmt.bytes(mem.used)} / ${fmt.bytes(mem.total)}`);
    if (mem.swap_total) setMeter(meters[1], mem.swap_percent, `${fmt.bytes(mem.swap_used)} / ${fmt.bytes(mem.swap_total)}`);
    setText(refs.memCard.querySelector("[data-mem=cached]"), `cache ${fmt.bytes(mem.cached)}`);
    setText(refs.memCard.querySelector("[data-mem=buffers]"), `buffers ${fmt.bytes(mem.buffers)}`);
    setText(refs.memCard.querySelector("[data-mem=free]"), `livre ${fmt.bytes(mem.free)}`);
  }

  if (when) sampleAt = when;
  showStatus();
}

function updateHeavy(d) {
  // discos, du e processos mudam devagar: troca o conteudo do bloco de uma vez,
  // sem skeleton, mantendo o restante do painel intacto
  render(refs.heavy, [
    card("Discos", (d.filesystems || []).length
      ? (d.filesystems || []).map((fs) =>
          meter(`${fs.mount} (${fs.fstype})`, fs.used_percent,
            `${fmt.bytes(fs.used)} de ${fmt.bytes(fs.total)} · ${fmt.bytes(fs.free)} livres`))
      : empty("nenhuma montagem encontrada")),
    diskBreakdown(d.disk_breakdown),
    card("Processos por CPU", (d.top_processes || []).length
      ? table([
          { key: "command", label: "Processo" },
          { key: "pid", label: "PID" },
          { key: "cpu", label: "CPU", num: true, render: (r) => fmt.pct(r.cpu) },
          { key: "mem", label: "MEM", num: true, render: (r) => fmt.pct(r.mem) },
        ], d.top_processes, { scroll: true })
      : empty("sem processos")),
  ]);
}

function showStatus() {
  if (!refs.status) return;
  const state = window.hermesTelemetry?.connection;
  const conn = state === "live" ? "ao vivo"
    : state === "reconnecting" ? "reconectando…"
    : state === "paused" ? "pausado" : "conectando…";
  const when = sampleAt ? `ultima leitura ${fmt.time(sampleAt)} · ` : "";
  setText(refs.status, `${when}${conn} · discos e processos a cada 60s`);
  refs.status.dataset.connection = state || "connecting";
}

function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function setStyle(el, prop, value) { if (el && el.style[prop] !== value) el.style[prop] = value; }

function setStat(el, value, foot) {
  setText(el.querySelector(".value"), String(value));
  setText(el.querySelector(".foot"), foot);
}

function setMeter(row, percent, detail) {
  if (!row) return;
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  setText(row.querySelector(".v"), detail || fmt.pct(pct));
  const bar = row.querySelector(".meter");
  const cls = `meter ${statusClass(pct)}`;
  if (bar.className !== cls) bar.className = cls;
  setStyle(bar.firstElementChild, "width", `${pct}%`);
}

function replaceContent(cardEl, content) {
  const header = cardEl.querySelector("header");
  cardEl.replaceChildren(header, ...[content].flat().filter(Boolean));
}

function coreColor(usage) {
  const status = statusClass(usage);
  return status === "critical" ? "var(--critical)"
       : status === "warning" ? "var(--warning)" : "var(--s1)";
}

function diskBreakdown(breakdown) {
  if (!breakdown) return null;
  if (breakdown.error) {
    return card("O que ocupa o disco", notice(breakdown.error));
  }
  // diretorio de 0 B so polui a leitura; corta abaixo de 1 MB
  const entries = (breakdown.entries || []).filter((e) => e.size >= 1024 * 1024);
  if (!entries.length) return card("O que ocupa o disco", empty("sem leitura de du"));
  return card(`O que ocupa ${breakdown.path}`, [
    bars(entries.map((e) => ({ label: e.name, value: e.size, path: e.path })), {
      valueLabel: (i) => fmt.bytes(i.value),
      color: (_i, index) => seriesColor(index),
    }),
    h("p", { class: "muted", style: { fontSize: "0.72rem", marginTop: "var(--sp-3)" },
             text: `total medido ${fmt.bytes(breakdown.total)} · leitura em cache por 10 min` }),
  ]);
}

function card(title, content) {
  return h("div", { class: "card" }, [
    h("header", {}, h("h2", { text: title })),
    ...(Array.isArray(content) ? content : [content]),
  ]);
}
