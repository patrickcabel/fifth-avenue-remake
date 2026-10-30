const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const file=path.join(__dirname,'..','.env');
let text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
if(/^VAPI_WEBHOOK_SECRET=.+$/m.test(text)) {
  console.log('An existing webhook secret is configured; it was not changed.');
} else {
  const value='VAPI_WEBHOOK_SECRET='+crypto.randomBytes(32).toString('hex');
  text=/^VAPI_WEBHOOK_SECRET=.*$/m.test(text)?text.replace(/^VAPI_WEBHOOK_SECRET=.*$/m,value):text+'\n'+value+'\n';
  fs.writeFileSync(file,text,{mode:0o600});
  console.log('Webhook secret saved to .env. Copy its value into a Vapi Custom Credential. Do not share it in chat.');
}
