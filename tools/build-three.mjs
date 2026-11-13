import {build} from 'esbuild';

await build({entryPoints:['node_modules/three/build/three.module.js'],bundle:true,minify:true,format:'esm',outfile:'static/vendor/three.module.min.js'});
