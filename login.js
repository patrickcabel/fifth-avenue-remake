(() => {
  const $=s=>document.querySelector(s),form=$('#login-form'),error=$('#login-error'),button=$('#login-submit');
  let setup=false,busy=false,legacy=false,legacyAvailable=false;
  function render(){
    $('#login-heading').textContent=setup?'Create manager code':legacy?'Previous manager login':'Employee sign-in';
    $('#login-description').textContent=setup?'Choose your four-digit employee code and three-digit PIN. You will be the first manager.':legacy?'Use your previous manager account to add employee codes in Staff accounts.':'Enter your four-digit employee code and three-digit PIN.';
    $('#setup-name').hidden=!setup;form.elements.displayName.required=setup;
    $('#employee-fields').hidden=legacy;$('#legacy-fields').hidden=!legacy;
    for(const key of ['code','pin']){form.elements[key].disabled=legacy;form.elements[key].required=!legacy;}
    for(const key of ['username','password']){form.elements[key].disabled=!legacy;form.elements[key].required=legacy;}
    $('#legacy-login').hidden=setup||!legacyAvailable;$('#legacy-login').textContent=legacy?'Use employee code':'Use previous manager login';
    button.textContent=setup?'Create manager & open dashboard':'Sign in';button.disabled=busy;
  }
  async function status(){
    const response=await fetch('/api/auth/status',{signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Unable to connect to the staff backend.');
    const state=await response.json();if(state.authenticated){location.replace('/dashboard.html');return;}
    setup=!state.configured;legacyAvailable=state.legacyLoginAvailable;render();
  }
  $('#legacy-login').addEventListener('click',()=>{legacy=!legacy;error.textContent='';form.elements.pin.value='';form.elements.password.value='';render();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;busy=true;render();error.textContent='';
    const payload=legacy?{username:form.elements.username.value.trim(),password:form.elements.password.value}:{name:form.elements.displayName.value.trim(),code:form.elements.code.value,pin:form.elements.pin.value};
    try{
      const response=await fetch(setup?'/api/auth/setup':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
      const result=await response.json();if(!response.ok){if(response.status===409)await status();throw Error(legacy && response.status===401?'Previous username/password did not match. For your four-digit code and three-digit PIN, select “Use employee code” below.':result.error || 'Could not sign in.');}
      form.elements.password.value='';form.elements.pin.value='';location.replace('/dashboard.html');
    }catch(e){error.textContent=e.message;}
    finally{busy=false;render();}
  });
  status().catch(e=>{error.textContent=e.message;});
})();
