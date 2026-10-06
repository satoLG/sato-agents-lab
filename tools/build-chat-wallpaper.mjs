// Compose the vendored SVG Repo paths; no external requests at runtime.
import {readFile,writeFile} from 'node:fs/promises';
const names=['robot-neutral','game-control-doodle','robot-love','game-console','computer-chip','robot-hand-drawn-outline','rocket-hand-drawn-outline','star-hand-drawn-symbol-outline','joystick'];
const symbols=await Promise.all(names.map(async(name,index)=>{
 const source=await readFile(`static/images/doodles/${name}.svg`,'utf8');
 const viewBox=source.match(/viewBox="([^"]+)"/)[1];
 const body=source.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'').replace(/#[0-9a-f]{6}/gi,'#6ea093').replace(/stroke-width="16"/g,'stroke-width="10"');
 const fill=source.match(/<svg\b[^>]*\bfill="([^"]+)"/)?.[1]==='none'?'none':'#6ea093';
 return `<symbol id="doodle-${index}" viewBox="${viewBox}" fill="${fill}">${body}</symbol>`;
}));
// Seeded free placement keeps the wallpaper stable, with no rows or columns.
// Conservative bounding circles prevent overlaps, also across the repeat seam.
let seed=1739;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const tile=600,drawings=[];
for(let attempt=0;drawings.length<64&&attempt<30000;attempt++){
 const index=Math.floor(random()*names.length),size=index===7?22+random()*15:34+random()*34,angle=(random()-.5)*130,x=random()*tile,y=random()*tile;
 const radians=angle*Math.PI/180,radius=size/2*(Math.abs(Math.cos(radians))+Math.abs(Math.sin(radians)))+1;
 if(drawings.some(other=>{const dx=Math.min(Math.abs(x-other.x),tile-Math.abs(x-other.x)),dy=Math.min(Math.abs(y-other.y),tile-Math.abs(y-other.y));return Math.hypot(dx,dy)<radius+other.radius+7||(index===other.index&&Math.hypot(dx,dy)<115);}))continue;
 drawings.push({index,size,angle,x,y,radius});
}
if(drawings.length<64)throw new Error('Wallpaper placement did not fill the tile.');
const placements=[];
for(const {index,size,angle,x,y,radius} of drawings)for(const dx of [-tile,0,tile])for(const dy of [-tile,0,tile]){
 const cx=x+dx,cy=y+dy;if(cx+radius<0||cx-radius>tile||cy+radius<0||cy-radius>tile)continue;
 placements.push(`<use href="#doodle-${index}" x="${(cx-size/2).toFixed(2)}" y="${(cy-size/2).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" transform="rotate(${angle.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"${[3,4,8].includes(index)?' filter="url(#sketch)"':''}/>`);
}
await writeFile('static/images/robot-doodles.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tile} ${tile}" width="${tile}" height="${tile}"><defs><filter id="sketch" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="8"/><feDisplacementMap in="SourceGraphic" scale="1.2" xChannelSelector="R" yChannelSelector="G"/></filter>${symbols.join('')}</defs>${placements.join('')}</svg>\n`);
