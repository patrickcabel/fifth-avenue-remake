(() => {
  const text=document.querySelector('#pickup-status-text'),button=document.querySelector('#toggle-pickup');
  let status,busy=false;
  function render() {text.textContent=status?(status.paused?'Pickup orders paused · existing orders can still be completed':'Pickup orders open'):'Pickup status unavailable';button.textContent=status?.paused?'Resume pickup orders':'Pause pickup orders';button.disabled=busy||!status;}
  async function refresh() {
    const r=await fetch('/api/pickup-status',{signal:AbortSignal.timeout(8000)});
    if(!r.ok) throw Error('Pickup status unavailable.');
    status=await r.json();render();
    window.dispatchEvent(new CustomEvent('pickup-status',{detail:status}));
  }
  button.addEventListener('click',async()=>{
    if(busy||!status)return;
    busy=true;render();
    try {
      const r=await fetch('/api/pickup-status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({paused:!status.paused,revision:status.revision}),signal:AbortSignal.timeout(8000)});
      if(!r.ok) {const body=await r.json();throw Error(body.error);}
      await refresh();
    } catch(e) {text.textContent=e.message;status=null;}
    finally {busy=false;render();}
  });
  const updatePickup=()=>refresh().catch(()=>{status=null;render();});
  window.addEventListener('service-connected',updatePickup);
  window.addEventListener('service-changed',updatePickup);
  window.addEventListener('service-offline',()=>{status=null;render();});
  refresh().catch(()=>{status=null;render();});
})();
