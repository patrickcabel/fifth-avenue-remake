const fs = require('node:fs');
const html=fs.readFileSync('menu.html','utf8');
const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const items=[];
for (const category of html.matchAll(/<details class="menu-category" id="([^"]+)">([\s\S]*?)<\/details>/g)) {
  if(category[1]==='alcohol') continue;
  const title=clean(category[2].match(/<h2>([\s\S]*?)<\/h2>/)[1]);
  let index=0;
  for(const row of category[2].matchAll(/<li><span>([\s\S]*?)<\/span><data value="([\d.]+)">/g)) {
    items.push({id:category[1]+'-'+(++index),category:title,name:clean(row[1]),price:Math.round(Number(row[2])*100),available:true});
  }
}
if(items.length<50) throw Error('Menu extraction incomplete');
fs.writeFileSync('menu-data.json',JSON.stringify(items,null,2)+'\n');
console.log('Extracted '+items.length+' menu items; alcohol excluded from pickup intake.');
