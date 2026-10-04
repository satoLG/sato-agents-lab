import * as T from '../vendor/three.module.min.js';

// The reception and companion share this open delivery tube and its blue collar.
export function createDeliveryChute(parent,art,{height=8,radius=.7}={}){
 const {mesh,box,ring,mat,glow}=art,root=new T.Group();root.name='gateway-ceiling-parcel-chute';parent.add(root);
 const shell=mat('#647e8e',.65,.34);
 mesh(root,new T.CylinderGeometry(radius,radius,height,32,1,true),shell,0,height/2,0);
 const inside=mat('#263c4d',.5,.5).clone();inside.side=T.BackSide;
 mesh(root,new T.CylinderGeometry(radius-.025,radius-.025,height,32,1,true),inside,0,height/2,0);
 box(root,radius*2.7,.16,radius*2.7,'#263c4d',0,height-.08,0);
 // Annular collar: a real open mouth, so the parcel never crosses a solid cap.
 mesh(root,new T.LatheGeometry([
  new T.Vector2(radius*.93,0),new T.Vector2(radius*.93,.2),
  new T.Vector2(radius*1.2,.2),new T.Vector2(radius*1.2,0),new T.Vector2(radius*.93,0)
 ],32),mat('#c3d5dd'));
 ring(root,radius*1.055,.055,glow('#76d9ff'),0,0,0,true);
 for(let y=.7;y<height;y+=2.5)ring(root,radius*1.04,.07,'#344e60',0,y,0,true);
 return root;
}
