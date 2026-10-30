const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {BackupManager,FILES}=require('../backup-manager.cjs');
const dir=fs.mkdtempSync(path.join(__dirname,'store-test-backups-'));
try{
  const data=path.join(dir,'data'),copies=path.join(dir,'backups');fs.mkdirSync(data);
  const original={
    'requests.json':[{id:'ORD-TEST',type:'order',name:'Test Guest'}],
    'staff-account.json':{username:'staff',salt:'a'.repeat(64),hash:'b'.repeat(128)},
    'menu-availability.json':{},'pickup-settings.json':{paused:true,revision:1},
    'reservation-rules.json':{totalTables:40,walkInTables:10}
  };
  for(const [name,value]of Object.entries(original))fs.writeFileSync(path.join(data,name),JSON.stringify(value));
  fs.writeFileSync(path.join(data,'.env'),'DO_NOT_COPY');
  const manager=new BackupManager(data,copies),now=Date.now();
  const first=manager.due(now);
  assert.ok(first);assert.equal(manager.due(now+1000),null);
  const snapshot=manager.read(first.name);
  assert.equal(Object.keys(snapshot.files).length,5);assert.ok(!JSON.stringify(snapshot).includes('DO_NOT_COPY'));
  assert.throws(()=>manager.read('../requests.json'),/filename/);
  const raw=fs.readFileSync(path.join(copies,first.name),'utf8');
  const tampered=JSON.parse(raw);tampered.files['requests.json'].content='[]';
  fs.writeFileSync(path.join(copies,first.name),JSON.stringify(tampered));
  assert.throws(()=>manager.restore(first.name),/integrity/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data,'requests.json'),'utf8')),original['requests.json']);
  fs.writeFileSync(path.join(copies,first.name),raw);
  fs.writeFileSync(path.join(data,'requests.json'),'[]');
  fs.writeFileSync(path.join(data,'pickup-settings.json'),'{"paused":false}');
  const restored=manager.restore(first.name);
  assert.ok(restored.safetyCopy.startsWith('pre-restore-'));
  for(const [name,value]of Object.entries(original))assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data,name),'utf8')),value);
  assert.equal(manager.read(restored.safetyCopy).files['requests.json'].content,'[]');
  fs.writeFileSync(path.join(data,'requests.json'),'[]');
  const rename=fs.renameSync;let failed=false;
  fs.renameSync=(from,to)=>{if(!failed&&String(from).endsWith('menu-availability.json.restore-tmp')){failed=true;throw Error('Simulated disk error');}return rename(from,to);};
  try{assert.throws(()=>manager.restore(first.name),/original data was restored/);}
  finally{fs.renameSync=rename;}
  assert.equal(fs.readFileSync(path.join(data,'requests.json'),'utf8'),'[]');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data,'staff-account.json'),'utf8')),original['staff-account.json']);
  const second=new BackupManager(data,copies);assert.equal(second.list().length,3);
  assert.ok(second.due(now+3600001));
  const fake=JSON.parse(raw);fake.files['../escape.json']=fake.files['requests.json'];
  fs.writeFileSync(path.join(copies,first.name),JSON.stringify(fake));
  assert.throws(()=>manager.read(first.name),/unsupported file/);fs.writeFileSync(path.join(copies,first.name),raw);
  for(let n=0;n<170;n++)fs.writeFileSync(path.join(copies,'backup-'+(now-10000-n)+'-1234abcd.json'),raw);
  manager.create('backup',now+7200001);
  assert.equal(manager.list().filter(s=>!s.safetyCopy).length,168);
  assert.ok(fs.existsSync(path.join(copies,restored.safetyCopy)));
  assert.equal(FILES.includes('.env'),false);
  assert.throws(()=>new BackupManager(data,data),/separately/);
  console.log('PASS: snapshots, schedule, retention, checksum validation, path rejection, restore, safety copy, settings/account recovery, secret exclusion');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
