(() => {
  const $=s=>document.querySelector(s);
  const SNOOZE='fifth-alert-snooze-until',LAST='fifth-alert-last-chime',SEEN='fifth-alert-notified',CHIME='fifth-alert-chime-enabled';
  let requests=[],connected=false,hydrated=false,previous=new Set(),audio,sound=true,snoozeUntil=0;
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Alerts still work in this tab without browser storage. */}}
  snoozeUntil=Number(read(SNOOZE,0))||0;
  sound=read(CHIME,true)!==false;
  let lastChime=0;
  const pending=()=>requests.filter(r=>r.status==='pending');
  const notificationSupported=()=>typeof Notification!=='undefined';
  function render(){
    const count=pending().length,snoozed=Date.now()<snoozeUntil;
    document.title=(count?'('+count+') ':'')+'Service desk · Fifth Avenue Sushi';
    $('#request-alert-banner').hidden=count===0;
    $('#request-alert-count').textContent=count+' request'+(count===1?'':'s')+' waiting for a decision';
    $('#request-alert-status').textContent=!connected?'Disconnected · alerts will resume when the dashboard reconnects.':snoozed?'Alerts snoozed for '+Math.ceil((snoozeUntil-Date.now())/60000)+' more minute(s).':sound?(audio?.state==='running'?'Chime on · repeats every 30 seconds while requests wait.':'Chime is on. Click or press a key in the dashboard to activate browser audio.'):'Chime muted.';
    $('#sound').textContent=sound?'Chime on · Mute':'Chime muted · Enable';
    $('#sound').setAttribute('aria-pressed',String(sound));
    $('#snooze-alerts').textContent=snoozed?'Resume alerts':'Snooze 5 min';
    const button=$('#enable-notifications');
    button.disabled=!notificationSupported()||Notification.permission==='denied'||Notification.permission==='granted';
    button.textContent=!notificationSupported()?'Notifications unavailable':Notification.permission==='granted'?'Notifications enabled':Notification.permission==='denied'?'Notifications blocked':'Enable browser notifications';
  }
  function play(force=false){
    if(!sound||!audio||!connected||!pending().length||Date.now()<snoozeUntil)return;
    const perform=async()=>{
      const now=Date.now(),last=Math.max(lastChime,Number(read(LAST,0))||0);
      if(now-last<(force?2000:30000))return;
      try{
        if(audio.state!=='running')return;
        lastChime=now;write(LAST,now);
        [660,880].forEach((frequency,index)=>{
          const tone=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime+index*.22;
          tone.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.12,start+.02);gain.gain.exponentialRampToValueAtTime(.001,start+.5);
          tone.connect(gain);gain.connect(audio.destination);tone.start(start);tone.stop(start+.55);
        });
      }catch{$('#request-alert-status').textContent='Could not play audio. Try enabling chime again.';}
    };
    if(navigator.locks)navigator.locks.request('fifth-request-chime',{ifAvailable:true},lock=>lock?perform():undefined).catch(()=>{});
    else perform();
  }
  function notifyNew(added){
    if(!connected||Date.now()<snoozeUntil||!notificationSupported()||Notification.permission!=='granted')return;
    const seen=read(SEEN,[]);
    const known=new Set(Array.isArray(seen)?seen:[]);
    for(const r of added){
      if(known.has(r.id))continue;
      known.add(r.id);
      try{
        const notification=new Notification('Fifth Avenue · New '+(r.type==='reservation'?'reservation request':'pickup order'),{body:'A new request is waiting for restaurant review.',tag:'fifth-'+r.id});
        notification.onclick=()=>{window.focus();window.dispatchEvent(new Event('review-requests'));notification.close();};
      }catch{/* Notification support varies by browser and device. */ }
    }
    write(SEEN,[...known].slice(-300));
  }
  window.addEventListener('service-data',event=>{
    const incoming=event.detail.requests;
    const added=hydrated?incoming.filter(r=>r.status==='pending'&&!previous.has(r.id)):[];
    requests=incoming;connected=event.detail.connected;
    if(connected){previous=new Set(incoming.map(r=>r.id));hydrated=true;}
    render();
    if(added.length){play(true);notifyNew(added);}
  });
  function createAudio(){
    audio ||= new(window.AudioContext||window.webkitAudioContext)();
    audio.onstatechange=render;
  }
  async function unlockAudio(){
    if(!sound)return;
    try{createAudio();await audio.resume();render();play(true);}
    catch{$('#notice').textContent='Audio is unavailable in this browser.';}
  }
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,e=>{
    if(e.target?.closest?.('#sound')||!sound||audio?.state==='running')return;
    unlockAudio();
  },{capture:true});
  $('#sound').addEventListener('click',async()=>{
    sound=!sound;write(CHIME,sound);render();if(sound)await unlockAudio();
  });
  $('#snooze-alerts').addEventListener('click',()=>{
    snoozeUntil=Date.now()<snoozeUntil?0:Date.now()+5*60000;write(SNOOZE,snoozeUntil);render();if(!snoozeUntil)play(true);
  });
  $('#review-requests').addEventListener('click',()=>window.dispatchEvent(new Event('review-requests')));
  $('#enable-notifications').addEventListener('click',async()=>{
    if(!notificationSupported())return;
    try{await Notification.requestPermission();render();}catch{$('#notice').textContent='Browser notifications could not be enabled.';}
  });
  window.addEventListener('storage',event=>{
    if(event.key===SNOOZE)snoozeUntil=Number(read(SNOOZE,0))||0;
    if(event.key===CHIME)sound=read(CHIME,true)!==false;
    if(event.key===SNOOZE||event.key===CHIME)render();
  });
  setInterval(()=>{render();play();},5000);
  if(sound)try{createAudio();}catch{/* The first staff interaction can retry audio activation. */}
  render();
})();
