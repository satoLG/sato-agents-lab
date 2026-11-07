import MarkdownIt from '../vendor/markdown-it.module.js';

const markdown = new MarkdownIt({html: false}).disable('image');
markdown.validateLink = url => /^https?:\/\//i.test(url);
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};
markdown.renderer.rules.table_open = () =>
  '<div class="chat-table" role="region" aria-label="Tabela da resposta" tabindex="0"><table>';
markdown.renderer.rules.table_close = () => '</table></div>';

export function formatChatAnswer(text) {
  const env = {};
  const tokens = markdown.parse(text, env);
  const formatted = tokens.some(token =>
    !['paragraph_open', 'paragraph_close', 'inline'].includes(token.type) ||
    token.children?.some(child => !['text', 'softbreak'].includes(child.type))
  );
  if (!formatted) return null;

  const index = tokens.findIndex(token => token.type === 'table_open');
  const lead = tokens.slice(0, index < 0 ? undefined : index);
  const intro = lead.find((token, position) =>
    token.type === 'inline' && lead[position - 1]?.type === 'paragraph_open'
  ) || lead.find(token => token.type === 'inline');
  const preview = intro?.children
    .map(child => child.type === 'softbreak' || child.type === 'hardbreak' ? ' ' : child.content)
    .join('').trim();
  return {
    html: markdown.renderer.render(tokens, markdown.options, env),
    preview: preview || (index >= 0 ? 'Resposta com tabela. Abra para ver os detalhes.' : 'Abra para ver a resposta completa.'),
  };
}
