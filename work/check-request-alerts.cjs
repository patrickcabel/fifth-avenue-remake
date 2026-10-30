const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
async function run(){
  const elements=new Map(),handlers={},storage=new Map(),notifications=[];let now=1000000,tick,tones=0;
  const el=s=>{if(!elements.has(s))elements.set(s,{textContent:'',hidden:false,disabled:false,events:{},addEventListener(n,fn){this.events[n]=fn;},setAttribute(){}});return elements.get(s);};
  class Audio{constructor(){this.state='running';this.currentTime=0;this.destination={};}async resume(){}createOscillator(){tones++;return {frequency:{},connect(){},start(){},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}}
  class Notice{static permission='granted';constructor(title,options){notifications.push({title,options});}close(){}static async requestPermission(){return this.permission;}}
  const context={document:{title:'',querySelector:el,addEventListener:(n,fn)=>(handlers[n]??=[]).push(fn)},window:{AudioContext:Audio,addEventListener:(n,fn)=>(handlers[n]??=[]).push(fn),dispatchEvent:e=>(handlers[e.type]||[]).forEach(fn=>fn(e)),focus(){}},navigator:{},Notification:Notice,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},Date:{now:()=>now},Event:class{constructor(type){this.type=type;}},setInterval:fn=>tick=fn,console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../request-alerts.js'),'utf8'),context);
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const data=(requests,connected=true)=>(handlers['service-data']||[]).forEach(fn=>fn({detail:{requests,connected}}));
  data([]);assert.equal(el('#sound').textContent,'Chime on · Mute');
  data([{id:'one',type:'order',status:'pending',name:'Private customer',phone:'4035550101'}]);await settle();
  assert.equal(tones,2);assert.equal(notifications.length,1);assert.ok(!JSON.stringify(notifications).includes('Private customer'));
  assert.equal(el('#request-alert-banner').hidden,false);assert.match(context.document.title,/\(1\)/);
  now+=10000;tick();await settle();assert.equal(tones,2);
  now+=21000;tick();await settle();assert.equal(tones,4);
  el('#snooze-alerts').events.click();now+=31000;tick();await settle();assert.equal(tones,4);
  data([{id:'one',type:'order',status:'pending'},{id:'two',type:'reservation',status:'pending'}]);await settle();assert.equal(notifications.length,1);
  now+=5*60000;tick();await settle();assert.equal(tones,6);
  data([{id:'one',type:'order',status:'accepted'},{id:'two',type:'reservation',status:'confirmed'}]);now+=31000;tick();await settle();
  assert.equal(tones,6);assert.equal(el('#request-alert-banner').hidden,true);
  data([{id:'three',type:'reservation',status:'pending'}],false);now+=31000;tick();await settle();assert.equal(tones,6);
  data([{id:'three',type:'reservation',status:'pending'}],true);await settle();assert.equal(tones,8);
  await el('#sound').events.click();now+=31000;tick();await settle();assert.equal(tones,8);
  assert.equal(JSON.parse(storage.get('fifth-alert-chime-enabled')),false);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../request-alerts.js'),'utf8'),context);
  assert.equal(el('#sound').textContent,'Chime muted · Enable');
  storage.delete('fifth-alert-chime-enabled');storage.delete('fifth-alert-last-chime');
  class LockedAudio extends Audio{constructor(){super();this.state='suspended';}async resume(){this.state='running';}}
  const lockedContext={...context,window:{...context.window,AudioContext:LockedAudio}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../request-alerts.js'),'utf8'),lockedContext);
  data([{id:'locked-audio',type:'order',status:'pending'}]);
  const beforeUnlock=tones;tick();await settle();assert.equal(tones,beforeUnlock);
  for(const listener of handlers.pointerdown)listener({target:{closest:()=>null}});
  await settle();assert.equal(tones,beforeUnlock+2);
  console.log('PASS: default-on chime, remembered mute, incoming chime, 30-second repeat, snooze expiry, acceptance stop, disconnected silence, mute and notification privacy');
}
module.exports=run();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1;});
