// Source SVGs are copied from Lucide, never drawn by the application.
import {mkdir,writeFile} from 'node:fs/promises';
const response=await fetch('https://api.github.com/repos/lucide-icons/lucide/commits/main',{headers:{'User-Agent':'sato-agents-lab'}});
if(!response.ok)throw new Error(`Lucide revision: ${response.status}`);
const {sha}=await response.json();
const icons=['arrow-up','arrow-up-right','arrow-left','history','settings-2','volume-2','volume-x','x','log-in','ellipsis','chevron-down','check-check','circle','flask-conical','trees','sparkles','layout-dashboard','copy','check','loader-circle'];
await mkdir('static/icons',{recursive:true});
const symbols=await Promise.all(icons.map(async name=>{
 const source=name==='history'?'messages-square':name;
 const r=await fetch(`https://raw.githubusercontent.com/lucide-icons/lucide/${sha}/icons/${source}.svg`);if(!r.ok)throw new Error(`${name}: ${r.status}`);
 const svg=await r.text(),body=svg.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'').trim();
 return `<symbol id="${name}" viewBox="0 0 24 24">${body}</symbol>`;
}));
await writeFile('static/icons/lucide.svg',`<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`);
const license=await fetch(`https://raw.githubusercontent.com/lucide-icons/lucide/${sha}/LICENSE`);if(!license.ok)throw new Error(`License: ${license.status}`);
await writeFile('static/icons/LICENSE-lucide.txt',await license.text());
await writeFile('static/icons/README.md',`# Lucide icons\n\nOfficial SVG paths from https://github.com/lucide-icons/lucide/tree/${sha}/icons.\nISC license: LICENSE-lucide.txt.\n\nRegenerate with node tools/vendor-home-icons.mjs. The local sprite needs no CDN at runtime.\n`);
console.log(`Vendored ${icons.length} Lucide icons at ${sha}.`);
