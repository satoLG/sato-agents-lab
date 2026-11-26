import {test} from 'node:test';
import assert from 'node:assert/strict';
import {richHtml} from '../static/js/rich-text.js';

test('agent markup becomes styled HTML', () => {
  const html = richHtml('**Hermes** — ajustar\n- app.py:42 não escapa\n- falta `teste`');
  assert.match(html, /<strong>Hermes<\/strong>/);
  assert.match(html, /<li>app.py:42 não escapa<\/li>/);
  assert.match(html, /<code>teste<\/code>/);
});

test('text never injects HTML, scripts, images or non-http links', () => {
  const html = richHtml('<script>alert(1)</script> <img src=x onerror=alert(1)> ![a](https://x/y.png) [x](javascript:alert(1))');
  assert.doesNotMatch(html, /<script|<img|href="javascript/i);
  assert.match(html, /&lt;script&gt;/);
});

test('links open outside and single newlines stay as line breaks', () => {
  const html = richHtml('veja https://example.com\nsegunda linha');
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">/);
  assert.match(html, /<br>/);
});
