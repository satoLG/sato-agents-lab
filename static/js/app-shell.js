// Barra lateral das páginas internas: no desktop recolhe/expande (lembrado no navegador);
// no celular abre como gaveta por cima do conteúdo e fecha ao escolher um item.
const root = document.documentElement;
const side = document.getElementById('app-side');
const scrim = document.querySelector('.app-scrim');
const menu = document.querySelector('.app-menu');
const mobile = matchMedia('(max-width: 899px)');
const STORE = 'sato-side';

function isOpen() {
  return mobile.matches ? root.dataset.side === 'open' : root.dataset.side !== 'closed';
}

function set(open, {focus = false} = {}) {
  if (mobile.matches) {
    root.dataset.side = open ? 'open' : 'drawer';
    if (scrim) scrim.hidden = !open;
  } else {
    if (open) delete root.dataset.side; else root.dataset.side = 'closed';
    try { localStorage.setItem(STORE, open ? 'open' : 'closed'); } catch { /* sem storage */ }
  }
  menu?.setAttribute('aria-expanded', String(open));
  if (focus) (open ? side?.querySelector('a,button') : menu)?.focus();
}

function sync() {
  if (mobile.matches) { root.dataset.side = 'drawer'; if (scrim) scrim.hidden = true; }
  else {
    let stored = null;
    try { stored = localStorage.getItem(STORE); } catch { /* sem storage */ }
    if (stored === 'closed') root.dataset.side = 'closed'; else delete root.dataset.side;
    if (scrim) scrim.hidden = true;
  }
  menu?.setAttribute('aria-expanded', String(isOpen()));
}

for (const button of document.querySelectorAll('[data-side-toggle]')) {
  button.addEventListener('click', () => set(!isOpen(), {focus: true}));
}
scrim?.addEventListener('click', () => set(false));
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mobile.matches && isOpen()) set(false, {focus: true});
});
// No celular, escolher uma aba ou seção fecha a gaveta.
side?.addEventListener('click', (event) => {
  if (mobile.matches && event.target.closest('[role=tab],.kb-nav a')) set(false);
});
mobile.addEventListener('change', sync);
sync();

// No dashboard o título da barra do celular acompanha a aba aberta.
const title = document.querySelector('.app-title');
document.addEventListener('dashboard:tab', (event) => {
  const tab = document.querySelector(`[data-tab="${event.detail}"]`);
  if (title && tab) title.textContent = tab.textContent.trim();
});
