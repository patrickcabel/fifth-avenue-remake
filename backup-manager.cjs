const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FILES=['requests.json','staff-account.json','staff-codes.json','menu-availability.json','pickup-settings.json','reservation-rules.json'];
const NAME=/^(backup|pre-restore)-(\d{13})-[a-f0-9]{8}\.json$/;
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
class BackupManager{
  constructor(dataDir,backupDir){this.dataDir=path.resolve(dataDir);this.backupDir=path.resolve(backupDir);this.lastError=null;if(this.dataDir===this.backupDir)throw Error('Backups must be stored separately from live data.');}
  list(){
    if(!fs.existsSync(this.backupDir))return [];
    return fs.readdirSync(this.backupDir).filter(name=>NAME.test(name)).map(name=>{
      const stat=fs.statSync(path.join(this.backupDir,name));
      return {name,createdAt:new Date(Number(name.match(NAME)[2])).toISOString(),bytes:stat.size,safetyCopy:name.startsWith('pre-restore-')};
    }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.name.localeCompare(a.name));
  }
  status(){const copies=this.list();return {snapshots:copies.slice(0,20),total:copies.length,intervalMinutes:60,retainedSnapshots:168,lastError:this.lastError,latestBackupAt:copies.find(s=>!s.safetyCopy)?.createdAt || null};}
  validateFile(name,text){
    if(!FILES.includes(name)||typeof text!=='string')throw Error('Backup contains an unsupported file.');
    let data;try{data=JSON.parse(text);}catch{throw Error('A backup data file is invalid JSON.');}
    if(name==='requests.json'?!Array.isArray(data):!data||typeof data!=='object'||Array.isArray(data))throw Error('A backup data file has an invalid shape.');
    if(name==='staff-account.json'&&(typeof data.username!=='string'||!/^[a-f0-9]{64}$/.test(data.salt)||!/^[a-f0-9]{128}$/.test(data.hash)))throw Error('The saved staff account is invalid.');
    if(name==='staff-codes.json'&&(!Array.isArray(data.users)||data.users.some(u=>typeof u.id!=='string'||typeof u.name!=='string'||!/^\d{4}$/.test(u.code)||!/^[a-f0-9]{64}$/.test(u.salt)||!/^[a-f0-9]{128}$/.test(u.hash)||!['staff','manager'].includes(u.role)||typeof u.active!=='boolean'||!Number.isInteger(u.revision))))throw Error('The saved employee accounts are invalid.');
  }
  create(kind='backup',now=Date.now()){
    if(!['backup','pre-restore'].includes(kind))throw Error('Invalid backup type.');
    const files={};
    // All application writes are synchronous in the same process as this snapshot.
    for(const name of FILES){
      const file=path.join(this.dataDir,name);if(!fs.existsSync(file))continue;
      const content=fs.readFileSync(file,'utf8');this.validateFile(name,content);
      files[name]={content,sha256:digest(content)};
    }
    const snapshot={format:'fifth-avenue-backup-v1',createdAt:new Date(now).toISOString(),files};
    const name=kind+'-'+now+'-'+crypto.randomBytes(4).toString('hex')+'.json';
    fs.mkdirSync(this.backupDir,{recursive:true});
    const file=path.join(this.backupDir,name);
    fs.writeFileSync(file+'.tmp',JSON.stringify(snapshot),{mode:0o600});fs.renameSync(file+'.tmp',file);
    this.read(name);
    this.lastError=null;
    const keep=kind==='backup'?168:10;
    for(const copy of this.list().filter(s=>s.safetyCopy===(kind==='pre-restore')).slice(keep))fs.unlinkSync(path.join(this.backupDir,copy.name));
    return this.list().find(s=>s.name===name);
  }
  due(now=Date.now()){
    const latest=this.list().find(s=>!s.safetyCopy);
    if(!latest||now-Date.parse(latest.createdAt)>=60*60000){try{return this.create('backup',now);}catch{this.lastError='Backup failed. Check the backup folder permissions, available space, and backend logs.';throw Error(this.lastError);}}
    return null;
  }
  read(name){
    if(typeof name!=='string'||!NAME.test(name))throw Error('Choose an existing backup filename, not a path.');
    const file=path.join(this.backupDir,name);
    if(fs.statSync(file).size>256*1024*1024)throw Error('Backup file is too large.');
    let snapshot;try{snapshot=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('Backup is not valid JSON.');}
    if(snapshot?.format!=='fifth-avenue-backup-v1'||!snapshot.files||typeof snapshot.files!=='object'||Array.isArray(snapshot.files)||!Number.isFinite(Date.parse(snapshot.createdAt)))throw Error('Unsupported backup format.');
    for(const [file,entry]of Object.entries(snapshot.files)){
      if(!entry||typeof entry.content!=='string'||digest(entry.content)!==entry.sha256)throw Error('Backup integrity check failed.');
      this.validateFile(file,entry.content);
    }
    return snapshot;
  }
  restore(name){
    const snapshot=this.read(name);
    const safety=this.create('pre-restore');
    fs.mkdirSync(this.dataDir,{recursive:true});
    const originals=new Map(FILES.map(file=>[file,fs.existsSync(path.join(this.dataDir,file))?fs.readFileSync(path.join(this.dataDir,file),'utf8'):null]));
    const write=(file,text)=>{const target=path.join(this.dataDir,file);if(text===null){if(fs.existsSync(target))fs.unlinkSync(target);}else{fs.writeFileSync(target+'.restore-tmp',text,{mode:0o600});fs.renameSync(target+'.restore-tmp',target);}};
    try{
      for(const file of FILES)write(file,snapshot.files[file]?.content??null);
    }catch(error){
      let rollbackFailed=false;for(const [file,text]of originals)try{write(file,text);}catch{rollbackFailed=true;}
      throw Error(rollbackFailed?'Restore failed and rollback could not finish. Recover from the pre-restore safety copy.':'Restore failed; original data was restored.');
    }
    return {restored:name,safetyCopy:safety.name,files:Object.keys(snapshot.files)};
  }
}
module.exports={BackupManager,FILES};
