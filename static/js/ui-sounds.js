// Sons de clique nas páginas internas (dashboard, kanbagent, login) e o botão de mudo do topo.
import {enabled, preload, setEnabled, wire} from './button-sounds.js';

const CLICKABLE = 'button,.btn,[role=button],[role=tab],summary,select,a.kb-card,.kb-nav a,.site-nav a,.site-brand,input[type=checkbox],input[type=radio]';

function soundFor(el) {
  if (el.matches('.sound-toggle')) return 'none';
  if (el.matches('.tab,[role=tab],.seg button,select,summary,.kb-nav a,input[type=checkbox],input[type=radio]')) return 'hi75-knob';
  if (el.matches('.btn:not(.ghost),button[type=submit]:not(.ghost)')) return 'hi75-medium';
  return 'hi75-soft';
}

function syncToggle(button) {
  const on = enabled();
  document.documentElement.dataset.uiSound = on ? 'on' : 'off';
  button?.setAttribute('aria-pressed', String(on));
  button?.setAttribute('aria-label', on ? 'Desligar sons de clique' : 'Ligar sons de clique');
  if (button) button.title = button.getAttribute('aria-label');
}

const toggle = document.querySelector('.sound-toggle');
syncToggle(toggle);
toggle?.addEventListener('click', () => { setEnabled(!enabled()); syncToggle(toggle); });

wire(document, {selector: CLICKABLE, soundFor});
preload(['hi75-soft', 'hi75-medium', 'hi75-knob']);
