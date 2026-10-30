(() => {
  const $=s=>document.querySelector(s);
  const form=$('#reservation-form'),dialog=$('#reservation-dialog');
  let saving=false,lastSignature='',requestKey='',editing=null;
  $('#new-reservation').addEventListener('click',()=>{
    editing=null;$('#reservation-heading').textContent='New reservation';form.elements.status.closest('label').hidden=false;
    form.reset();$('#reservation-error').textContent='';lastSignature='';requestKey='';
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
    form.elements.date.min=parts.year+'-'+parts.month+'-'+parts.day;
    $('#reservation-capacity').textContent='';dialog.showModal();form.elements.name.focus();
  });
  window.addEventListener('edit-reservation',event=>{
    if(saving)return;
    editing=event.detail;form.reset();$('#reservation-error').textContent='';
    $('#reservation-heading').textContent='Edit reservation';
    for(const key of ['name','phone','date','time','guests','note','tableCount']) form.elements[key].value=editing[key] || (key==='tableCount'?1:'');
    form.elements.status.closest('label').hidden=true;
    form.elements.date.removeAttribute('min');
    $('#reservation-capacity').textContent='';dialog.showModal();form.elements.date.focus();checkCapacity();
  });
  $('#cancel-reservation').addEventListener('click',()=>{if(!saving)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;
    const values=new FormData(form);
    const payload={type:'reservation',source:'staff',name:values.get('name').trim(),phone:values.get('phone').trim(),date:values.get('date'),time:values.get('time'),guests:Number(values.get('guests')),tableCount:Number(values.get('tableCount')),note:values.get('note').trim(),confirmed:values.get('status')==='confirmed'};
    const signature=JSON.stringify(payload);
    if(signature!==lastSignature){lastSignature=signature;requestKey=crypto.randomUUID();}
    saving=true;$('#reservation-error').textContent='';
    const controls=[...form.querySelectorAll('input,select,textarea,button')];controls.forEach(el=>el.disabled=true);
    try{
      const response=await fetch(editing ? '/api/requests/'+editing.id : '/api/requests',{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(editing ? {...payload,action:'edit_reservation',revision:editing.revision} : {...payload,requestKey})});
      const result=await response.json();if(!response.ok)throw Error(result.error || 'Could not save reservation.');
      dialog.close();window.dispatchEvent(new Event('reservation-created'));
      $('#notice').textContent=(editing?'Reservation updated':'Reservation saved')+(result.status==='confirmed'?' · confirmed.':' · pending review.')+' No customer message sent.';
      setTimeout(()=>{$('#notice').textContent='';},6500);
    }catch(error){$('#reservation-error').textContent=error.message+' Your draft is still here.';}
    finally{saving=false;controls.forEach(el=>el.disabled=false);}
  });
  let capacitySequence=0;
  async function checkCapacity(){
    const seq=++capacitySequence;
    if(!form.elements.date.value || !form.elements.time.value)return;
    try{
      const response=await fetch('/api/reservation-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editing?.id,date:form.elements.date.value,time:form.elements.time.value,tableCount:Number(form.elements.tableCount.value)}),signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Capacity check unavailable; confirmation will check again.');
      const check=await response.json();if(seq!==capacitySequence)return;
      if(!check.checked){$('#reservation-capacity').textContent=check.warnings.join(' ');return;}
      $('#reservation-capacity').textContent=(check.reservableTables===null?'Reservation quota not configured.':check.otherTablesAtPeak+' other tables at peak · '+check.requestedTables+' requested · '+check.reservableTables+' bookable.')+' '+check.warnings.join(' ');
    }catch(error){if(seq===capacitySequence)$('#reservation-capacity').textContent=error.message;}
  }
  for(const field of ['date','time','tableCount'])form.elements[field].addEventListener('change',checkCapacity);
})();
