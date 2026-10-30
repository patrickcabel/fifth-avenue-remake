(() => {
  const $=s=>document.querySelector(s),form=$('#staff-account-form');
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let busy=false,resetId=null;
  async function api(url,options={}){
    const response=await fetch(url,{...options,headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
    if(response.status===401){location.replace('/login.html');throw Error('Sign in again.');}
    const body=await response.json();if(!response.ok)throw Error(body.error || 'Could not update staff accounts.');
    return body;
  }
  async function load(){
    const users=await api('/api/staff/accounts');
    $('#staff-accounts-list').innerHTML=users.length?users.map(u=>'<div class="staff-member"><div><strong>'+escape(u.name)+'</strong><small>Code '+escape(u.code)+' · '+escape(u.role)+' · '+(u.active?'Active':'Inactive')+'</small></div><div class="header-controls"><button type="button" class="secondary" data-reset="'+u.id+'">Reset PIN</button><button type="button" class="secondary" data-active="'+u.id+'" data-next="'+(!u.active)+'">'+(u.active?'Deactivate':'Activate')+'</button></div></div>').join(''):'<p class="note">Add your employee-code manager account first. Your previous manager login remains available.</p>';
    form.elements.role.value=users.length?'staff':'manager';
  }
  $('#staff-accounts-button').addEventListener('click',async()=>{
    form.reset();$('#staff-accounts-message').textContent='';$('#staff-pin-form').hidden=true;
    $('#staff-accounts-dialog').showModal();try{await load();}catch(e){$('#staff-accounts-message').textContent=e.message;}
  });
  $('#close-staff-accounts').addEventListener('click',()=>{if(!busy)$('#staff-accounts-dialog').close();});
  $('#staff-accounts-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  async function mutate(url,method,payload){
    if(busy)return false;busy=true;
    const controls=[...$('#staff-accounts-dialog').querySelectorAll('button,input,select')];controls.forEach(el=>el.disabled=true);
    try{await api(url,{method,body:JSON.stringify(payload)});await load();$('#staff-accounts-message').textContent='Staff account saved.';return true;}
    catch(e){$('#staff-accounts-message').textContent=e.message;return false;}
    finally{busy=false;controls.forEach(el=>el.disabled=false);}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(await mutate('/api/staff/accounts','POST',{name:form.elements.staffName.value.trim(),code:form.elements.code.value,pin:form.elements.pin.value,role:form.elements.role.value})){form.elements.staffName.value='';form.elements.code.value='';form.elements.pin.value='';}
  });
  $('#staff-accounts-list').addEventListener('click',async event=>{
    if(busy)return;
    const reset=event.target.closest('[data-reset]'),active=event.target.closest('[data-active]');
    if(reset){resetId=reset.dataset.reset;$('#staff-pin-form').hidden=false;$('#staff-pin-form').reset();$('#staff-pin-form').elements.pin.focus();}
    if(active)await mutate('/api/staff/accounts/'+active.dataset.active,'PATCH',{action:'active',active:active.dataset.next==='true'});
  });
  $('#staff-pin-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(await mutate('/api/staff/accounts/'+resetId,'PATCH',{action:'pin',pin:event.target.elements.pin.value})){event.target.reset();event.target.hidden=true;}
  });
})();
