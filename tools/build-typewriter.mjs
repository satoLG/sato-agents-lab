import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({stdin:{contents:"export {default} from 'typewriter-effect/dist/core.js';",resolveDir:process.cwd()},bundle:true,minify:true,format:'esm',outfile:'static/vendor/typewriter.module.js'});
await copyFile('node_modules/typewriter-effect/LICENSE','static/vendor/TYPEWRITER-LICENSE.txt');
