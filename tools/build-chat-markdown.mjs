import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';

await build({
  stdin: {contents: "export {default} from 'markdown-it';", resolveDir: process.cwd()},
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: 'static/vendor/markdown-it.module.js',
});

const licenses = [
  ['markdown-it', 'LICENSE'],
  ['entities', 'LICENSE'],
  ['linkify-it', 'LICENSE'],
  ['mdurl', 'LICENSE'],
  ['punycode.js', 'LICENSE-MIT.txt'],
  ['uc.micro', 'LICENSE.txt'],
];
const notices = await Promise.all(licenses.map(async ([name, file]) =>
  name + '\n\n' + (await readFile('node_modules/' + name + '/' + file, 'utf8')).trim()
));
await writeFile('static/vendor/MARKDOWN-IT-LICENSE.txt', notices.join('\n\n---\n\n') + '\n');
