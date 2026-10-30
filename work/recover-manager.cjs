const path=require('node:path'),http=require('node:http'),{Writable}=require('node:stream'),readline=require('node:readline/promises');
const {recoverManager}=require('../manager-recovery.cjs');
async function probe(hostname){return new Promise(resolve=>{
  const request=http.get({hostname,port:3000,path:'/api/health',headers:{Host:'localhost:3000'},timeout:2000},response=>{response.resume();resolve(true);});
  request.on('timeout',()=>{request.destroy();resolve(false);});request.on('error',()=>resolve(false));
});}
(async()=>{
  if(!process.stdin.isTTY)throw Error('Run this command interactively so the PIN can be entered privately.');
  if((await Promise.all(['service-desk','127.0.0.1'].map(probe))).some(Boolean))throw Error('Stop the backend first: docker compose stop service-desk');
  let muted=false;
  const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk,encoding);done();}});
  output.isTTY=process.stdout.isTTY;output.columns=process.stdout.columns;
  const rl=readline.createInterface({input:process.stdin,output,terminal:true});
  const ask=async(prompt,secret=false)=>{muted=false;const question=rl.question(prompt);muted=secret;try{return await question;}finally{muted=false;if(secret)process.stdout.write('\n');}};
  try{
    console.log('Create or recover a manager employee code. Existing orders and reservations are preserved.');
    const name=(await ask('Manager name: ')).trim(),code=(await ask('4-digit manager code: ')).trim();
    const pin=await ask('New 3-digit PIN (hidden): ',true),confirm=await ask('Confirm PIN (hidden): ',true);
    if(pin!==confirm)throw Error('PINs do not match. No account changes were made.');
    const dataDir=path.dirname(process.env.DATA_FILE || path.join(__dirname,'data','requests.json'));
    const result=recoverManager(dataDir,process.env.BACKUP_DIR || path.join(__dirname,'..','backups'),{name,code,pin});
    console.log('Manager access saved. A pre-recovery safety copy was created: '+result.safetyCopy);
    console.log('Start the backend, then sign in using the employee code and PIN you just chose.');
  }finally{rl.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
