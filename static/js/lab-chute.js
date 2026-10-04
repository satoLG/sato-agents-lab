import * as T from '../vendor/three.module.min.js';

// The reception and companion share this open delivery tube and its blue collar.
export function createDeliveryChute(parent,art,{height=8,radius=.7}={}){
 const {mesh,box,cylinder,ring,mat,glow}=art,root=new T.Group();root.name='gateway-ceiling-parcel-chute';parent.add(root);
 const shell=mat('#647e8e',.65,.34);
 mesh(root,new T.CylinderGeometry(radius,radius,height,32,1,true),shell,0,height/2,0);
 const inside=mat('#263c4d',.5,.5).clone();inside.side=T.BackSide;
 mesh(root,new T.CylinderGeometry(radius-.025,radius-.025,height,32,1,true),inside,0,height/2,0);
 box(root,radius*2.7,.16,radius*2.7,'#263c4d',0,height-.08,0);
 cylinder(root,radius*1.2,.2,'#c3d5dd',0,.1,0);
 // Hide the collar's solid center behind a recessed mouth, under the tube shell.
 const mouth=mesh(root,new T.CircleGeometry(radius*.93,32),mat('#07131d'),0,-.012,0);mouth.rotation.x=Math.PI/2;
 ring(root,radius*1.055,.055,glow('#76d9ff'),0,0,0,true);
 for(let y=.7;y<height;y+=2.5)ring(root,radius*1.04,.07,'#344e60',0,y,0,true);
 return root;
}
