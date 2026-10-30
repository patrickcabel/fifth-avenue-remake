const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {recoverManager}=require('../manager-recovery.cjs'),{StaffAuth}=require('../staff-auth.cjs');
const dir=fs.mkdtempSync(path.join(__dirname,'store-test-recovery-'));
try{
  const data=path.join(dir,'data'),backups=path.join(dir,'backups'),accountFile=path.join(data,'staff-account.json');
  const old=new StaffAuth(accountFile);old.setup('previous','old-password-12345');
  const oldContents=fs.readFileSync(accountFile,'utf8');
  fs.writeFileSync(path.join(data,'requests.json'),'[{"id":"RES-TEST","status":"confirmed"}]');
  const first=recoverManager(data,backups,{name:'Manager',code:'0001',pin:'007'});
  assert.equal(first.manager.role,'manager');assert.ok(first.safetyCopy);
  assert.ok(new StaffAuth(accountFile).loginCode('0001','007'));
  assert.equal(fs.readFileSync(accountFile,'utf8'),oldContents);
  assert.equal(fs.readFileSync(path.join(data,'requests.json'),'utf8'),'[{"id":"RES-TEST","status":"confirmed"}]');
  const second=recoverManager(data,backups,{name:'Manager',code:'0001',pin:'009'});
  assert.equal(second.manager.id,first.manager.id);
  assert.ok(new StaffAuth(accountFile).loginCode('0001','009'));
  assert.throws(()=>new StaffAuth(accountFile).loginCode('0001','007'),/incorrect/);
  const auth=new StaffAuth(accountFile);auth.codes.create({name:'Staff',code:'0002',pin:'123',role:'staff'});
  assert.throws(()=>recoverManager(data,backups,{name:'Manager',code:'0002',pin:'456'}),/belongs to a staff/);
  assert.throws(()=>recoverManager(data,backups,{name:'Manager',code:'1',pin:'12'}),/four digits/);
  console.log('PASS: manager recovery, PIN reset, leading zeros, backup before change, existing account/data preservation, staff-code conflict protection');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
