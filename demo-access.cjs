const crypto=require('node:crypto');
class DemoAccess{
  constructor(password){if(typeof password!=='string'||password.length<12||password.length>200)throw Error('Hosted demo requires DEMO_PASSWORD with 12–200 characters.');this.hash=crypto.createHash('sha256').update(password).digest();this.sessions=new Map();this.attempts=new Map();}
  unlock(password,ip,now=Date.now()){
    const attempts=this.attempts.get(ip);
    if(attempts?.until>now&&attempts.count>=5){const e=Error('Too many attempts. Try again in 15 minutes.');e.status=429;throw e;}
    const hash=crypto.createHash('sha256').update(typeof password==='string'?password:'').digest();
    if(!crypto.timingSafeEqual(hash,this.hash)){const next=attempts?.until>now?attempts:{count:0,until:now+15*60000};next.count++;this.attempts.set(ip,next);const e=Error('Demo password is incorrect.');e.status=401;throw e;}
    this.attempts.delete(ip);
    for(const [token,expiry]of this.sessions)if(expiry<=now)this.sessions.delete(token);
    if(this.sessions.size>=256)this.sessions.delete(this.sessions.keys().next().value);
    const token=crypto.randomBytes(32).toString('hex');this.sessions.set(token,now+12*60*60000);
    return 'fifth_demo='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200';
  }
  valid(cookie,now=Date.now()){const token=String(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('fifth_demo='))?.slice(11);return (this.sessions.get(token)||0)>now;}
}
module.exports={DemoAccess};
