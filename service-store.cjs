const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {MenuStore} = require('./menu-store.cjs');
const {PickupSettings} = require('./pickup-settings.cjs');
const {validateEdit,localNow}=require('./reservation-validation.cjs');
const {ReservationRules}=require('./reservation-rules.cjs');
class ServiceStore {
  constructor(file) {
    this.file = file;
    this.reservationRules=new ReservationRules(path.join(path.dirname(file),'reservation-rules.json'));
    this.menu = new MenuStore(path.join(path.dirname(file),'menu-availability.json'));
    this.pickup = new PickupSettings(path.join(path.dirname(file),'pickup-settings.json'));
    this.records = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }
  list() { return structuredClone(this.records); }
  reservationCheck(candidate){return this.reservationRules.check(candidate,this.records);}
  autoCancelNoShows(now=Date.now()){
    const records=this.list();let changed=0;
    for(const r of records)if(this.reservationRules.expired(r,now)){
      r.status='cancelled';r.cancelledAt=now;r.cancellationReason='Automatically cancelled: guests were not marked arrived within 15 minutes of the reservation time.';r.revision++;
      r.events.push({action:'auto_cancel_no_show',at:now,reason:r.cancellationReason});changed++;
    }
    if(changed)this.commit(records);
    return changed;
  }
  commit(records) {
    fs.mkdirSync(path.dirname(this.file), {recursive:true});
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(records, null, 2));
    fs.renameSync(temporary, this.file);
    this.records = records;
  }
  create(input, context = {}) {
    if (!input || !['order','reservation'].includes(input.type)) throw new Error('Choose an order or reservation.');
    const requestKey=input.requestKey;
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify({type:input.type,name:input.name,phone:input.phone,mode:input.mode,items:input.items,note:input.note,guests:input.guests,date:input.date,time:input.time,confirmed:input.confirmed,tableCount:input.tableCount})).digest('hex');
    if(requestKey !== undefined) {
      if(typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestKey)) throw Error('Invalid request key.');
      const existing=this.records.find(r=>r.requestKey===requestKey);
      if(existing) {
        if(existing.fingerprint!==fingerprint) {const e=Error('This request key was already used for different details.');e.status=409;throw e;}
        return structuredClone(existing);
      }
    }
    if(input.type==='order' && this.pickup.get().paused) {const e=Error('Pickup orders are temporarily paused. Please try again later.');e.status=409;throw e;}
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw new Error('Customer name is required.');
    if (typeof input.phone !== 'string' || !/^[+\d ()-]{7,25}$/.test(input.phone)) throw new Error('A valid phone number is required.');
    const r = {id:(input.type === 'order' ? 'ORD-' : 'RES-') + crypto.randomUUID().slice(0,8).toUpperCase(), type:input.type, name:input.name.trim(), phone:input.phone, note:String(input.note || '').slice(0,1000), status:'pending', createdAt:Date.now(), revision:1, events:[]};
    if(requestKey) {r.requestKey=requestKey;r.fingerprint=fingerprint;}
    if(context.source === 'vapi') {r.vapiCallId=context.callId;}
    if (r.type === 'order') {
      if (input.mode !== 'Pickup') throw new Error('Only pickup orders are supported.');
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50) throw new Error('Order items are required.');
      if (!input.items.every(i => i && typeof i.menuId === 'string' && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 99 && (i.note === undefined || (typeof i.note === 'string' && i.note.length <= 300)))) throw new Error('Invalid order items.');
      r.mode = 'Pickup'; r.minutes = 25;
      r.items = input.items.map(({menuId,qty,note})=>{
        const item=this.menu.list().find(item=>item.id === menuId && item.available);
        if (!item) throw new Error('A selected dish is sold out or no longer on the menu. Remove it before submitting.');
        return {menuId, name:item.name, qty, price:item.price, note:note?.trim() || ''};
      });
      r.subtotal = r.items.reduce((sum,i)=>sum + i.qty*i.price,0);
      r.source = context.source === 'vapi' ? 'vapi' : input.source === 'staff' ? 'staff' : 'simulation';
    } else {
      if (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > 30 || typeof input.date !== 'string' || !input.date || typeof input.time !== 'string' || !input.time) throw new Error('Party size, date, and time are required.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw Error('Choose a valid reservation date and time.');
      const parsed=new Date(input.date+'T12:00:00Z');
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==input.date) throw Error('Choose a valid calendar date.');
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(Date.now()).map(p=>[p.type,p.value]));
      const localNow=parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
      if (input.date+'T'+input.time <= localNow) throw Error('Choose a future date and time in Calgary.');
      if (input.confirmed !== undefined && typeof input.confirmed !== 'boolean') throw Error('Invalid reservation confirmation.');
      if (input.confirmed === true && input.source !== 'staff') throw Error('Only staff-entered reservations can be saved as confirmed.');
      r.guests = input.guests; r.date = input.date; r.time = input.time;
      r.source = context.source === 'vapi' ? 'vapi' : input.source === 'staff' ? 'staff' : 'simulation';
      r.timezone='America/Edmonton';
      r.durationMinutes=120;r.tableCount=input.source==='staff'?(input.tableCount??1):1;
      if(!Number.isInteger(r.tableCount)||r.tableCount<1||r.tableCount>500)throw Error('Choose a valid table count.');
      if(input.confirmed===true){const check=this.reservationCheck(r);if(!check.allowed)throw Error(check.warnings.join(' '));}
      if (input.confirmed === true) {r.status='confirmed';r.acceptedAt=Date.now();}
    }
    r.events.push({action:'created', at:r.createdAt,...(context.actor?{actor:context.actor}:{})});
    if(r.type === 'reservation' && r.status === 'confirmed') r.events.push({action:'accept',at:r.acceptedAt,source:'staff'});
    this.commit([r,...this.records]); return r;
  }
  update(id, input, context = {}) {
    const records = this.list(), r = records.find(r=>r.id === id);
    if (!r) { const e = new Error('Request not found.'); e.status = 404; throw e; }
    if (input.revision !== r.revision) { const e = new Error('Another staff member changed this request. Review its latest status.'); e.status = 409; throw e; }
    const at = Date.now();
    let change;
    if(input.action==='edit_reservation' && r.type==='reservation' && ['pending','confirmed'].includes(r.status)) {
      const values=validateEdit(input);
      values.tableCount=input.tableCount??r.tableCount??1;
      if(!Number.isInteger(values.tableCount)||values.tableCount<1||values.tableCount>500)throw Error('Choose a valid table count.');
      if(r.status==='confirmed'){const check=this.reservationCheck({...r,...values});if(!check.allowed)throw Error(check.warnings.join(' '));}
      const before=Object.fromEntries(Object.keys(values).map(key=>[key,r[key]]));
      Object.assign(r,values);
      change={before,after:values};
      r.updatedAt=at;
    } else if(input.action==='cancel_reservation' && r.type==='reservation' && ['pending','confirmed'].includes(r.status)) {
      if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>300)throw Error('A cancellation reason is required.');
      r.status='cancelled';r.cancellationReason=input.reason.trim();r.cancelledAt=at;
      change={reason:r.cancellationReason};
    } else if(input.action==='arrive' && r.type==='reservation' && r.status==='confirmed') {
      r.status='arrived';r.arrivedAt=at;
    } else if(input.action==='no_show' && r.type==='reservation' && r.status==='confirmed') {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!/^\d{2}:\d{2}$/.test(r.time))throw Error('Correct this reservation date and time before marking a no-show.');
      if(r.date+'T'+r.time>localNow(at))throw Error('A reservation cannot be marked no-show before its scheduled time.');
      r.status='no_show';r.noShowAt=at;
    } else if (input.action === 'time' && r.type === 'order' && r.status === 'pending') {
      if (![15,25,30,45,60,90].includes(input.minutes)) throw new Error('Invalid preparation time.');
      r.minutes = input.minutes;
    } else if (input.action === 'accept' && r.status === 'pending') {
      if(r.type==='reservation'){const check=this.reservationCheck(r);if(!check.allowed)throw Error(check.warnings.join(' '));}
      r.status = r.type === 'order' ? 'accepted' : 'confirmed';
      r.acceptedAt = at;
      if (r.type === 'order') r.readyAt = at + r.minutes * 60000;
    } else if (input.action === 'ready' && r.type === 'order' && r.status === 'accepted') {
      r.status = 'ready'; r.markedReadyAt = at;
    } else if (input.action === 'complete' && r.type === 'order' && r.status === 'ready') {
      r.status = 'completed'; r.collectedAt = at;
    } else if (input.action === 'decline' && r.status === 'pending') {
      if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 300) throw new Error('A decline reason is required.');
      r.status = 'declined'; r.reason = input.reason.trim();
    } else { const e = new Error('This action is not available for the current status.'); e.status = 409; throw e; }
    r.revision++;
    r.events.push({action:input.action, at, ...(context.actor?{actor:context.actor}:{}), ...(change || {}), ...(input.action === 'time' ? {minutes:r.minutes} : {}), ...(r.reason ? {reason:r.reason} : {})});
    this.commit(records); return r;
  }
}
module.exports = {ServiceStore};
