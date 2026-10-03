import * as T from '../vendor/three.module.min.js';
export function boardRows(board){return [...(board?.upcoming||[]),...(board?.rows||[])];}
export function createHistoryBoard(parent,{box,mesh},sector,{z=-3.1}={}){
 const root=new T.Group();root.name='sector-execution-board';root.userData.historySector=sector;root.position.set(0,3.6,z);root.visible=false;parent.add(root);
 box(root,8.25,2.5,.15,'#25333b');
 const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=480;const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const screen=mesh(root,new T.PlaneGeometry(8,2.3),new T.MeshBasicMaterial({map:texture}),0,0,.09,false);screen.userData.dynamic=true;
 root.traverse(object=>object.userData.dynamic=true);
 let last='';
 return {root,update(board){root.visible=!!boardRows(board).length;if(!root.visible)return;const rows=boardRows(board).slice(0,6),key=JSON.stringify(rows);if(last===key)return;last=key;
  ctx.fillStyle='#111c25';ctx.fillRect(0,0,1536,480);ctx.font='bold 35px monospace';ctx.fillStyle='#ffd17a';ctx.fillText('EXECUÇÕES / '+sector.toUpperCase(),30,46);ctx.font='22px monospace';ctx.fillStyle='#93b3c7';ctx.fillText('HORÁRIO                 EXECUÇÃO                              STATUS',30,83);
  rows.forEach((row,i)=>{const y=123+i*49;ctx.fillStyle=i%2?'#172630':'#1c2d38';ctx.fillRect(24,y-29,1488,43);ctx.font='25px monospace';ctx.fillStyle='#d5e6ee';const stamp=new Date(row.when);ctx.fillText(Number.isNaN(+stamp)?'—':stamp.toLocaleString('pt-BR'),32,y);ctx.fillText(String(row.name||'—').slice(0,39),440,y);ctx.fillStyle=row.status==='FALHA'?'#ff947e':row.status==='AGENDADO'?'#ffd17a':'#86e5bf';ctx.fillText(row.status||'REGISTRADO',1185,y);});
  ctx.font='21px monospace';ctx.fillStyle='#93b3c7';ctx.fillText('INTERAJA PARA AMPLIAR E VER O HISTÓRICO',30,464);texture.needsUpdate=true;
 }};
}
