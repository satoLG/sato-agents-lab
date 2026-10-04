import * as T from '../vendor/three.module.min.js';
export function boardRows(board){return [...(board?.upcoming||[]),...(board?.rows||[])];}
export function createHistoryBoard(parent,{box,mesh},sector,{x=7,z=-7,y=2.775}={}){
 const root=new T.Group();root.name='sector-execution-board';root.userData.historySector=sector;root.position.set(x,y,z);parent.add(root);
 box(root,2.75,5.55,.44,'#25333b');
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1536;const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const screen=mesh(root,new T.PlaneGeometry(2.56,5.32),new T.MeshBasicMaterial({map:texture}),0,0,.24,false);screen.userData.dynamic=true;
 root.traverse(object=>object.userData.dynamic=true);
 let last='';
 function update(board){const rows=boardRows(board).slice(0,6),key=JSON.stringify(rows);if(last===key)return;last=key;
  ctx.fillStyle='#111c25';ctx.fillRect(0,0,768,1536);ctx.font='bold 42px Nunito';ctx.fillStyle='#ffd17a';ctx.fillText('EXECUÇÕES',38,78);ctx.font='bold 34px Nunito';ctx.fillStyle='#b5e9ff';ctx.fillText(sector.toUpperCase(),38,133);
  rows.forEach((row,i)=>{const y=216+i*192;ctx.fillStyle=i%2?'#172630':'#1c2d38';ctx.fillRect(24,y-39,720,176);ctx.font='27px monospace';ctx.fillStyle='#b4ccd9';const stamp=new Date(row.when);ctx.fillText(Number.isNaN(+stamp)?'—':stamp.toLocaleString('pt-BR'),38,y);ctx.font='bold 31px Nunito';ctx.fillStyle='#e2eff4';ctx.fillText(String(row.name||'—').slice(0,32),38,y+53,680);ctx.font='29px Nunito';ctx.fillStyle=row.status==='FALHA'?'#ff947e':row.status==='AGENDADO'?'#ffd17a':'#86e5bf';ctx.fillText(row.status||'REGISTRADO',38,y+104);});
  if(!rows.length){ctx.font='30px Nunito';ctx.fillStyle='#93b3c7';ctx.fillText('Sem execuções disponíveis',38,250,680);}
  ctx.font='27px Nunito';ctx.fillStyle='#93b3c7';ctx.fillText('INTERAJA PARA AMPLIAR',38,1490);texture.needsUpdate=true;
 }
 update();return {root,update};
}
