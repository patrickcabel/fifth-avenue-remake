const fs = require('node:fs');
const path = require('node:path');
const catalog = require('./menu-data.json');
class MenuStore {
  constructor(file) {
    this.file = file;
    this.overrides = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {};
  }
  list() {
    return catalog.map(item=>({...item, available:this.overrides[item.id]?.available ?? item.available, revision:this.overrides[item.id]?.revision || 0}));
  }
  update(id, input) {
    if (!catalog.some(item=>item.id === id)) { const e=new Error('Menu item not found.'); e.status=404; throw e; }
    if (typeof input.available !== 'boolean') throw new Error('Availability must be true or false.');
    const current=this.overrides[id] || {revision:0};
    if (input.revision !== current.revision) { const e=new Error('Availability changed in another tab. Review the latest menu.'); e.status=409; throw e; }
    const next={...this.overrides,[id]:{available:input.available, revision:current.revision+1, updatedAt:Date.now()}};
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    fs.writeFileSync(this.file+'.tmp',JSON.stringify(next,null,2));
    fs.renameSync(this.file+'.tmp',this.file);
    this.overrides=next;
    return this.list().find(item=>item.id === id);
  }
}
module.exports={MenuStore};
