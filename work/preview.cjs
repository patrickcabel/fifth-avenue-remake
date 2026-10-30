const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const {hostingConfig}=require('../hosting-config.cjs');
const hosting=hostingConfig(process.env);
const {DemoAccess}=require('../demo-access.cjs');
if(hosting.publicOrigin && !hosting.demoMode)throw Error('Public hosting requires DEMO_MODE=true.');
const demo=hosting.publicOrigin?new DemoAccess(process.env.DEMO_PASSWORD):null;
const root = path.resolve(__dirname, '..');
const {ServiceStore} = require('../service-store.cjs');
const store = new ServiceStore(process.env.DATA_FILE || path.join(root, 'work', 'data', 'requests.json'));
const {StaffAuth}=require('../staff-auth.cjs');
const auth=new StaffAuth(path.join(path.dirname(store.file),'staff-account.json'));
auth.secureCookies=!!hosting.publicOrigin;
if(demo && !auth.configured())auth.setupCode(process.env.DEMO_MANAGER_NAME || 'Demo Manager',process.env.DEMO_MANAGER_CODE,process.env.DEMO_MANAGER_PIN);
const {BackupManager}=require('../backup-manager.cjs');
const backups=new BackupManager(path.dirname(store.file),process.env.BACKUP_DIR || path.join(root,'backups'));
function scheduledBackup(){try{backups.due();}catch{console.error('Automatic backup failed. Check the backup folder and available disk space.');}}
scheduledBackup();const backupTimer=setInterval(scheduledBackup,60000);backupTimer.unref?.();
const subscribers = new Set();
let changeRevision=0,sourceRevision=0;
const boot=Date.now().toString(36);
const publish = () => {changeRevision++;subscribers.forEach(client => client.write('data: changed\n\n'));};
function sweepNoShows(){try{if(store.autoCancelNoShows())publish();}catch{console.error('Automatic reservation cancellation could not save. It will retry.');}}
sweepNoShows();
const noShowTimer=setInterval(sweepNoShows,30000);noShowTimer.unref?.();
// Separate listener: forward only port 3002 to Vapi, never the staff dashboard.
const {createWebhookServer} = require('../vapi-webhook.cjs');
const webhook=createWebhookServer(store,publish,process.env.VAPI_WEBHOOK_SECRET);
if(!hosting.publicOrigin)webhook.listen(3002,process.env.BIND_HOST || '127.0.0.1',()=>console.log('Vapi tool listener: port 3002'));
const clients = new Set();
let reloadTimer;
fs.watch(root, (event, filename) => {
  if (!filename || !/\.(html|css|js|svg)$/.test(filename)) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {sourceRevision++;clients.forEach(client => client.write('data: reload\n\n'));}, 150);
});
http.createServer(async (req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if(!hosting.allowedHosts.has(req.headers.host)){res.writeHead(403).end();return;}
  if(hosting.publicOrigin && name==='/vapi/tools'){webhook.emit('request',req,res);return;}
  if(demo && name==='/demo/unlock'){
    const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    if(req.method!=='POST')return send(405,{error:'POST required.'});
    if(!hosting.allowedOrigins.has(req.headers.origin))return send(403,{error:'Origin rejected.'});
    try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'Payload too large.'});}
      const input=JSON.parse(body);res.setHeader('Set-Cookie',demo.unlock(input.password,req.socket.remoteAddress));return send(200,{ok:true});
    }catch(e){return send(e.status||400,{error:e.status?e.message:'Invalid request.'});}
  }
  if(demo && name!=='/api/health' && (name.startsWith('/api/') || ['/', '/dashboard.html','/login.html','/__reload'].includes(name)) && !demo.valid(req.headers.cookie)){
    if(name.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Open /demo-access.html to unlock this demo.'}));return;}
    res.writeHead(302,{'Location':'/demo-access.html','Cache-Control':'no-store'}).end();return;
  }
  if (name.startsWith('/api/')) {
    const json = (status, body) => { res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
    // Development API: same-origin writes only, bound to loopback below.
    if (!hosting.allowedHosts.has(req.headers.host)) return json(403,{error:'Local access only.'});
    if(req.method==='GET' && name==='/api/health') return json(200,{ok:true});
    if(req.method==='GET' && name==='/api/auth/status') {
      const session=auth.session(req.headers.cookie);
      return json(200,{demoMode:hosting.demoMode,configured:auth.configured(),legacyLoginAvailable:!!auth.account,authenticated:!!session,...(session?{username:session.username,code:session.code || null,role:session.role}:{})});
    }
    if(['/api/auth/setup','/api/auth/login','/api/auth/logout'].includes(name)) {
      if(req.method!=='POST')return json(405,{error:'POST required.'});
      if(req.headers.origin && !hosting.allowedOrigins.has(req.headers.origin))return json(403,{error:'Origin rejected.'});
      if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'JSON required.'});
      try{
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return json(413,{error:'Payload too large.'});}
        let input;try{input=JSON.parse(body);}catch{return json(400,{error:'Invalid JSON.'});}
        if(!input || typeof input!=='object' || Array.isArray(input))return json(400,{error:'Invalid request.'});
        if(name==='/api/auth/logout'){
          const token=auth.token(req.headers.cookie);auth.logout(req.headers.cookie);
          for(const client of subscribers)if(client.staffToken===token){client.end();subscribers.delete(client);}
          res.setHeader('Set-Cookie',auth.clearCookie());return json(200,{ok:true});
        }
        if(name==='/api/auth/setup'){if(input.code!==undefined)auth.setupCode(input.name,input.code,input.pin);else auth.setup(input.username,input.password);}
        const token=input.code!==undefined?auth.loginCode(input.code,input.pin,req.socket.remoteAddress):auth.login(input.username,input.password,req.socket.remoteAddress);
        res.setHeader('Set-Cookie',auth.cookie(token));return json(200,{ok:true});
      }catch(e){return json(e.status || 400,{error:e.message});}
    }
    const staffSession=auth.session(req.headers.cookie);
    if(!staffSession)return json(401,{error:'Staff sign-in required.'});
    if(name.startsWith('/api/staff/accounts') && staffSession.role!=='manager')return json(403,{error:'Manager access required.'});
    if(req.method==='GET' && name==='/api/staff/accounts')return json(200,auth.codes.list());
    if(req.method==='GET' && name==='/api/updates')return json(200,{boot,revision:changeRevision,sourceRevision});
    if (req.method === 'GET' && name === '/api/requests') {sweepNoShows();return json(200,store.list().map(r=>r.type==='reservation'&&['pending','confirmed'].includes(r.status)?{...r,reservationCheck:store.reservationCheck(r)}:r));}
    if(req.method==='GET' && name==='/api/backups')return json(200,backups.status());
    if(req.method==='GET' && name==='/api/reservation-rules')return json(200,store.reservationRules.get());
    if (req.method === 'GET' && name === '/api/pickup-status') return json(200,store.pickup.get());
    const statusMatch=name.match(/^\/api\/requests\/([A-Z0-9-]+)$/);
    if(req.method==='GET' && statusMatch) {
      const r=store.list().find(r=>r.id===statusMatch[1]);
      return r?json(200,r):json(404,{error:'Request not found.'});
    }
    if (req.method === 'GET' && name === '/api/menu') return json(200,store.menu.list().filter(item=>item.available));
    if (req.method === 'GET' && name === '/api/staff/menu') return json(200,store.menu.list());
    if (req.method === 'GET' && name === '/api/events') {
      res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      res.write(': connected\n\n'); res.staffToken=staffSession.token;subscribers.add(res);
      const timer = setInterval(()=>{if(!auth.session(req.headers.cookie)){res.end();subscribers.delete(res);clearInterval(timer);}else res.write(': keepalive\n\n');},20000);
      req.on('close',()=>{clearInterval(timer);subscribers.delete(res);}); return;
    }
    if (!['POST','PATCH'].includes(req.method)) return json(405,{error:'Method not allowed.'});
    if (req.headers.origin && !hosting.allowedOrigins.has(req.headers.origin)) return json(403,{error:'Origin rejected.'});
    if (!req.headers['content-type']?.startsWith('application/json')) return json(415,{error:'JSON required.'});
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body)>32768) { const e = new Error('Request too large.'); e.status=413; throw e; } }
      let input; try { input = JSON.parse(body); } catch { throw new Error('Invalid JSON.'); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request.');
      if(req.method==='POST' && name==='/api/staff/accounts')return json(201,auth.codes.create(input));
      const staffMatch=name.match(/^\/api\/staff\/accounts\/([a-f0-9-]+)$/);
      if(req.method==='PATCH' && staffMatch)return json(200,auth.codes.update(staffMatch[1],input,staffSession));
      if(req.method==='POST' && name==='/api/backups'){try{const copy=backups.create();return json(201,copy);}catch{backups.lastError='Backup failed. Check folder permissions and disk space.';return json(500,{error:backups.lastError});}}
      if(req.method==='PATCH' && name==='/api/reservation-rules'){const rules=store.reservationRules.update(input);publish();return json(200,rules);}
      if(req.method==='POST' && name==='/api/reservation-check')return json(200,store.reservationCheck(input));
      if(req.method==='PATCH' && name==='/api/pickup-status') {const state=store.pickup.update(input);publish();return json(200,state);}
      const menuMatch = name.match(/^\/api\/staff\/menu\/([a-z0-9-]+)$/);
      if (req.method === 'PATCH' && menuMatch) { const item=store.menu.update(menuMatch[1],input); publish(); return json(200,item); }
      if (req.method === 'POST' && name === '/api/requests') { const r=store.create(input,{actor:{employeeId:staffSession.employeeId || null,code:staffSession.code || null,name:staffSession.username}}); publish(); return json(201,r); }
      const match = name.match(/^\/api\/requests\/([A-Z0-9-]+)$/);
      if (req.method === 'PATCH' && match) { const r=store.update(match[1],input,{actor:{employeeId:staffSession.employeeId || null,code:staffSession.code || null,name:staffSession.username}}); publish(); return json(200,r); }
      return json(404,{error:'Endpoint not found.'});
    } catch(e) { return json(e.status || 400,{error:e.message}); }
  }
  if (name === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if((name==='/' || name==='/dashboard.html') && !auth.session(req.headers.cookie)){res.writeHead(302,{'Location':'/login.html','Cache-Control':'no-store'});res.end();return;}
  const file = path.resolve(root, '.' + (name === '/' ? '/dashboard.html' : name));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (!['.html','.js','.css','.svg'].includes(path.extname(file)) || path.relative(root,file).includes(path.sep)) { res.writeHead(404).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(hosting.port, process.env.BIND_HOST || '127.0.0.1', () => console.log('Live preview: http://localhost:3000/dashboard.html'));
