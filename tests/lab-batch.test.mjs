import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {batchStatic} from '../static/js/lab-batch.js';

test('batching a translated and scaled workstation preserves its world bounds',()=>{
  const scene=new T.Scene(),sector=new T.Group(),desk=new T.Group();
  sector.position.set(-24,1.86,-21);sector.rotation.y=.2;sector.scale.setScalar(.7);scene.add(sector);desk.position.z=-.45;sector.add(desk);
  const material=new T.MeshStandardMaterial();
  for(const x of [-3.6,3.6]){const part=new T.Mesh(new T.BoxGeometry(.2,1,.9),material);part.position.set(x,.5,0);desk.add(part);}
  scene.updateMatrixWorld(true);const before=new T.Box3().setFromObject(desk);
  batchStatic(desk);scene.updateMatrixWorld(true);const after=new T.Box3().setFromObject(desk);
  assert.equal(desk.children.length,1);assert.ok(before.min.distanceTo(after.min)<1e-6);assert.ok(before.max.distanceTo(after.max)<1e-6);
});
