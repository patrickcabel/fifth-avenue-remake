const fs=require('node:fs'),path=require('node:path');
const {localNow}=require('./reservation-validation.cjs');
const {reservationDefaultHours}=require('./reservation-default-hours.js');
const defaults=()=>({revision:0,totalTables:40,walkInTables:10,durationMinutes:120,noShowMinutes:15,hours:reservationDefaultHours(),defaultHoursApplied:true});
function stamp(date,time) {
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
  const d=new Date(date+'T'+time+':00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date?d.getTime():null;
}
class ReservationRules {
  constructor(file){
    this.file=file;
    this.value=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):defaults();
    if(!this.value.defaultHoursApplied){
      const published=reservationDefaultHours();
      this.value.hours=this.value.hours.map((day,i)=>day===null?published[i]:day);
      this.value.defaultHoursApplied=true;this.value.revision++;
      fs.writeFileSync(file+'.tmp',JSON.stringify(this.value,null,2));fs.renameSync(file+'.tmp',file);
    }
  }
  get(){return structuredClone(this.value);}
  update(input){
    if(input.revision!==this.value.revision){const e=Error('Reservation settings changed in another tab. Reload before saving.');e.status=409;throw e;}
    const {totalTables,walkInTables}=input;
    if(totalTables!==null&&(!Number.isInteger(totalTables)||totalTables<1||totalTables>500))throw Error('Total tables must be 1–500 or left unconfigured.');
    if(walkInTables!==null&&(!Number.isInteger(walkInTables)||walkInTables<0||walkInTables>500))throw Error('Walk-in tables must be 0–500 or left unconfigured.');
    if(totalTables!==null&&walkInTables!==null&&walkInTables>totalTables)throw Error('Walk-in tables cannot exceed total tables.');
    if(input.durationMinutes!==120||input.noShowMinutes!==15)throw Error('Table duration is 120 minutes; no-show grace is 15 minutes.');
    if(!Array.isArray(input.hours)||input.hours.length!==7)throw Error('Configure all seven days or leave them unconfigured.');
    const hours=input.hours.map(day=>{
      if(day===null)return null;
      if(!day||typeof day.closed!=='boolean')throw Error('Invalid day settings.');
      if(day.closed)return {closed:true};
      if(stamp('2099-01-01',day.open)===null||stamp('2099-01-01',day.close)===null||day.open>=day.close)throw Error('Choose same-day opening and closing times; closing must be later.');
      return {closed:false,open:day.open,close:day.close};
    });
    const value={revision:this.value.revision+1,totalTables,walkInTables,durationMinutes:120,noShowMinutes:15,hours,defaultHoursApplied:true};
    fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(this.file+'.tmp',this.file);this.value=value;return this.get();
  }
  check(candidate,records){
    const rules=this.value,start=stamp(candidate.date,candidate.time),duration=candidate.durationMinutes || rules.durationMinutes,tables=candidate.tableCount ?? 1;
    if(start===null||!Number.isInteger(tables)||tables<1||tables>500)return {checked:false,allowed:false,warnings:['Choose a valid date, time and table count.']};
    const end=start+duration*60000,day=rules.hours[new Date(start).getUTCDay()],warnings=[];
    let hoursAllowed=true;
    if(day===null)warnings.push('Reservation hours are not configured for this day.');
    else if(day.closed){hoursAllowed=false;warnings.push('Reservations are closed on this day.');}
    else if(candidate.time<day.open||end>stamp(candidate.date,day.close)){hoursAllowed=false;warnings.push('The full two-hour booking must fit inside reservation service hours.');}
    const capacityConfigured=rules.totalTables!==null&&rules.walkInTables!==null;
    const capacity=capacityConfigured?rules.totalTables-rules.walkInTables:null;
    const events=[];
    for(const r of records){
      if(r.type!=='reservation'||!['confirmed','arrived'].includes(r.status)||r.id===candidate.id)continue;
      const otherStart=stamp(r.date,r.time);if(otherStart===null)continue;
      const otherEnd=otherStart+(r.durationMinutes||rules.durationMinutes)*60000;
      if(otherStart>=end||otherEnd<=start)continue;
      const count=r.tableCount??1;
      events.push({at:Math.max(start,otherStart),delta:count},{at:Math.min(end,otherEnd),delta:-count});
    }
    events.sort((a,b)=>a.at-b.at||a.delta-b.delta);
    let occupied=0,peak=0;for(const event of events){occupied+=event.delta;peak=Math.max(peak,occupied);}
    if(!capacityConfigured)warnings.push('Total tables and walk-in allowance are not fully configured.');
    const capacityAllowed=capacity===null||peak+tables<=capacity;
    if(!capacityAllowed)warnings.push('This booking would exceed reservation table capacity after protecting walk-in tables.');
    return {checked:true,allowed:hoursAllowed&&capacityAllowed,hoursConfigured:day!==null,capacityConfigured,reservableTables:capacity,walkInTables:rules.walkInTables,otherTablesAtPeak:peak,requestedTables:tables,durationMinutes:duration,warnings,customerMessage:!hoursAllowed?'That time falls outside our reservation service hours. Please choose another time.':!capacityAllowed?'That time is currently at reservation capacity. Please choose another time.':'This time may be requested, but restaurant staff must still confirm your reservation.'};
  }
  expired(record,now=Date.now()){
    if(record.type!=='reservation'||record.status!=='confirmed')return false;
    const scheduled=stamp(record.date,record.time);if(scheduled===null)return false;
    const local=localNow(now);
    return Date.parse(local+':00Z')>=scheduled+this.value.noShowMinutes*60000;
  }
}
module.exports={ReservationRules,stamp};
