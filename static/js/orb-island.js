import * as T from '../vendor/three.module.min.js';

// A small spherical cap intersects the water, rather than sitting above it.
function coastRadius(angle) {
  return .70 * (1 + .10*Math.sin(angle*3+.7) + .06*Math.cos(angle*5-1.2));
}
function terrainHeight(x, z) {
  const d = Math.hypot(x, z), angle = Math.atan2(z, x);
  const r = d / coastRadius(angle);
  const cap = Math.sqrt(Math.max(0, 2.065**2 - d*d));
  const edge = T.MathUtils.smoothstep(r, .72, 1.07);
  const hill = Math.exp(-((x+.17)**2/.065 + (z+.18)**2/.10)) * .32;
  const ridge = Math.exp(-((x-.19)**2/.075 + (z+.27)**2/.035)) * .20;
  const uneven = (Math.sin(x*17+z*6)*Math.cos(z*15-x*3)*.015 + Math.sin(x*7-z*9)*.012) * (1-edge);
  return cap + .105*(1-edge) + hill + ridge + uneven - .07*T.MathUtils.smoothstep(r,.90,1.12);
}

function terrainGeometry() {
  const rings=24, segments=112, positions=[], colors=[], indices=[];
  const sand=new T.Color('#d8c69b'), wetSand=new T.Color('#8b8e68');
  const grass=new T.Color('#769c49'), shadeGrass=new T.Color('#2e6445'), rock=new T.Color('#838e75');
  for (let ring=0; ring<=rings; ring++) {
    const f = ring/rings;
    for (let j=0; j<=segments; j++) {
      const a=j/segments*Math.PI*2, d=coastRadius(a)*f*1.12;
      const x=Math.cos(a)*d, z=Math.sin(a)*d, y=terrainHeight(x,z);
      positions.push(x,y,z);
      const color=sand.clone();
      if(f<.72) {
        color.copy(grass).lerp(shadeGrass,.22+.24*Math.sin(x*13+z*17));
        if(y>2.35)color.lerp(rock,T.MathUtils.smoothstep(y,2.35,2.52)*.65);
      } else if(f<.79) color.lerp(grass,(.79-f)/.07*.8);
      else color.lerp(wetSand,T.MathUtils.smoothstep(f,.90,1.));
      color.multiplyScalar(.96+.045*Math.sin(x*80)*Math.cos(z*74));
      colors.push(color.r,color.g,color.b);
      if(ring&&j){const b=ring*(segments+1)+j,a0=b-segments-1;indices.push(a0-1,b-1,a0,b-1,b,a0);}
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  // x,z indexing produces downward triangles; reverse for the visible top.
  geometry.setIndex(indices.reverse());geometry.computeVertexNormals();
  return geometry;
}

function leafGeometry(length, width) {
  const positions=[], indices=[];
  for(let i=0;i<=12;i++) {
    const t=i/12, w=Math.sin(Math.PI*t)*width;
    const y=Math.sin(t*Math.PI)*length*.17-t*t*length*.34;
    positions.push(t*length,y,-w,t*length,y+.025*Math.sin(Math.PI*t),0,t*length,y,w);
    if(i){let b=i*3;indices.push(b-3,b-2,b,b-2,b+1,b,b-2,b-1,b+1,b-1,b+2,b+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function createOrbIsland() {
  const island=new T.Group();island.name='orb-island';
  const land=new T.Mesh(terrainGeometry(),new T.MeshStandardMaterial({vertexColors:true,roughness:.95,side:T.DoubleSide}));
  land.name='island-shore';land.receiveShadow=true;island.add(land);
  const palmRoots=[];
  const bark=new T.MeshStandardMaterial({color:'#8f7851',roughness:1});
  const leafMaterials=['#31694a','#488350','#6b9b51'].map(color=>new T.MeshStandardMaterial({color,roughness:.85,side:T.DoubleSide}));
  const palmLocations=[[-.33,.12,.75,.25],[.25,-.05,.60,-.45],[.07,.35,.50,.85],[-.30,-.30,.57,-.3]];
  for(let k=0;k<palmLocations.length;k++) {
    const [x,z,height,lean]=palmLocations[k], root=new T.Group();root.position.set(x,terrainHeight(x,z)-.014,z);island.add(root);
    const curve=new T.CatmullRomCurve3([new T.Vector3(),new T.Vector3(lean*.035,height*.34,0),new T.Vector3(lean*.11,height*.7,.018),new T.Vector3(lean*.20,height,.025)]);
    const trunk=new T.Mesh(new T.TubeGeometry(curve,14,.026,7,false),bark);trunk.castShadow=true;root.add(trunk);
    // Fine trunk rings make the tiny palms legible when zoomed in.
    for(let i=2;i<13;i++) {
      const t=i/14, band=new T.Mesh(new T.TorusGeometry(.0265,.0035,3,8),bark);
      band.position.copy(curve.getPoint(t));band.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),curve.getTangent(t));root.add(band);
    }
    const crown=new T.Group();crown.position.copy(curve.getPoint(1));root.add(crown);
    for(let j=0;j<8;j++) {
      const leaf=new T.Mesh(leafGeometry(height*(.45+(j%3)*.055),height*.065),leafMaterials[(j+k)%3]);
      leaf.rotation.y=j/8*Math.PI*2+k*.7;leaf.rotation.z=.22+(j%2)*.08;leaf.castShadow=true;crown.add(leaf);
    }
    for(let j=0;j<3;j++){const coconut=new T.Mesh(new T.SphereGeometry(.031,8,6),bark);coconut.position.set(Math.sin(j*2.1)*.025,-.025,Math.cos(j*2.1)*.025);crown.add(coconut);}
    palmRoots.push({crown,phase:k*1.7});
  }
  const rockMaterial=new T.MeshStandardMaterial({color:'#818679',roughness:1,flatShading:true});
  for(let i=0;i<18;i++) {
    const a=i*2.39996, r=.20+(i%4)*.10, x=Math.cos(a)*r, z=Math.sin(a)*r-.10;
    if(Math.hypot(x,z)>.53)continue;
    const rock=new T.Mesh(new T.IcosahedronGeometry(.030+(i%3)*.022,0),rockMaterial);
    rock.position.set(x,terrainHeight(x,z)+.012,z);rock.scale.set(1.3,.7+(i%2)*.4,1);rock.rotation.set(i*.4,i*1.1,i*.8);rock.castShadow=true;island.add(rock);
  }
  // Lightweight grass clusters, confined to the exposed inner cap.
  const grassPositions=[];
  for(let i=0;i<260;i++) {
    const a=i*2.39996,r=Math.sqrt((i+.5)/260)*.51,x=Math.cos(a)*r,z=Math.sin(a)*r;
    const y=terrainHeight(x,z),h=.018+(i%5)*.004,w=.008;
    grassPositions.push(x-w,y,z,x+w,y,z,x+.006,y+h,z-.004);
    grassPositions.push(x,y,z-w,x,y,z+w,x-.004,y+h*.9,z+.002);
  }
  const grassGeometry=new T.BufferGeometry();grassGeometry.setAttribute('position',new T.Float32BufferAttribute(grassPositions,3));grassGeometry.computeVertexNormals();
  island.add(new T.Mesh(grassGeometry,leafMaterials[2]));
  return {group:island,update(time){for(const {crown,phase} of palmRoots){crown.rotation.z=Math.sin(time*.75+phase)*.032;crown.rotation.x=Math.sin(time*.55+phase)*.022;}}};
}
