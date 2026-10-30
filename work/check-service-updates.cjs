const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function run(){
  const listeners={},events=[],timers=new Map();let nextId=0,response={boot:'a',revision:0,sourceRevision:0},offline=false,redirect,reloads=0,calls=0;
  const context={
    window:{dispatchEvent:e=>events.push(e.type),addEventListener(){}},
    document:{hidden:false,addEventListener:(name,fn)=>listeners[name]=fn},
    location:{replace:path=>redirect=path,reload:()=>reloads++},
    Event:class{constructor(type){this.type=type;}},
    AbortSignal,
    fetch:async()=>{calls++;if(offline)throw Error('Offline');return {status:response.status || 200,ok:!response.status||response.status===200,json:async()=>response};},
    setTimeout:(fn,delay)=>{const id=++nextId;timers.set(id,{fn,delay});return id;},
    clearTimeout:id=>timers.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service-updates.js'),'utf8'),context);
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const tick=async()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);await timer.fn();await settle();};
  await settle();assert.deepEqual(events,['service-connected']);assert.equal(timers.size,1);
  response={...response,revision:1};await tick();assert.equal(events.at(-1),'service-changed');
  offline=true;await tick();assert.equal(events.at(-1),'service-offline');
  offline=false;await tick();assert.equal(events.at(-1),'service-connected');
  context.document.hidden=true;await tick();assert.equal([...timers.values()][0].delay,10000);
  context.document.hidden=false;response={...response,sourceRevision:1};await tick();assert.equal(reloads,1);
  response={status:401};await tick();assert.equal(redirect,'/login.html');
  assert.ok(calls>=6);
  for(const file of ['dashboard.js','order-entry.js','menu-availability.js','pickup-status.js','service-updates.js'])assert.ok(!fs.readFileSync(path.join(__dirname,'..',file),'utf8').includes('new EventSource'),'Persistent stream remains in '+file);
  const server=fs.readFileSync(path.join(__dirname,'preview.cjs'),'utf8');
  assert.ok(!server.includes('<script>new EventSource'));
  console.log('PASS: shared updates, reconnect/offline, background polling, source reload, expired login, removal of persistent browser connections');
}
module.exports=run();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1;});
