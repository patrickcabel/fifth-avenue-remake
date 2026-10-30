const fs=require('node:fs'), path=require('node:path');
class PickupSettings {
  constructor(file) { this.file=file; this.value=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{paused:false,revision:0}; }
  get() { return {...this.value}; }
  update(input) {
    if(typeof input.paused!=='boolean') throw Error('Paused must be true or false.');
    if(input.revision!==this.value.revision) {const e=Error('Pickup settings changed. Review the latest status.');e.status=409;throw e;}
    const next={paused:input.paused,revision:this.value.revision+1,updatedAt:Date.now()};
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    fs.writeFileSync(this.file+'.tmp',JSON.stringify(next,null,2));fs.renameSync(this.file+'.tmp',this.file);
    this.value=next;return this.get();
  }
}
module.exports={PickupSettings};
