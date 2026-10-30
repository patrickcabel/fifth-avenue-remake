(() => {
  const button=document.querySelector('#staff-logout');
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Could not sign out. Please try again.');
      location.replace('/login.html');
    }catch(e){document.querySelector('#notice').textContent=e.message;button.disabled=false;}
  });
  async function check(){
    try{const r=await fetch('/api/auth/status',{signal:AbortSignal.timeout(8000)});if(!r.ok)return;const state=await r.json();if(state.demoMode)document.querySelector('.demo-banner span').textContent='Hosted demo · Use fictional customer details. Records may reset on restart.';if(!state.authenticated){location.replace('/login.html');return;}document.querySelector('#staff-accounts-button').hidden=state.role!=='manager';document.querySelector('#staff-identity').textContent=state.username+(state.code?' · '+state.code:'');}
    catch{/* The dashboard shows its disconnected state if the backend is offline. */}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  setInterval(check,60000);
  check();
})();
