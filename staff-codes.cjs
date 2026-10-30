const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
class StaffCodes{
  constructor(file){this.file=file;this.users=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).users:[];}
  list(){return this.users.map(({id,name,code,role,active})=>({id,name,code,role,active}));}
  save(users){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify({version:1,users}),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);this.users=users;}
  validateCode(code){if(typeof code!=='string'||!/^\d{4}$/.test(code))throw Error('Employee code must contain exactly four digits.');}
  validatePin(pin){if(typeof pin!=='string'||!/^\d{3}$/.test(pin))throw Error('PIN must contain exactly three digits.');}
  create(input){
    this.validateCode(input.code);this.validatePin(input.pin);
    if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw Error('Staff name is required.');
    if(!['staff','manager'].includes(input.role))throw Error('Choose a staff or manager role.');
    if(this.users.some(u=>u.code===input.code)){const e=Error('This employee code is already assigned.');e.status=409;throw e;}
    const salt=crypto.randomBytes(32).toString('hex');
    const user={id:crypto.randomUUID(),name:input.name.trim(),code:input.code,role:input.role,active:true,revision:1,salt,hash:crypto.scryptSync(input.pin,salt,64).toString('hex')};
    this.save([...this.users,user]);return this.list().find(u=>u.id===user.id);
  }
  verify(code,pin){
    if(typeof code!=='string'||typeof pin!=='string'||!/^\d{4}$/.test(code)||!/^\d{3}$/.test(pin))return null;
    const user=this.users.find(u=>u.code===code);
    const hash=crypto.scryptSync(pin,user?.salt || 'invalid-staff-code',64);
    return user?.active&&crypto.timingSafeEqual(hash,Buffer.from(user.hash,'hex'))?user:null;
  }
  update(id,input,actor){
    const users=structuredClone(this.users),user=users.find(u=>u.id===id);
    if(!user){const e=Error('Staff member not found.');e.status=404;throw e;}
    if(input.action==='pin'){this.validatePin(input.pin);user.salt=crypto.randomBytes(32).toString('hex');user.hash=crypto.scryptSync(input.pin,user.salt,64).toString('hex');}
    else if(input.action==='active'&&typeof input.active==='boolean'){
      if(!input.active&&actor.employeeId===id)throw Error('You cannot deactivate your own account.');
      if(!input.active&&user.role==='manager'&&users.filter(u=>u.role==='manager'&&u.active&&u.id!==id).length===0)throw Error('Keep at least one employee-code manager active.');
      user.active=input.active;
    }else throw Error('Invalid staff account change.');
    user.revision++;this.save(users);return this.list().find(u=>u.id===id);
  }
}
module.exports={StaffCodes};
