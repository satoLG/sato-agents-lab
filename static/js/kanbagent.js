// kanbagent: só conforto. Sem JS, tudo funciona por formulário e link.

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
