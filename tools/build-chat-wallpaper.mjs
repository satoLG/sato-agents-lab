// Compose original Popsy paths locally, with equally spaced compact slots.
import {readFile,writeFile} from 'node:fs/promises';
const directory='static/images/doodles/popsy';
const icons=JSON.parse(await readFile(`${directory}/manifest.json`,'utf8'));
const platforms=new Set(['facebook','twitter','instagram','messenger','youtube','spotify','reddit','slack','pinterest','app-store','google-play','airbnb','paypal']);
if(!icons.length||new Set(icons.map(icon=>icon.id)).size!==icons.length||icons.some(icon=>platforms.has(icon.name)))throw new Error('Expected distinct non-platform Popsy icons.');
const symbols=await Promise.all(icons.map(async({name,bounds},index)=>{
 const source=await readFile(`${directory}/${name}.svg`,'utf8');
 if(bounds?.length!==4||bounds.some(n=>!Number.isFinite(n))||bounds[2]<=0||bounds[3]<=0)throw new Error(`Missing path bounds for ${name}.`);
 // These original path bounds remove empty source margins without clipping ink.
 const [x,y,w,h]=bounds,viewBox=[x-.5,y-.5,w+1,h+1].join(' ');
 const body=source.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'')
  .replace(/fill="(?:#000000|#000|black)"/gi,'fill="#6ea093"')
  .replace(/fill="(?:#ffffff|#fff|white)"/gi,'fill="#111b21"');
 return `<symbol id="doodle-${index}" viewBox="${viewBox}" fill="none">${body}</symbol>`;
}));
let seed=1739;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const tile=600,pitch=30,gap=1.2,side=tile/pitch,drawings=[];
// Equal pitch replaces random empty pockets. Shuffled full decks include every
// generic design with a balanced frequency, while rotations keep the doodle feel.
let deck=[];
function nextIcon(){
 if(!deck.length){deck=icons.map((_,index)=>index);for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}}
 return deck.pop();
}
for(let row=0;row<side;row++)for(let column=0;column<side;column++){
 const index=nextIcon(),[, ,bw,bh]=icons[index].bounds,w=bw+1,h=bh+1;
 const narrow=Math.min(w,h)/Math.max(w,h)<.7;
 const angle=narrow?(random()<.5?-1:1)*(40+random()*10):(random()-.5)*36;
 const radians=angle*Math.PI/180,c=Math.abs(Math.cos(radians)),s=Math.abs(Math.sin(radians));
 const scale=(pitch-gap)/Math.max(w*c+h*s,h*c+w*s);
 const width=w*scale,height=h*scale,boundWidth=width*c+height*s,boundHeight=height*c+width*s;
 drawings.push({index,width,height,boundWidth,boundHeight,angle,x:(column+.5)*pitch,y:(row+.5)*pitch});
}
// Conservative rotated rectangles prove the same minimum clearance at every
// slot boundary, including the corners and seams of the repeated tile.
let clearance=Infinity;
for(let i=0;i<drawings.length;i++)for(let j=0;j<i;j++){
 const a=drawings[i],b=drawings[j],dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
 const x=Math.max(0,Math.min(dx,tile-dx)-(a.boundWidth+b.boundWidth)/2);
 const y=Math.max(0,Math.min(dy,tile-dy)-(a.boundHeight+b.boundHeight)/2);
 const distance=Math.hypot(x,y);clearance=Math.min(clearance,distance);
 if(distance<gap-1e-6)throw new Error('Wallpaper bounds overlap.');
}
if(new Set(drawings.map(d=>d.index)).size!==icons.length)throw new Error('Unused wallpaper design.');
const coverage=drawings.reduce((sum,d)=>sum+d.boundWidth*d.boundHeight,0)/(tile*tile);
if(coverage<.7)throw new Error('Wallpaper has too much empty space.');
const placements=drawings.map(({index,width,height,angle,x,y})=>`<use href="#doodle-${index}" x="${(x-width/2).toFixed(4)}" y="${(y-height/2).toFixed(4)}" width="${width.toFixed(4)}" height="${height.toFixed(4)}" transform="rotate(${angle.toFixed(4)} ${x} ${y})"/>`);
await writeFile('static/images/robot-doodles.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tile} ${tile}" width="${tile}" height="${tile}"><defs>${symbols.join('')}</defs>${placements.join('')}</svg>\n`);
console.log(`Wallpaper: ${icons.length} generic designs, ${drawings.length} equally spaced slots, ${pitch}px pitch, ${clearance.toFixed(2)}px minimum clearance, ${(coverage*100).toFixed(1)}% occupied bounds.`);
