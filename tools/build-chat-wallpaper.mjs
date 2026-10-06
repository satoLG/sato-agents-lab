// Compose original Popsy hand-drawn paths from vendored SVGs, without a CDN.
import {readFile,writeFile} from 'node:fs/promises';
const directory='static/images/doodles/popsy';
const icons=JSON.parse(await readFile(`${directory}/manifest.json`,'utf8'));
if(icons.length!==30||new Set(icons.map(icon=>icon.id)).size!==30)throw new Error('Expected 30 distinct Popsy icons.');
const symbols=await Promise.all(icons.map(async({name},index)=>{
 const source=await readFile(`${directory}/${name}.svg`,'utf8');
 const viewBox=source.match(/viewBox="([^"]+)"/)[1];
 // Preserve the original irregular silhouettes; white interiors blend into
 // the default background, while black ink becomes wallpaper green.
 const body=source.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'')
  .replace(/fill="(?:#000000|#000|black)"/gi,'fill="#6ea093"')
  .replace(/fill="(?:#ffffff|#fff|white)"/gi,'fill="#111b21"');
 return `<symbol id="doodle-${index}" viewBox="${viewBox}" fill="none">${body}</symbol>`;
}));
// Shuffle four copies of every icon, so none of the 30 designs is omitted.
let seed=1739;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const order=Array.from({length:120},(_,index)=>index%icons.length);
for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
const tile=600,gap=6,drawings=[];
const distance=(a,b)=>{const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);return Math.hypot(Math.min(dx,tile-dx),Math.min(dy,tile-dy));};
for(const index of order){
 let placed=false;
 for(let attempt=0;attempt<30000;attempt++){
  const size=22+random()*13,angle=(random()-.5)*56,x=random()*tile,y=random()*tile;
  const radians=angle*Math.PI/180,radius=size/2*(Math.abs(Math.cos(radians))+Math.abs(Math.sin(radians)))+1;
  const candidate={index,size,angle,x,y,radius};
  if(drawings.some(other=>distance(candidate,other)<radius+other.radius+gap||(index===other.index&&distance(candidate,other)<90)))continue;
  drawings.push(candidate);placed=true;break;
 }
 if(!placed)throw new Error(`No collision-free space for ${icons[index].name}.`);
}
// Validate every pair on the torus, including corners and repeat seams.
for(let i=0;i<drawings.length;i++)for(let j=0;j<i;j++){
 if(distance(drawings[i],drawings[j])<drawings[i].radius+drawings[j].radius+gap)throw new Error('Overlapping wallpaper icons.');
}
const placements=[];
for(const {index,size,angle,x,y,radius} of drawings)for(const dx of [-tile,0,tile])for(const dy of [-tile,0,tile]){
 const cx=x+dx,cy=y+dy;if(cx+radius<0||cx-radius>tile||cy+radius<0||cy-radius>tile)continue;
 placements.push(`<use href="#doodle-${index}" x="${(cx-size/2).toFixed(2)}" y="${(cy-size/2).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" transform="rotate(${angle.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`);
}
await writeFile('static/images/robot-doodles.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tile} ${tile}" width="${tile}" height="${tile}"><defs>${symbols.join('')}</defs>${placements.join('')}</svg>\n`);
console.log(`Wallpaper: ${icons.length} original Popsy designs, ${drawings.length} placements, ${gap}px minimum gap including repeat seams.`);
