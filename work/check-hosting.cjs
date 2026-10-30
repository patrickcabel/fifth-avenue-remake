const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const {hostingConfig}=require('../hosting-config.cjs'),{DemoAccess}=require('../demo-access.cjs');
assert.throws(()=>hostingConfig({RENDER:'true'}),/required/);
assert.throws(()=>hostingConfig({PUBLIC_ORIGIN:'http://example.com'}),/HTTPS/);
const gate=new DemoAccess('fictional-test-password');
assert.equal(gate.valid(''),false);assert.ok(gate.valid(gate.unlock('fictional-test-password','test')));
const dir=fs.mkdtempSync(path.join(__dirname,'store-test-hosting-'));
const child=spawn(process.execPath,[path.join(__dirname,'preview.cjs')],{env:{...process.env,PORT:'31987',BIND_HOST:'127.0.0.1',PUBLIC_ORIGIN:'https://demo.example.com',DEMO_MODE:'true',DEMO_PASSWORD:'fictional-test-password',DEMO_MANAGER_CODE:'0123',DEMO_MANAGER_PIN:'045',VAPI_WEBHOOK_SECRET:'fictional-webhook-test-token-long-enough-12345',DATA_FILE:path.join(dir,'requests.json'),BACKUP_DIR:path.join(dir,'backups')},stdio:'ignore'});
function request(url,options={}){return new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port:31987,path:url,method:options.body?'POST':'GET',headers:{host:'demo.example.com',...options.headers}},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});r.on('error',reject);r.end(options.body);});}
(async()=>{try{
  let ready=false;for(let n=0;n<50;n++){try{if((await request('/api/health')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'hosted server starts');
  assert.equal((await request('/dashboard.html')).headers.location,'/demo-access.html');
  assert.equal((await request('/api/requests')).status,401);
  assert.equal((await request('/api/health',{headers:{host:'evil.example.com'}})).status,403);
  assert.equal((await request('/vapi/tools',{body:'{}'})).status,401);
  const unlock=await request('/demo/unlock',{body:JSON.stringify({password:'fictional-test-password'}),headers:{origin:'https://demo.example.com','content-type':'application/json'}});assert.equal(unlock.status,200);
  const cookie=unlock.headers['set-cookie'][0].split(';')[0];
  const login=await request('/api/auth/login',{body:JSON.stringify({code:'0123',pin:'045'}),headers:{cookie,origin:'https://demo.example.com','content-type':'application/json'}});assert.equal(login.status,200);assert.match(login.headers['set-cookie'][0],/Secure/);
  const both=cookie+'; '+login.headers['set-cookie'][0].split(';')[0];assert.equal((await request('/api/requests',{headers:{cookie:both}})).status,200);
  assert.equal((await request('/api/pickup-status',{body:'{}',headers:{cookie:both,origin:'https://evil.example.com','content-type':'application/json'}})).status,403);
  console.log('PASS: hosted startup, demo gate, manager seed, secure cookies, public webhook authentication, host and origin checks');
}finally{child.kill();await new Promise(r=>child.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
