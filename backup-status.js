(() => {
  const $=s=>document.querySelector(s);
  let busy=false;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function load(){
    const response=await fetch('/api/backups',{signal:AbortSignal.timeout(10000)});
    if(response.status===401){location.replace('/login.html');return;}
    if(!response.ok)throw Error('Could not load backup status.');
    const status=await response.json();
    const local=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',dateStyle:'medium',timeStyle:'short'}).format(new Date(date));
    $('#backup-status').textContent=status.lastError || (status.latestBackupAt?'Latest backup: '+local(status.latestBackupAt)+' Calgary time.':'No backup yet. Create the first copy now.');
    $('#backup-list').innerHTML=status.snapshots.length?status.snapshots.map(s=>'<div class="backup-row"><div><strong>'+escape(local(s.createdAt))+(s.safetyCopy?' · restore safety copy':'')+'</strong><small><code>'+escape(s.name)+'</code></small></div><span>'+Math.max(1,Math.round(s.bytes/1024))+' KB</span></div>').join(''):'<p class="note">No snapshots saved yet.</p>';
  }
  $('#backup-button').addEventListener('click',async()=>{
    $('#backup-dialog').showModal();$('#backup-status').textContent='Loading…';
    try{await load();}catch(e){$('#backup-status').textContent=e.message;}
  });
  $('#close-backups').addEventListener('click',()=>{if(!busy)$('#backup-dialog').close();});
  $('#backup-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('#backup-now').addEventListener('click',async()=>{
    if(busy)return;busy=true;$('#backup-now').disabled=true;$('#backup-status').textContent='Saving backup…';
    try{
      const response=await fetch('/api/backups',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if(response.status===401){location.replace('/login.html');return;}
      const result=await response.json();if(!response.ok)throw Error(result.error || 'Could not create backup.');
      await load();
    }catch(e){$('#backup-status').textContent=e.message;}
    finally{busy=false;$('#backup-now').disabled=false;}
  });
})();
