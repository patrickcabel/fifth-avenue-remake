const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{Readable}=require('node:stream'),{createRequire}=require('node:module');
const {StaffAuth,LIFETIME}=require('../staff-auth.cjs');
const dir=fs.mkdtempSync(path.join(__dirname,'store-test-auth-'));
async function run(){
  const file=path.join(dir,'unit-account.json'),auth=new StaffAuth(file);
  assert.throws(()=>auth.setup('staff','short'),/12/);
  auth.setup('staff','test-password-12345');
  assert.ok(!fs.readFileSync(file,'utf8').includes('test-password-12345'));
  assert.throws(()=>auth.setup('other','another-password-123'),/already exists/);
  const token=auth.login('staff','test-password-12345','unit',1000),cookie=auth.cookie(token);
  assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Strict'));
  assert.equal(auth.session(cookie,1001).username,'staff');
  assert.equal(auth.session(cookie,1000+LIFETIME),null);
  for(let n=0;n<5;n++)assert.throws(()=>auth.login('staff','wrong','limited',1000),/incorrect/);
  assert.throws(()=>auth.login('staff','test-password-12345','limited',1001),/Too many/);
  assert.ok(auth.login('staff','test-password-12345','limited',1000+16*60000));
  const persisted=new StaffAuth(file);
  assert.equal(persisted.session(cookie),null);
  const fresh=persisted.login('staff','test-password-12345');
  assert.ok(persisted.session(persisted.cookie(fresh)));
  persisted.logout(persisted.cookie(fresh));assert.equal(persisted.session(persisted.cookie(fresh)),null);

  // Exercise the actual server route handler without binding a local port.
  let handler;
  const reqFromPreview=createRequire(path.join(__dirname,'preview.cjs'));
  const sandbox={
    require(name){
      if(name==='node:http')return {createServer(fn){handler=fn;return {listen(){}};}};
      if(name==='node:fs')return {...fs,watch(){return {close(){}};}};
      if(name==='../vapi-webhook.cjs')return {createWebhookServer(){return {listen(){}};}};
      return reqFromPreview(name);
    },
    __dirname,console,Buffer,setInterval:()=>({unref(){}}),clearInterval:()=>{},
    process:{env:{DATA_FILE:path.join(dir,'routes','requests.json'),BACKUP_DIR:path.join(dir,'route-backups')}},
    URL
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'preview.cjs'),'utf8'),sandbox);
  async function request(url,method='GET',body,session,origin='http://localhost:3000'){
    const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);
    req.url=url;req.method=method;req.socket={remoteAddress:'127.0.0.1'};
    req.headers={host:'localhost:3000',origin,'content-type':'application/json',...(session?{cookie:session}:{})};
    let end;const ended=new Promise(resolve=>end=resolve);
    const res={headers:{},code:200,setHeader(k,v){this.headers[k]=v;},writeHead(code,headers={}){this.code=code;Object.assign(this.headers,headers);},end(data){this.body=data?.toString() || '';end();}};
    await handler(req,res);await ended;
    return res;
  }
  assert.equal((await request('/dashboard.html')).code,302);
  assert.equal((await request('/api/health')).code,200);
  assert.equal((await request('/api/requests')).code,401);
  assert.equal((await request('/api/staff/menu')).code,401);
  assert.equal((await request('/api/reservation-rules')).code,401);
  assert.equal((await request('/api/updates')).code,401);
  assert.equal((await request('/api/backups')).code,401);
  assert.equal((await request('/api/backups','POST',{})).code,401);
  assert.equal((await request('/api/pickup-status','PATCH',{paused:true,revision:0})).code,401);
  assert.equal((await request('/api/auth/setup','POST',{username:'staff',password:'test-password-12345'},null,'https://other.example')).code,403);
  const setup=await request('/api/auth/setup','POST',{username:'staff',password:'test-password-12345'});
  assert.equal(setup.code,200);
  const session=setup.headers['Set-Cookie'];
  assert.equal((await request('/api/backups','GET',undefined,session)).code,200);
  assert.equal((await request('/api/backups','POST',{},session)).code,201);
  const beforeUpdate=JSON.parse((await request('/api/updates','GET',undefined,session)).body);
  const rulesResponse=await request('/api/reservation-rules','GET',undefined,session);
  assert.equal(rulesResponse.code,200);
  const rules=JSON.parse(rulesResponse.body);
  const savedRules=await request('/api/reservation-rules','PATCH',rules,session);
  assert.equal(savedRules.code,200);
  const afterUpdate=JSON.parse((await request('/api/updates','GET',undefined,session)).body);
  assert.equal(afterUpdate.revision,beforeUpdate.revision+1);
  assert.equal((await request('/api/requests','GET',undefined,session)).code,200);
  assert.equal((await request('/api/auth/setup','POST',{username:'other',password:'test-password-12345'})).code,409);
  assert.equal((await request('/api/auth/login','POST',{username:'staff',password:'wrong'})).code,401);
  assert.equal((await request('/api/auth/logout','POST',{},session)).code,200);
  assert.equal((await request('/api/requests','GET',undefined,session)).code,401);
  const login=await request('/api/auth/login','POST',{username:'staff',password:'test-password-12345'});
  assert.equal(login.code,200);
  const status=JSON.parse((await request('/api/auth/status','GET',undefined,login.headers['Set-Cookie'])).body);
  assert.equal(status.authenticated,true);
  const managerSession=login.headers['Set-Cookie'];
  const staffCreated=await request('/api/staff/accounts','POST',{name:'Test Staff',code:'0042',pin:'007',role:'staff'},managerSession);
  assert.equal(staffCreated.code,201);
  const safeStaff=JSON.parse(staffCreated.body);assert.ok(!('hash' in safeStaff));
  const numericLogin=await request('/api/auth/login','POST',{code:'0042',pin:'007'});
  assert.equal(numericLogin.code,200);
  const staffSession=numericLogin.headers['Set-Cookie'];
  const employeeStatus=JSON.parse((await request('/api/auth/status','GET',undefined,staffSession)).body);
  assert.equal(employeeStatus.code,'0042');assert.equal(employeeStatus.role,'staff');
  assert.equal((await request('/api/requests','GET',undefined,staffSession)).code,200);
  assert.equal((await request('/api/staff/accounts','GET',undefined,staffSession)).code,403);
  assert.equal((await request('/api/staff/accounts','POST',{name:'Other',code:'9999',pin:'123',role:'manager'},staffSession)).code,403);
  assert.equal((await request('/api/staff/accounts/'+safeStaff.id,'PATCH',{action:'pin',pin:'009'},staffSession)).code,403);
  assert.equal((await request('/api/staff/accounts/'+safeStaff.id,'PATCH',{action:'pin',pin:'009'},managerSession)).code,200);
  assert.equal((await request('/api/requests','GET',undefined,staffSession)).code,401);
  console.log('PASS: password hashing/persistence, first account setup, sessions, expiry, logout, attempt limits, protected routes, origin checks, health endpoint');
}
module.exports=run().finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1;});
