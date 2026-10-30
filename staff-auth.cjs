const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const LIFETIME=12*60*60*1000;
const {StaffCodes}=require('./staff-codes.cjs');
class StaffAuth {
  constructor(file) {this.file=file;this.account=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;this.codes=new StaffCodes(path.join(path.dirname(file),'staff-codes.json'));this.sessions=new Map();this.failures=new Map();}
  configured(){return !!this.account || this.codes.users.length>0;}
  setupCode(name,code,pin){
    if(this.configured()){const e=Error('A staff account already exists. Sign in to manage employee codes.');e.status=409;throw e;}
    return this.codes.create({name,code,pin,role:'manager'});
  }
  loginCode(code,pin,key='local',now=Date.now()){
    const keys=['employee-device:'+key,'employee-code:'+String(code).slice(0,20)];
    if(keys.some(k=>{const f=this.failures.get(k);return f&&f.until>now&&f.count>=5;})){const e=Error('Too many attempts. Try again in 15 minutes.');e.status=429;throw e;}
    const user=this.codes.verify(code,pin);
    if(!user){
      for(const k of keys){const f=this.failures.get(k);const next=f&&f.until>now?f:{count:0,until:now+15*60000};next.count++;this.failures.set(k,next);}
      const e=Error('Employee code or PIN is incorrect.');e.status=401;throw e;
    }
    for(const k of keys)this.failures.delete(k);
    for(const [token,session]of this.sessions)if(session.expiresAt<=now)this.sessions.delete(token);
    if(this.sessions.size>=256)this.sessions.delete(this.sessions.keys().next().value);
    const token=crypto.randomBytes(32).toString('hex');
    this.sessions.set(token,{username:user.name,code:user.code,role:user.role,employeeId:user.id,credentialRevision:user.revision,expiresAt:now+LIFETIME});
    return token;
  }
  setup(username,password) {
    if(this.configured()){const e=Error('A staff account already exists. Please sign in.');e.status=409;throw e;}
    if(typeof username!=='string'||!/^[a-zA-Z0-9_.-]{3,50}$/.test(username))throw Error('Use 3–50 letters, numbers, dots, hyphens or underscores for the username.');
    if(typeof password!=='string'||password.length<12||password.length>128)throw Error('Choose a password with 12–128 characters.');
    const salt=crypto.randomBytes(32).toString('hex');
    const account={username,salt,hash:crypto.scryptSync(password,salt,64).toString('hex')};
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    fs.writeFileSync(this.file+'.tmp',JSON.stringify(account),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);
    this.account=account;
  }
  login(username,password,key='local',now=Date.now()) {
    const failures=this.failures.get(key);
    if(failures && failures.until>now && failures.count>=5){const e=Error('Too many attempts. Try again in 15 minutes.');e.status=429;throw e;}
    let valid=false;
    if(this.account && typeof password==='string' && password.length<=128) {
      const hash=crypto.scryptSync(password,this.account.salt,64);
      valid=crypto.timingSafeEqual(hash,Buffer.from(this.account.hash,'hex')) && username===this.account.username;
    }
    if(!valid) {
      const next=failures && failures.until>now ? failures : {count:0,until:now+15*60000};
      next.count++;this.failures.set(key,next);
      const e=Error('Username or password is incorrect.');e.status=401;throw e;
    }
    this.failures.delete(key);
    for(const [token,s] of this.sessions) if(s.expiresAt<=now)this.sessions.delete(token);
    if(this.sessions.size>=256)this.sessions.delete(this.sessions.keys().next().value);
    const token=crypto.randomBytes(32).toString('hex');
    this.sessions.set(token,{username:this.account.username,role:'manager',expiresAt:now+LIFETIME});
    return token;
  }
  token(cookie) {
    const token=String(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('fifth_staff='))?.slice('fifth_staff='.length);
    return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
  }
  session(cookie,now=Date.now()) {
    const token=this.token(cookie),session=this.sessions.get(token);
    if(!session)return null;
    if(session.employeeId){const user=this.codes.users.find(u=>u.id===session.employeeId);if(!user?.active||user.revision!==session.credentialRevision){this.sessions.delete(token);return null;}}
    if(session.expiresAt<=now){this.sessions.delete(token);return null;}
    return {...session,token};
  }
  logout(cookie) {this.sessions.delete(this.token(cookie));}
  cookie(token) {return 'fifth_staff='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+LIFETIME/1000+(this.secureCookies?'; Secure':'');}
  clearCookie(){return 'fifth_staff=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+(this.secureCookies?'; Secure':'');}
}
module.exports={StaffAuth,LIFETIME};
