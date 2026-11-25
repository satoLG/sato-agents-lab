// Login do site (ADR 0010): mesma senha e mesmo endpoint do chat privado.
const form=document.getElementById('login-form');
const error=document.getElementById('login-error');
const password=document.getElementById('login-password');

// O servidor já validou `next`; ainda assim só seguimos caminhos do próprio site.
function destination(){
 const next=form.dataset.next||'/dashboard';
 const safe=next.startsWith('/')&&!next.startsWith('//')&&!next.includes('\\')?next:'/dashboard';
 return safe+(location.hash&&!safe.includes('#')?location.hash:'');
}

function show(message){error.textContent=message;error.hidden=false;password.focus();}

form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!password.value){show('Digite a senha.');return;}
 const button=form.querySelector('button');button.disabled=true;error.hidden=true;
 try{
  const response=await fetch('/api/lab/hermes-chat/login',{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password.value}),signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>({}));
  if(response.ok&&data.authenticated){location.replace(destination());return;}
  show(data.error||'Não foi possível entrar.');
 }catch{show('Não foi possível entrar. Tente novamente.');}
 finally{button.disabled=false;}
});
password.focus();
