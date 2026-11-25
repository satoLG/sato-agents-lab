// Sons de botão: porta do núcleo de `button-sounds` 1.0.0 (MIT, Josh Comeau,
// licença em static/audio/button-sounds/LICENSE.txt) para Web Audio puro, sem
// howler nem bundler (ADR 0006). Mesmo comportamento do pacote: cada arquivo
// tem N gravações; o "press" toca no pointerdown e o "release" no pointerup,
// sempre sorteando uma amostra e variando um pouco o pitch, para nunca soar robótico.

const SAMPLES = {'hi75-soft': 7, 'hi75-medium': 8, 'hi75-knob': 8, 'synth-on': 8};
// Mapa de sprites do pacote: a amostra N começa em N segundos; o "down" dura
// 190 ms e o "up" começa 200 ms depois e dura 790 ms.
const DOWN = [0, .19], UP = [.2, .79];
const VOLUME = .4, PITCH = .04;
const STORE = 'sato-ui-sound';

let context = null;
const raw = new Map(), buffers = new Map();

export function enabled() {
  try { return localStorage.getItem(STORE) !== 'off'; } catch { return true; }
}

export function setEnabled(on) {
  try { localStorage.setItem(STORE, on ? 'on' : 'off'); } catch { /* sem storage: vale só nesta página */ }
  document.documentElement.dataset.uiSound = on ? 'on' : 'off';
  if (on) play('synth-on', UP);
}

function audio() {
  if (!context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { context = new Ctor(); } catch { return null; }
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

function fetchSound(name) {
  if (!raw.has(name)) {
    const url = new URL(`../audio/button-sounds/${name}.mp3`, import.meta.url);
    raw.set(name, fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
  }
  return raw.get(name);
}

function decoded(name) {
  if (!buffers.has(name)) {
    buffers.set(name, fetchSound(name).then(data => {
      const ctx = audio();
      // slice: decodeAudioData consome o ArrayBuffer.
      return data && ctx ? ctx.decodeAudioData(data.slice(0)) : null;
    }).catch(() => null));
  }
  return buffers.get(name);
}

function play(name, [start, length]) {
  if (!SAMPLES[name]) return;
  const ctx = audio();
  if (!ctx) return;
  const asked = performance.now();
  decoded(name).then(buffer => {
    // Som que chega atrasado (primeiro clique, arquivo ainda baixando) mais confunde que ajuda.
    if (!buffer || performance.now() - asked > 160) return;
    const sample = 1 + Math.floor(Math.random() * SAMPLES[name]);
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH;
    gain.gain.value = VOLUME;
    source.connect(gain).connect(ctx.destination);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(0, sample + start, length);
  });
}

export function press(name) { if (enabled()) play(name, DOWN); }
export function release(name) { if (enabled()) play(name, UP); }

// Baixa os arquivos sem bloquear a página; a decodificação espera o primeiro gesto.
export function preload(names = Object.keys(SAMPLES)) {
  if (!enabled()) return;
  const go = () => names.forEach(fetchSound);
  (window.requestIdleCallback || (fn => setTimeout(fn, 600)))(go);
}

// Liga todos os elementos clicáveis de `root` por delegação (vale para o que
// for renderizado depois, como os painéis do dashboard).
export function wire(root = document, {selector, soundFor}) {
  let held = null;
  const target = event => {
    const el = event.target.closest?.(selector);
    return el && root.contains(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' ? el : null;
  };
  root.addEventListener('pointerdown', event => {
    if (event.button > 0) return;
    const el = target(event);
    if (!el) return;
    const name = el.dataset.sound || soundFor(el);
    if (!name || name === 'none') return;
    if (enabled()) Object.keys(SAMPLES).forEach(decoded);
    held = name;
    press(name);
  });
  const up = () => { if (held) { release(held); held = null; } };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', () => { held = null; });
  // Teclado: Enter/Espaço num botão também "aperta".
  root.addEventListener('keydown', event => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    const el = target(event);
    if (!el || !el.matches('button,summary,.btn,[role=button],[role=tab]')) return;
    const name = el.dataset.sound || soundFor(el);
    if (name && name !== 'none') { press(name); setTimeout(() => release(name), 90); }
  });
}
