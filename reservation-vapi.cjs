const crypto=require('node:crypto');
const {validateEdit}=require('./reservation-validation.cjs');
function reservationSummary(r) {
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(new Date(r.date+'T12:00:00Z'));
  const [hour,minute]=r.time.split(':').map(Number);
  const time=(hour%12 || 12)+':'+String(minute).padStart(2,'0')+(hour<12?' AM':' PM');
  let customerMessage='Your reservation request for '+r.guests+' guests on '+date+' at '+time+' Calgary time is waiting for restaurant approval. It is not confirmed yet.';
  if(r.status==='confirmed') customerMessage='The restaurant confirmed your reservation for '+r.guests+' guests on '+date+' at '+time+' Calgary time.';
  if(r.status==='declined') customerMessage='The restaurant declined your reservation request.'+(r.reason?' Reason provided: '+r.reason:'');
  if(r.status==='cancelled') customerMessage='The restaurant marked this reservation as cancelled.'+(r.cancellationReason?' Reason provided: '+r.cancellationReason:'');
  if(r.status==='arrived') customerMessage='The restaurant has marked the guests as arrived for this reservation.';
  if(r.status==='no_show') customerMessage='The restaurant has marked this reservation as a no-show. Please contact staff if this is incorrect.';
  return {found:true,needsSelection:false,reservationId:r.id,status:r.status,date:r.date,time:r.time,guests:r.guests,timezone:'America/Edmonton',customerMessage};
}
function handleReservationTool(store,name,args,callId,publish,normalizeName,normalizePhone) {
  if(name==='get_reservation_context') {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'long',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
    const rules=store.reservationRules.get();
    return {today:parts.year+'-'+parts.month+'-'+parts.day,currentTime:parts.hour+':'+parts.minute,weekday:parts.weekday,timezone:'America/Edmonton',acceptsRequests:true,availabilityChecked:false,durationMinutes:rules.durationMinutes,noShowGraceMinutes:rules.noShowMinutes,instruction:'You may collect a reservation request, not promise a table. Call check_reservation_slot after collecting date, time and party size. Explain the two-hour table duration and automatic cancellation 15 minutes after the booked time unless staff marks the guests arrived. Hours may be unconfigured: do not invent them. Restaurant staff must confirm.'};
  }
  if(name==='check_reservation_slot'){
    validateEdit({...args,name:'Reservation request',phone:'5550101',note:''});
    const check=store.reservationCheck({date:args.date,time:args.time,tableCount:1});
    return {...check,tableAssignment:'Provisional one-table estimate; restaurant staff must assign the correct number of tables for this party.'};
  }
  if(name==='submit_reservation_request') {
    if(args.customerConfirmed!==true) throw Error('Read back the name, phone, date, time, party size and notes, then obtain explicit approval before submitting.');
    const existing=store.list().find(r=>r.type==='reservation' && r.vapiCallId===callId);
    if(!existing){const check=store.reservationCheck({date:args.date,time:args.time,tableCount:1});if(!check.allowed)throw Error(check.customerMessage || check.warnings.join(' '));}
    const r=store.create({type:'reservation',name:args.name,phone:args.phone,date:args.date,time:args.time,guests:args.guests,note:args.note || '',requestKey:'vapi_res_'+crypto.createHash('sha256').update(callId).digest('hex')},{source:'vapi',callId});
    if(!existing)publish();
    return reservationSummary(r);
  }
  if(name==='get_reservation_status') {
    const supplied=v=>v!==undefined && v!==null && !(typeof v==='string'&&!v.trim());
    let reservation;
    if(supplied(args.name)||supplied(args.phone)||supplied(args.reservationId)) {
      const customer=normalizeName(args.name),phone=normalizePhone(args.phone);
      if(!customer||!phone) throw Error('Provide the reservation name and original callback phone number as strings.');
      const records=store.list().filter(r=>r.type==='reservation'&&normalizePhone(r.phone)===phone);
      let matches=records.filter(r=>normalizeName(r.name)===customer);
      if(!matches.length&&!customer.includes(' ')) {
        matches=records.filter(r=>normalizeName(r.name).split(' ')[0]===customer);
        if(new Set(matches.map(r=>normalizeName(r.name))).size>1) throw Error('Please confirm the full name used for the reservation.');
      }
      if(supplied(args.reservationId)) {
        if(typeof args.reservationId!=='string')throw Error('Invalid reservation selection.');
        matches=matches.filter(r=>r.id===args.reservationId.trim().toUpperCase());
      }
      if(!matches.length)throw Error('No reservation matched those details. Check the name and phone or contact staff.');
      if(matches.length>1) return {found:true,needsSelection:true,candidates:matches.sort((a,b)=>b.createdAt-a.createdAt).slice(0,10).map(r=>({reservationId:r.id,date:r.date,time:r.time,guests:r.guests})),customerMessage:'I found more than one reservation under those details. Which date and time are you checking?',instruction:'After the caller identifies a candidate, call again with the SAME verified name and phone plus its reservationId. Do not guess or treat this as no match.'};
      reservation=matches[0];
    } else reservation=store.list().find(r=>r.type==='reservation'&&r.vapiCallId===callId);
    if(!reservation)throw Error('For a reservation from an earlier call, ask for the reservation name and callback number, then send both.');
    return reservationSummary(reservation);
  }
  throw Error('Unsupported reservation tool.');
}
module.exports={handleReservationTool,reservationSummary};
