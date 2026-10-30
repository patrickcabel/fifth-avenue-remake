const path=require('node:path'),http=require('node:http');
const {BackupManager}=require('../backup-manager.cjs');
const dataDir=path.dirname(process.env.DATA_FILE || path.join(__dirname,'data','requests.json'));
const backups=new BackupManager(dataDir,process.env.BACKUP_DIR || path.join(__dirname,'..','backups'));
async function probe(hostname){
  return new Promise(resolve=>{
    const request=http.get({hostname,port:3000,path:'/api/health',headers:{Host:'localhost:3000'},timeout:2000},response=>{response.resume();resolve(true);});
    request.on('timeout',()=>{request.destroy();resolve(false);});request.on('error',()=>resolve(false));
  });
}
async function serverRunning(){return (await Promise.all(['service-desk','127.0.0.1'].map(probe))).some(Boolean);}
(async()=>{
  const [action,name,confirmation]=process.argv.slice(2);
  if(action==='list'){console.log(JSON.stringify(backups.status(),null,2));return;}
  if(action==='verify'){const copy=backups.read(name);console.log('Integrity verified. Snapshot date: '+copy.createdAt);return;}
  if(action==='restore'){
    if(confirmation!=='--confirm-restore')throw Error('Stop service-desk, then supply a backup filename and --confirm-restore.');
    if(await serverRunning())throw Error('The backend is still running. Stop service-desk before restoring.');
    console.log(JSON.stringify(backups.restore(name),null,2));return;
  }
  throw Error('Usage: backup-cli.cjs list | verify <filename> | restore <filename> --confirm-restore');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
