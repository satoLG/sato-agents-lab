// Texto rico do site (ADR 0012): tudo que um agente (Hermes, Claude) ou o Sato escreve e pode trazer
// marcação (**negrito**, listas, `código`, links, tabelas) passa por aqui. Markdown com HTML desligado,
// só links http(s), sem imagens: o texto nunca injeta nada na página.
import MarkdownIt from '../vendor/markdown-it.module.js';

export function createMarkdown({breaks = true, tableClass = 'rich-table', tableLabel = 'Tabela'} = {}) {
  const md = new MarkdownIt({html: false, linkify: true, breaks}).disable('image');
  md.validateLink = (url) => /^https?:\/\//i.test(url);
  md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    tokens[index].attrSet('target', '_blank');
    tokens[index].attrSet('rel', 'noopener noreferrer');
    return renderer.renderToken(tokens, index, options);
  };
  md.renderer.rules.table_open = () =>
    `<div class="${tableClass}" role="region" aria-label="${tableLabel}" tabindex="0"><table>`;
  md.renderer.rules.table_close = () => '</table></div>';
  return md;
}

const markdown = createMarkdown();

/** HTML seguro do texto com marcação. */
export function richHtml(text) {
  return markdown.render(String(text ?? ''));
}

/** Elemento <div class="rich"> pronto, para quem monta DOM em JS (abas do dashboard). */
export function richElement(text, className = '') {
  const node = document.createElement('div');
  node.className = `rich ${className}`.trim();
  node.innerHTML = richHtml(text);
  return node;
}

/** Templates marcam o texto cru com [data-rich]; aqui ele vira texto rico (sem JS, fica o texto). */
export function enhanceRich(root = document) {
  for (const node of root.querySelectorAll('[data-rich]:not([data-rich-done])')) {
    node.innerHTML = richHtml(node.textContent);
    node.classList.add('rich');
    node.dataset.richDone = '';
  }
}
