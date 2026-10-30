const path=require('node:path'),crypto=require('node:crypto');
const {StaffCodes}=require('./staff-codes.cjs'),{BackupManager}=require('./backup-manager.cjs');
function recoverManager(dataDir,backupDir,{name,code,pin}){
  const accounts=new StaffCodes(path.join(dataDir,'staff-codes.json'));
  accounts.validateCode(code);accounts.validatePin(pin);
  if(typeof name!=='string'||!name.trim()||name.length>100)throw Error('Enter a manager name.');
  const existing=accounts.users.find(user=>user.code===code);
  if(existing&&existing.role!=='manager')throw Error('That code belongs to a staff account. Choose an unused code or an existing manager code.');
  const backup=new BackupManager(dataDir,backupDir).create('pre-restore');
  let manager;
  if(existing){
    const users=structuredClone(accounts.users),user=users.find(u=>u.id===existing.id);
    user.name=name.trim();user.active=true;user.revision++;
    user.salt=crypto.randomBytes(32).toString('hex');user.hash=crypto.scryptSync(pin,user.salt,64).toString('hex');
    accounts.save(users);manager=accounts.list().find(u=>u.id===user.id);
  }else manager=accounts.create({name,code,pin,role:'manager'});
  return {manager,safetyCopy:backup.name};
}
module.exports={recoverManager};
