(() => {
  const $=s=>document.querySelector(s),form=$('#reservation-settings-form');
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let revision=0,busy=false;
  $('#reservation-hours').innerHTML=days.map((day,i)=>'<div class="hours-row"><strong>'+day+'</strong><label><span class="sr-only">'+day+' setting</span><select name="mode'+i+'"><option value="unknown">Not configured</option><option value="open">Set hours</option><option value="closed">Closed</option></select></label><label><span class="sr-only">'+day+' opening</span><input type="time" name="open'+i+'" disabled></label><span>to</span><label><span class="sr-only">'+day+' closing</span><input type="time" name="close'+i+'" disabled></label></div>').join('');
  function syncHours(){for(let i=0;i<7;i++){const open=form.elements['mode'+i].value==='open';for(const field of ['open','close']){form.elements[field+i].disabled=!open;form.elements[field+i].required=open;}}}
  form.addEventListener('change',syncHours);
  $('#use-restaurant-hours').addEventListener('click',()=>{
    window.reservationDefaultHours().forEach((day,i)=>{form.elements['mode'+i].value='open';form.elements['open'+i].value=day.open;form.elements['close'+i].value=day.close;});
    syncHours();$('#reservation-settings-error').textContent='Restaurant hours loaded. Save settings to apply.';
  });
  $('#reservation-settings-button').addEventListener('click',async()=>{
    $('#reservation-settings-dialog').showModal();$('#reservation-settings-error').textContent='Loading…';
    form.querySelector('button[type=submit]').disabled=true;
    try{
      const response=await fetch('/api/reservation-rules',{signal:AbortSignal.timeout(8000)});
      if(response.status===401){location.replace('/login.html');return;}
      if(!response.ok)throw Error('Could not load reservation settings.');
      const rules=await response.json();revision=rules.revision;
      form.elements.totalTables.value=rules.totalTables??'';form.elements.walkInTables.value=rules.walkInTables??'';
      rules.hours.forEach((day,i)=>{form.elements['mode'+i].value=day===null?'unknown':day.closed?'closed':'open';form.elements['open'+i].value=day?.open||'';form.elements['close'+i].value=day?.close||'';});
      syncHours();$('#reservation-settings-error').textContent='';form.querySelector('button[type=submit]').disabled=false;
    }catch(e){$('#reservation-settings-error').textContent=['TimeoutError','AbortError'].includes(e.name)?'The settings request timed out. Check the backend connection, then close and reopen this window.':e.message;}
  });
  $('#close-reservation-settings').addEventListener('click',()=>{if(!busy)$('#reservation-settings-dialog').close();});
  $('#reservation-settings-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    const data=new FormData(form);
    const hours=days.map((_,i)=>data.get('mode'+i)==='unknown'?null:data.get('mode'+i)==='closed'?{closed:true}:{closed:false,open:data.get('open'+i),close:data.get('close'+i)});
    const payload={revision,totalTables:data.get('totalTables')===''?null:Number(data.get('totalTables')),walkInTables:data.get('walkInTables')===''?null:Number(data.get('walkInTables')),durationMinutes:120,noShowMinutes:15,hours};
    busy=true;const controls=[...form.querySelectorAll('input,select,button')];controls.forEach(el=>el.disabled=true);
    try{
      const response=await fetch('/api/reservation-rules',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
      if(response.status===401){location.replace('/login.html');return;}
      const result=await response.json();if(!response.ok)throw Error(result.error || 'Settings could not be saved.');
      revision=result.revision;$('#reservation-settings-dialog').close();window.dispatchEvent(new Event('reservation-created'));
    }catch(error){$('#reservation-settings-error').textContent=['TimeoutError','AbortError'].includes(error.name)?'The save request timed out. Reopen settings to check whether the changes were saved before retrying.':error.message;}
    finally{busy=false;controls.forEach(el=>el.disabled=false);syncHours();}
  });
})();
