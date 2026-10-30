document.querySelector('#demo-access-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,button=form.querySelector('button'),error=document.querySelector('#demo-access-error');
  button.disabled=true;error.textContent='';
  try{
    const r=await fetch('/demo/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:form.elements.password.value}),signal:AbortSignal.timeout(15000)});
    const body=await r.json();if(!r.ok)throw Error(body.error || 'Could not unlock the demo.');
    form.elements.password.value='';location.replace('/login.html');
  }catch(e){error.textContent=e.message;}finally{button.disabled=false;}
});
