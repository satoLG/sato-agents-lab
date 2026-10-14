// Water-fill loading and celebration adapted from satoLG/portfolio UI.ts.
export function createOrbLoading({reducedMotion=false}={}) {
  const overlay=document.getElementById('orb-loading'),button=document.getElementById('orb-start');
  const percent=document.getElementById('orb-loading-percent'),progress=document.getElementById('orb-progress'),blur=document.getElementById('orb-blur');
  overlay.hidden=false;overlay.classList.remove('leaving');blur.hidden=false;blur.classList.remove('fade-out');
  button.disabled=true;button.className='';button.style.animation='';button.style.opacity='';button.style.transform='';button.style.setProperty('--fill-level','0%');button.setAttribute('aria-label','Carregando orb');
  let target=0,displayed=0,raf=0,timer=0,stopped=false,resolveReady;
  const start=performance.now(),ready=new Promise(resolve=>{resolveReady=resolve;});
  let lastFrame=start;
  function burst() {
    if(reducedMotion)return;
    const rect=button.getBoundingClientRect(),parent=overlay.getBoundingClientRect();
    for(let i=0;i<14;i++) {
      const angle=Math.PI*2*i/14+(Math.random()-.5)*.5,radius=rect.width/2,distance=30+Math.random()*30,size=5+Math.random()*7;
      const dot=document.createElement('span');dot.className='burst-dot';
      Object.assign(dot.style,{left:rect.left-parent.left+radius+Math.cos(angle)*radius+'px',top:rect.top-parent.top+radius+Math.sin(angle)*radius+'px',width:size+'px',height:size+'px',backgroundColor:['#40a4ff','#2b7cd4','#1a5faa'][i%3]});
      dot.style.setProperty('--dx',Math.cos(angle)*distance+'px');dot.style.setProperty('--dy',Math.sin(angle)*distance+'px');dot.style.setProperty('--dur','750ms');overlay.appendChild(dot);
      setTimeout(()=>dot.remove(),800);
    }
  }
  function animate(now) {
    if(stopped)return;
    const timed=Math.min((now-start)/6000,1);
    const effective=reducedMotion?target:Math.min(target,timed+target*.3);
    // Preserve the original 60 Hz pace without making completion depend on
    // frame count when shader preparation or compositing slows the browser.
    const delta=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
    const increment=reducedMotion?1:Math.max(.21*delta,Math.min(.72*delta,(effective-displayed)*(1-Math.exp(-6*delta))));
    displayed=Math.min(displayed+increment,effective);
    const value=Math.floor(displayed*100);percent.textContent=String(value);progress.setAttribute('aria-valuenow',String(value));
    button.style.setProperty('--fill-level',displayed*105+'%');
    const blurValue=(reducedMotion?0:50*(1-displayed))+'px';blur.style.backdropFilter='blur('+blurValue+')';blur.style.webkitBackdropFilter='blur('+blurValue+')';
    if(displayed>=.99&&target>=1) {
      percent.textContent='100';progress.setAttribute('aria-valuenow','100');button.style.setProperty('--fill-level','105%');
      // Pin the settled pose before removing the animation. Its fill state
      // disappears with animation:none and must never hide the ready button.
      button.style.opacity='1';button.style.transform='scale(1)';button.classList.add('celebrate-bounce');burst();
      timer=setTimeout(()=>{if(stopped)return;button.style.animation='none';button.classList.remove('celebrate-bounce');button.classList.add('loaded');button.disabled=false;button.setAttribute('aria-label','Entrar na orb');resolveReady(true);},reducedMotion?0:600);
    } else raf=requestAnimationFrame(animate);
  }
  raf=requestAnimationFrame(animate);
  return {ready,setProgress(value){target=Math.max(target,Math.min(1,value));},stop(){stopped=true;cancelAnimationFrame(raf);clearTimeout(timer);resolveReady(false);}};
}
