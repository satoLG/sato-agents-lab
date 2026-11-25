// kanbagent: conforto por cima dos formulários. Sem JS tudo funciona por formulário e link;
// com JS os cards se arrastam entre as listas, e só acendem as listas permitidas pelas regras.
import {press, release} from './button-sounds.js';

for (const form of document.querySelectorAll('form[data-autosubmit]')) {
  form.addEventListener('change', () => form.requestSubmit());
}

for (const form of document.querySelectorAll('form[data-confirm]')) {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
}

// No formulário de nova ideia, o repositório acompanha o projeto escolhido.
for (const form of document.querySelectorAll('form')) {
  const project = form.querySelector('[data-project-select]');
  const repo = form.querySelector('[data-repo-select]');
  if (!project || !repo) continue;
  const sync = () => {
    for (const option of repo.options) {
      if (!option.dataset.project) continue;
      option.hidden = Boolean(project.value) && option.dataset.project !== project.value;
    }
    if (repo.selectedOptions[0]?.hidden) repo.value = '';
  };
  project.addEventListener('change', sync);
  sync();
}

// --- arrastar e soltar -----------------------------------------------------------------------------

const board = document.querySelector('.kb-board[data-rules]');
if (board) setupDrag(board);

function setupDrag(board) {
  const rules = JSON.parse(board.dataset.rules);
  const csrf = board.dataset.csrf;
  const dialog = document.getElementById('kb-move');
  const trash = document.querySelector('.kb-trash');
  const HOLD_MS = 320, SLOP = 6;
  let pending = null, drag = null, justDragged = false;

  const targets = () => [...document.querySelectorAll('[data-drop]')];

  board.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.kb-card[data-card]');
    if (!card || event.button > 0 || card.classList.contains('kb-busy')) return;
    pending = {card, id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType !== 'mouse', timer: 0};
    // Mouse: sem isso o navegador seleciona texto ao arrastar (o clique continua abrindo o card).
    if (!pending.touch) event.preventDefault();
    // No toque, segurar abre o arrasto; mexer antes disso é rolar a página.
    if (pending.touch) pending.timer = setTimeout(() => pending && start(pending.x, pending.y), HOLD_MS);
  });

  addEventListener('pointermove', (event) => {
    if (drag) { move(event.clientX, event.clientY); return; }
    if (!pending || event.pointerId !== pending.id) return;
    const far = Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > SLOP;
    if (!far) return;
    if (pending.touch) cancelPending(); else start(event.clientX, event.clientY);
  });

  addEventListener('pointerup', (event) => {
    if (drag) finish(event.clientX, event.clientY); else cancelPending();
  });
  addEventListener('pointercancel', () => { if (drag) abort(); else cancelPending(); });
  addEventListener('keydown', (event) => { if (event.key === 'Escape' && drag) abort(); });
  // Enquanto arrasta no toque a página não rola.
  addEventListener('touchmove', (event) => { if (drag) event.preventDefault(); }, {passive: false});
  // Arrastar não abre o card.
  board.addEventListener('click', (event) => {
    if (justDragged && event.target.closest('.kb-card')) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  board.addEventListener('contextmenu', (event) => { if (drag || pending?.touch) event.preventDefault(); });

  function cancelPending() {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  }

  function start(x, y) {
    const {card} = pending;
    clearTimeout(pending.timer);
    pending = null;
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('kb-ghost');
    ghost.removeAttribute('href');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${rect.width}px`;
    document.body.append(ghost);
    const allowed = new Set((card.dataset.next || '').split(' ').filter(Boolean));
    drag = {card, ghost, dx: x - rect.left, dy: y - rect.top, allowed, over: null};
    card.classList.add('kb-dragging-source');
    document.body.classList.add('kb-dragging');
    for (const zone of targets()) {
      const stage = zone.dataset.drop;
      if (stage === card.dataset.stage) continue;
      zone.classList.add(allowed.has(stage) ? 'kb-drop-ok' : 'kb-drop-no');
    }
    if (trash) trash.classList.toggle('kb-trash-on', allowed.has('descartado'));
    navigator.vibrate?.(12);
    press('hi75-knob');
    move(x, y);
  }

  function zoneAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop]');
    return el && el.classList.contains('kb-drop-ok') ? el : null;
  }

  function move(x, y) {
    drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) rotate(3deg)`;
    const zone = zoneAt(x, y);
    if (zone !== drag.over) {
      drag.over?.classList.remove('kb-drop-hover');
      zone?.classList.add('kb-drop-hover');
      drag.over = zone;
    }
    // Perto das bordas o quadro rola sozinho.
    const box = board.getBoundingClientRect(), edge = 48;
    if (x < box.left + edge) board.scrollLeft -= 14;
    else if (x > box.right - edge) board.scrollLeft += 14;
  }

  function cleanup() {
    drag.ghost.remove();
    drag.card.classList.remove('kb-dragging-source');
    document.body.classList.remove('kb-dragging');
    for (const zone of targets()) zone.classList.remove('kb-drop-ok', 'kb-drop-no', 'kb-drop-hover');
    trash?.classList.remove('kb-trash-on');
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 50);
  }

  function abort() { cleanup(); drag = null; }

  async function finish(x, y) {
    const zone = zoneAt(x, y);
    const {card} = drag;
    cleanup();
    drag = null;
    if (!zone) return;
    const from = card.dataset.stage, to = zone.dataset.drop, key = `${from}>${to}`;
    let texto = null;
    if (to === 'descartado' || rules.returns.includes(key)) {
      texto = await ask(card, from, to, key);
      if (texto === undefined) return;
    }
    await commit(card, to, texto);
  }

  // Diálogo para movimentos que pedem comentário (ou confirmação, no descarte).
  function ask(card, from, to, key) {
    const required = rules.needsText.includes(key);
    const title = card.querySelector('.kb-card-title')?.textContent || 'Card';
    const area = dialog.querySelector('textarea');
    const error = dialog.querySelector('.kb-dialog-error');
    dialog.querySelector('h2').textContent = rules.labels[key] || (to === 'descartado' ? '🗑 Descartar' : `→ ${rules.stages[to]}`);
    dialog.querySelector('[data-move-help]').textContent = to === 'descartado'
      ? `Descartar "${title}"? O card sai do quadro (fica em "Mostrar descartados").`
      : required ? `"${title}": diga o que mudar. O comentário fica na atividade do card.`
        : `"${title}": quer deixar um comentário? (opcional)`;
    area.hidden = to === 'descartado';
    area.required = required;
    area.value = '';
    area.placeholder = required ? 'O que mudar?' : 'Comentário (opcional)';
    error.hidden = true;
    dialog.querySelector('[data-move-ok]').textContent = to === 'descartado' ? 'Descartar' : 'Mover';
    dialog.querySelector('[data-move-ok]').classList.toggle('danger', to === 'descartado');
    return new Promise((resolve) => {
      const onClose = () => {
        dialog.removeEventListener('close', onClose);
        resolve(dialog.returnValue === 'ok' ? (area.value.trim() || null) : undefined);
      };
      const form = dialog.querySelector('form');
      form.onsubmit = (event) => {
        if (event.submitter?.value === 'ok' && required && !area.value.trim()) {
          event.preventDefault();
          error.textContent = 'Escreva o comentário para continuar.';
          error.hidden = false;
          area.focus();
        }
      };
      dialog.returnValue = '';
      dialog.addEventListener('close', onClose);
      dialog.showModal();
      if (!area.hidden) area.focus();
    });
  }

  async function commit(card, to, texto) {
    const item = card.closest('li');
    const list = document.querySelector(`.kb-list[data-drop="${to}"] .kb-cards`);
    const origin = item.parentElement, next = item.nextSibling;
    // Otimista: o card já vai para a lista nova e volta se o servidor recusar.
    card.classList.add('kb-busy');
    if (list) list.prepend(item); else item.remove();
    counts();
    try {
      const response = await fetch(`/kanbagent/api/cards/${card.dataset.card}/stage`, {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'X-Chat-CSRF': csrf},
        body: JSON.stringify(texto ? {para: to, texto} : {para: to}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
      release('hi75-medium');
      update(card, data);
    } catch (error) {
      origin.insertBefore(item, next);
      counts();
      toast(error.message);
    } finally {
      card.classList.remove('kb-busy');
    }
  }

  function update(card, data) {
    const stage = data.etapa_atual;
    let moves = data.proximas || [];
    if (stage === 'proposta' && !(data.proposta || '').trim()) moves = moves.filter((s) => s !== 'revisao');
    card.dataset.stage = stage;
    card.dataset.next = moves.join(' ');
    card.querySelector('.kb-label[data-stage]')?.setAttribute('data-stage', stage);
    card.querySelector('.kb-label[data-stage]')?.setAttribute('title', rules.stages[stage]);
    const time = card.querySelector('.kb-badge-time');
    if (time) time.textContent = '⏱ agora';
    const badges = card.querySelector('.kb-badges');
    const wait = badges?.querySelector('.kb-badge-wait');
    if (stage === 'proposta' && !(data.proposta || '').trim()) {
      if (!wait) badges?.insertAdjacentHTML('beforeend', '<span class="kb-badge kb-badge-wait" title="Esperando o Hermes escrever a proposta">⏳ aguardando Hermes</span>');
    } else wait?.remove();
    if (data.ajustes) {
      let adj = [...(badges?.children || [])].find((b) => b.textContent.startsWith('↺'));
      if (!adj) { badges?.insertAdjacentHTML('beforeend', '<span class="kb-badge" title="Voltas de ajuste"></span>'); adj = badges?.lastElementChild; }
      if (adj) adj.textContent = `↺ ${data.ajustes}`;
    }
  }

  function counts() {
    for (const list of document.querySelectorAll('.kb-list')) {
      const count = list.querySelector('.kb-count');
      if (count) count.textContent = list.querySelectorAll('.kb-cards > li').length;
    }
  }

  function toast(message) {
    const note = document.createElement('p');
    note.className = 'notice kb-flash error kb-toast';
    note.setAttribute('role', 'alert');
    note.textContent = message;
    document.body.append(note);
    setTimeout(() => note.remove(), 5000);
  }
}
