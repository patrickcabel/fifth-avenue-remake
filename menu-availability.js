(() => {
  const $=s=>document.querySelector(s);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let items=[], busy=false, online=false;
  function render() {
    const query=$('#availability-search').value.trim().toLowerCase();
    const sold=items.filter(i=>!i.available).length;
    $('#availability-summary').textContent=(items.length-sold)+' available · '+sold+' sold out';
    const matches=items.filter(i=>(i.name+' '+i.category).toLowerCase().includes(query) && (!$('#sold-out-only').checked || !i.available));
    $('#availability-list').innerHTML=matches.length ? matches.map(i=>'<div class="dish"><div><small>'+escape(i.category)+'</small><strong>'+escape(i.name)+'</strong><span class="'+(!i.available?'sold-out-text':'')+'">'+(i.available?'Available':'Sold out')+'</span></div><button type="button" class="secondary" data-menu-id="'+i.id+'" '+(busy||!online?'disabled':'')+' aria-label="'+(i.available?'Mark sold out: ':'Make available: ')+escape(i.name)+'">'+(i.available?'Mark sold out':'Make available')+'</button></div>').join('') : '<p class="note">No matching dishes.</p>';
  }
  async function load() {
    const response=await fetch('/api/staff/menu',{signal:AbortSignal.timeout(8000)});
    if(!response.ok) throw Error('Could not load menu. Check the backend connection.');
    items=await response.json(); online=true; render();
  }
  $('#manage-menu').addEventListener('click',async()=>{
    $('#menu-dialog').showModal(); $('#availability-message').textContent='Loading menu…';
    try { await load(); $('#availability-message').textContent=''; }
    catch(e) { online=false; render(); $('#availability-message').textContent=e.message; }
  });
  $('#close-menu').addEventListener('click',()=>$('#menu-dialog').close());
  $('#availability-search').addEventListener('input',render);
  $('#sold-out-only').addEventListener('change',render);
  $('#availability-list').addEventListener('click',async event=>{
    const button=event.target.closest('[data-menu-id]'); if(!button || busy || !online) return;
    const item=items.find(i=>i.id===button.dataset.menuId); if(!item) return;
    busy=true; render(); $('#availability-message').textContent='Saving…';
    try {
      const response=await fetch('/api/staff/menu/'+item.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:item.revision,available:!item.available}),signal:AbortSignal.timeout(8000)});
      const body=await response.json(); if(!response.ok) throw Error(body.error);
      $('#availability-message').textContent=item.name+(body.available?' is available again.':' is marked sold out.');
      await load();
    } catch(e) { $('#availability-message').textContent=e.message; try { await load(); } catch { online=false; } }
    finally { busy=false; render(); }
  });
  const updateMenu=()=>{if($('#menu-dialog').open)load().catch(()=>{online=false;render();});};
  window.addEventListener('service-connected',updateMenu);
  window.addEventListener('service-changed',updateMenu);
  window.addEventListener('service-offline',()=>{online=false;render();});
})();
