/* One short, non-overlapping request serves every dashboard component. */
(() => {
  let online=false,revision,sourceRevision,timer,busy=false;
  function emit(name){window.dispatchEvent(new Event(name));}
  async function poll(){
    if(busy)return;
    busy=true;
    try{
      const response=await fetch('/api/updates',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(response.status===401){location.replace('/login.html');return;}
      if(!response.ok)throw Error('Live updates unavailable.');
      const state=await response.json();
      if(sourceRevision!==undefined && state.sourceRevision!==sourceRevision && state.boot===revision?.boot){location.reload();return;}
      sourceRevision=state.sourceRevision;
      const changed=revision && (state.boot!==revision.boot || state.revision!==revision.value);
      revision={boot:state.boot,value:state.revision};
      if(!online){online=true;emit('service-connected');}
      else if(changed)emit('service-changed');
    }catch{
      if(online){online=false;emit('service-offline');}
    }finally{
      busy=false;clearTimeout(timer);timer=setTimeout(poll,document.hidden?10000:2000);
    }
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){clearTimeout(timer);poll();}});
  window.addEventListener('pagehide',()=>clearTimeout(timer));
  poll();
})();
