// Measure the real wrapping before animating: clipped letters must never type.
export function fitChatPreview(body,text){
 const width=body.clientWidth,style=getComputedStyle(body);
 const lines=parseInt(style.webkitLineClamp),lineHeight=parseFloat(style.lineHeight);
 if(!width||!lines||!lineHeight)return text;
 const height=Math.min(lines*lineHeight,parseFloat(style.maxHeight)||Infinity);
 const probe=body.cloneNode(false);probe.removeAttribute('id');probe.removeAttribute('tabindex');probe.removeAttribute('data-typing');probe.setAttribute('aria-hidden','true');
 Object.assign(probe.style,{position:'fixed',left:'-10000px',top:'0',visibility:'hidden',pointerEvents:'none',display:'block',width:`${width}px`,height:'auto',minHeight:'0',maxHeight:'none',webkitLineClamp:'unset',margin:'0',transform:'none'});
 body.parentElement.append(probe);
 const fits=value=>{probe.textContent=value;return probe.getBoundingClientRect().height<=height+.5;};
 try{
  if(fits(text))return text;
  const chars=Array.from(text);let low=0,high=chars.length;
  while(low<high){const middle=Math.ceil((low+high)/2);if(fits(chars.slice(0,middle).join('').trimEnd()+'…'))low=middle;else high=middle-1;}
  return chars.slice(0,low).join('').trimEnd()+'…';
 }finally{probe.remove();}
}
