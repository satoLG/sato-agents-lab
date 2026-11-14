import * as T from '../vendor/three.module.min.js';

// Nintendo 64 era surfaces: small textures drawn with hard texel edges.
// Shrinks every texture under `root` to at most `size` pixels a side and
// switches it to nearest-neighbour magnification. Sources shared by cloned
// textures are shrunk once.
const shrunk=new WeakSet();
export function pixelTexture(texture,size=64){
 const image=texture.image,longest=image?Math.max(image.width||0,image.height||0):0;
 if(longest>size&&!shrunk.has(texture.source)){
  const canvas=document.createElement('canvas'),scale=size/longest;canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);texture.userData.original=image.src||'';texture.image=canvas;
 }
 shrunk.add(texture.source);
 texture.magFilter=T.NearestFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.anisotropy=1;texture.generateMipmaps=true;texture.needsUpdate=true;
 return texture;
}
export function pixelateTextures(root,size=64){
 const seen=new Set();
 root.traverse(object=>{
  for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[])
   for(const value of Object.values(material))if(value?.isTexture&&!seen.has(value)){seen.add(value);pixelTexture(value,size);}
 });
}
