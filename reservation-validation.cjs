function localNow(at=Date.now()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));
  return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
}
function validateEdit(input) {
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw Error('Customer name is required.');
  if(typeof input.phone!=='string'||!/^[+\d ()-]{7,25}$/.test(input.phone))throw Error('A valid phone number is required.');
  if(!Number.isInteger(input.guests)||input.guests<1||input.guests>30)throw Error('Choose a party size from 1 to 30.');
  if(typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||typeof input.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))throw Error('Choose a valid reservation date and time.');
  const date=new Date(input.date+'T12:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.date)throw Error('Choose a valid calendar date.');
  if(input.date+'T'+input.time<=localNow())throw Error('Choose a future date and time in Calgary.');
  if(typeof input.note!=='string'||input.note.length>1000)throw Error('Notes must be 1000 characters or fewer.');
  return {name:input.name.trim(),phone:input.phone.trim(),date:input.date,time:input.time,guests:input.guests,note:input.note};
}
module.exports={validateEdit,localNow};
