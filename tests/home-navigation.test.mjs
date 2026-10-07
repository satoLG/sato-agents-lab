import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedPosition} from '../static/js/home-navigation.js';

test('robot radius cannot cross room walls, furniture corners or shrub circles',()=>{
 const area={minX:-9,maxX:9,minZ:-10,maxZ:10,obstacles:[{minX:2,maxX:4,minZ:2,maxZ:4},{x:-3,z:-3,radius:1}]};
 assert.equal(allowedPosition(0,0,area),true);
 for(const [x,z]of [[8.5,0],[-8.5,0],[0,9.5],[0,-9.5],[2,3],[1.6,1.6],[-3,-3],[-3,-1.4]])assert.equal(allowedPosition(x,z,area),false,`${x},${z}`);
 assert.equal(allowedPosition(1.4,1.4,area),true);
 assert.equal(allowedPosition(-3,-1.3,area),true);
 assert.equal(allowedPosition(8.5,0,area,.22),true,'camera uses its own smaller collision radius');
});
