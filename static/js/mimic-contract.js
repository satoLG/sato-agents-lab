// One declarative tool contract shared with the planner; data never becomes JS.
async function dataFile(name){
 const url=new URL(`../data/${name}.json`,import.meta.url);
 if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');return JSON.parse(await readFile(url,'utf8'));}
 const response=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Mimic contract unavailable');return response.json();
}
const loaded=await Promise.all([dataFile('mimic-capabilities'),dataFile('mimic-presets'),dataFile('mimic-library')]).catch(()=>[{version:0,tools:[],performanceSchema:{}},{},{}]);
export const [MIMIC_CAPABILITIES,MIMIC_PRESETS,MIMIC_LIBRARY]=loaded;

export function matchesSchema(value,schema){
 if(schema.oneOf)return schema.oneOf.filter(option=>matchesSchema(value,option)).length===1;
 if(Object.hasOwn(schema,'const')&&value!==schema.const)return false;
 if(schema.enum&&!schema.enum.includes(value))return false;
 const type=schema.type;
 if(type==='number'||type==='integer'){
  if(typeof value!=='number'||!Number.isFinite(value)||type==='integer'&&!Number.isInteger(value))return false;
  return (schema.minimum===undefined||value>=schema.minimum)&&(schema.maximum===undefined||value<=schema.maximum);
 }
 if(type==='string')return typeof value==='string'&&value.length>=(schema.minLength||0)&&value.length<=(schema.maxLength??Infinity)&&(!schema.pattern||new RegExp(schema.pattern).test(value));
 if(type==='array')return Array.isArray(value)&&value.length>=(schema.minItems||0)&&value.length<=(schema.maxItems??Infinity)&&value.every(item=>matchesSchema(item,schema.items));
 if(type==='object')return !!value&&typeof value==='object'&&!Array.isArray(value)&&(schema.required||[]).every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>Object.hasOwn(schema.properties,key)?matchesSchema(value[key],schema.properties[key]):schema.additionalProperties!==false);
 return true;
}

export function validMimicPlan(plan){
 if(!plan||MIMIC_CAPABILITIES.version!==1||!matchesSchema(plan,MIMIC_CAPABILITIES.performanceSchema))return false;
 if(plan.frames[0].at!==0||plan.frames.at(-1).at!==1)return false;
 for(const shapes of plan.drawings)for(const shape of shapes){
  if(shape.type==='line'&&(shape.points[1]>19||shape.points[3]>19))return false;
  if(shape.center&&shape.center[1]>19)return false;
 }
 for(const [i,frame]of plan.frames.entries()){
  if(i&&frame.at-plan.frames[i-1].at<.049999)return false;
  for(const call of frame.calls){
   const args=call.arguments;
   if(call.name==='visor_draw'&&args.drawing>=plan.drawings.length)return false;
   if(call.name==='arm_pose'&&(args.position&&Math.hypot(...args.position)<.1||args.aim&&Math.hypot(...args.aim)<.1))return false;
  }
 }
 return true;
}

export const neutralArm=side=>({position:[side,-.25,.15],aim:[0,-1,0],shape:1,length:1,width:1,reach:1,twist:0});
export const neutralBody=()=>({lift:0,pitch:0,yaw:0,roll:0});
export function compileMimicPlan(plan){
 if(!validMimicPlan(plan))throw new Error('Invalid mimic performance');
 const state={drawing:-1,arms:[neutralArm(-1),neutralArm(1)],body:neutralBody()};
 const frames=plan.frames.map(frame=>{
  for(const {name,arguments:args}of frame.calls){
   if(name==='visor_draw')state.drawing=args.drawing;
   else if(name==='body_pose')state.body={...state.body,...args};
   else if(name==='arm_pose'){const {side,...pose}=args;const index=side==='left'?0:1;state.arms[index]={...state.arms[index],...pose};}
  }
  return {at:frame.at,...structuredClone(state)};
 });
 return {...plan,frames};
}
