import {createMarkdown} from './rich-text.js';

// Mesmo Markdown do site inteiro (ADR 0012); no chat as quebras simples seguem o padrão do Markdown.
const markdown = createMarkdown({breaks: false, tableClass: 'chat-table', tableLabel: 'Tabela da resposta'});

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
