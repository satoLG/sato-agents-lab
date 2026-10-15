import * as T from '../vendor/three.module.min.js';

export const ORB_MOTOR={speed:.58,gravity:4.8,jump:1.48,doubleJump:1.30,radius:.085,height:.30,step:.055};
const FIXED=1/120;

export function createOrbMotor(surface,{onEvent=()=>{}}={}) {
  const up=new T.Vector3(0,1,0),heading=new T.Vector3(0,0,1),velocity=new T.Vector3(),position=new T.Vector3();
  let support=surface.sample(up),radius=support.radius,verticalSpeed=0,grounded=true,jumps=0,accumulator=0,coyote=.08,airTime=0,travel=0,foot=0;
  const turn=new T.Quaternion(),nextUp=new T.Vector3(),travelDirection=new T.Vector3(),probe=new T.Vector3();
  function sync(){position.copy(up).multiplyScalar(radius);}
  function event(type,extra={}) {
    const right=new T.Vector3().crossVectors(up,heading).normalize(),point=position.clone();
    if(type==='step')point.addScaledVector(right,(foot++%2?1:-1)*.035).addScaledVector(heading,.012);
    const contact=type==='step'?surface.sample(point.clone().normalize()):support;
    const waterDepth=Math.max(0,contact.waterRadius-point.length()),wet=waterDepth>.008;
    onEvent({type,surface:wet?'water':contact.groundSurface??contact.surface,groundSurface:contact.groundSurface,waterDepth,waterRadius:contact.waterRadius,point:type==='step'?contact.point.clone():point,up:up.clone(),normal:contact.normal.clone(),heading:heading.clone(),speed:velocity.length(),...extra});
  }
  function jump() {
    if(!grounded&&jumps>=2)return false;
    if(grounded||coyote>0){jumps=1;verticalSpeed=ORB_MOTOR.jump;}
    else{jumps++;verticalSpeed=ORB_MOTOR.doubleJump;}
    grounded=false;coyote=0;airTime=0;event('jump',{double:jumps===2});return true;
  }
  function step(dt,time,direction,amount) {
    support=surface.sample(up,time);
    const desired=direction.clone().addScaledVector(up,-direction.dot(up));
    if(desired.lengthSq()>1e-8)desired.normalize();desired.multiplyScalar(ORB_MOTOR.speed*amount);
    velocity.lerp(desired,1-Math.exp(-(grounded?18:7)*dt));velocity.addScaledVector(up,-velocity.dot(up));
    if(velocity.lengthSq()<1e-8)velocity.set(0,0,0);
    const speed=velocity.length();
    if(speed>.0001) {
      travelDirection.copy(velocity).divideScalar(speed);
      const angle=speed*dt/radius;nextUp.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(travelDirection,Math.sin(angle)).normalize();
      let next=surface.sample(nextUp,time),blocked=false;
      // A leading capsule probe prevents the body entering a stone's side.
      // A jump can clear that side once its feet are above the actual mesh.
      probe.copy(nextUp).addScaledVector(travelDirection,ORB_MOTOR.radius/radius).normalize();
      const ahead=surface.sample(probe,time);
      if(ahead.groundSurface==='rock'&&ahead.radius>radius+ORB_MOTOR.step&&ahead.radius>support.radius+ORB_MOTOR.step)blocked=true;
      if(next.radius>radius+ORB_MOTOR.step&&next.radius>support.radius+ORB_MOTOR.step)blocked=true;
      if(surface.blockedByTrunk?.(nextUp.clone().multiplyScalar(radius),ORB_MOTOR.radius,ORB_MOTOR.height))blocked=true;
      if(!blocked) {
        turn.setFromUnitVectors(up,nextUp);up.copy(nextUp);heading.applyQuaternion(turn);velocity.applyQuaternion(turn);
        heading.lerp(travelDirection,1-Math.exp(-18*dt)).addScaledVector(up,-heading.dot(up)).normalize();
        support=next;travel+=speed*dt;
      } else velocity.multiplyScalar(.3);
    }
    if(grounded&&verticalSpeed<=0&&radius-support.radius<.06)radius=support.radius;
    else {
      grounded=false;verticalSpeed-=ORB_MOTOR.gravity*dt;radius+=verticalSpeed*dt;airTime+=dt;
      if(radius<=support.radius&&verticalSpeed<=0) {
        const impact=-verticalSpeed;radius=support.radius;grounded=true;verticalSpeed=0;jumps=0;
        sync();if(airTime>.075&&impact>.25)event('land',{impact});airTime=0;
      }
    }
    coyote=grounded?.08:Math.max(0,coyote-dt);
    if(!grounded&&jumps===0&&coyote===0)jumps=1;
    sync();
    if(grounded&&travel>=.095&&speed>.025){travel%=.095;event('step');}
    if(!grounded)travel=0;
  }
  sync();
  return {
    position,up,heading,velocity,jump,
    get waterDepth(){return Math.max(0,support.waterRadius-radius);},get grounded(){return grounded;},get verticalSpeed(){return verticalSpeed;},get jumps(){return jumps;},get support(){return support;},
    update(dt,{direction=new T.Vector3(),amount=0,time=0}={}) {
      accumulator+=Math.min(.05,Math.max(0,dt));
      while(accumulator>=FIXED){step(FIXED,time,direction,amount);accumulator-=FIXED;}
    },
    stop(){velocity.set(0,0,0);travel=0;},
    place(direction) {up.copy(direction).normalize();heading.set(0,0,1).addScaledVector(up,-up.z);if(heading.lengthSq()<.01)heading.set(1,0,0);heading.normalize();support=surface.sample(up);radius=support.radius;verticalSpeed=0;grounded=true;jumps=0;accumulator=0;velocity.set(0,0,0);sync();},
  };
}
