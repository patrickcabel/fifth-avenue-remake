const http = require('node:http');
const crypto = require('node:crypto');
const {handleReservationTool}=require('./reservation-vapi.cjs');

function authorized(header, secret) {
  if (!secret || secret.length < 32 || typeof header !== 'string') return false;
  const actual = Buffer.from(header), expected = Buffer.from('Bearer ' + secret);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^[+\d\s().-]+$/.test(value)) return null;
  const digits=value.replace(/\D/g,'');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}
function normalizeName(value) {
  return typeof value === 'string' && value.length <= 100
    ? value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-CA') : '';
}

function summarizeOrder(r, now = Date.now()) {
  const hasEstimate = ['accepted','ready'].includes(r.status) && Number.isFinite(r.readyAt);
  const localTime = hasEstimate ? new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Edmonton',hour:'numeric',minute:'2-digit',timeZoneName:'short'
  }).format(r.readyAt) : null;
  const localDate = hasEstimate ? new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Edmonton',year:'numeric',month:'long',day:'numeric'
  }).format(r.readyAt) : null;
  const remaining = hasEstimate ? Math.max(0,Math.ceil((r.readyAt-now)/60000)) : null;
  let customerMessage = 'Your request is waiting for restaurant approval. A pickup time has not been confirmed yet.';
  if (r.status === 'accepted') {
    customerMessage = hasEstimate
      ? (r.readyAt > now
        ? 'The restaurant accepted your order. Your estimated pickup time is '+localTime+' on '+localDate+', about '+remaining+' minutes from now.'
        : 'The restaurant accepted your order. Its estimated pickup time was '+localTime+' on '+localDate+'. It has not yet been marked ready for pickup.')
      : 'The restaurant accepted your order, but no pickup time is available. Please check with staff.';
  } else if (r.status === 'ready') customerMessage = 'Your order is ready for pickup at the restaurant.';
  else if (r.status === 'completed') customerMessage = 'This order has been marked collected.';
  else if (r.status === 'declined') customerMessage = 'The restaurant declined this order.'+(r.reason ? ' Reason provided: '+r.reason : '');
  return {
    found:true,needsSelection:false,lookupOutcome:'order_found',orderId:r.id,orderReference:r.id,status:r.status,subtotalCents:r.subtotal,currency:'CAD',
    callbackLookupInstruction:'On a later call, ask for the customer name and callback phone number used for the order. No order reference is required.',
    pickupReadyAt:hasEstimate ? new Date(r.readyAt).toISOString() : null,
    pickupTimeLocal:localTime,pickupDateLocal:localDate,
    preparationMinutes:hasEstimate ? r.minutes : null,
    estimatedMinutesRemaining:remaining,
    timezone:'America/Edmonton',declineReason:r.reason || null,
    customerNotified:false,customerMessage,
    message:'An order was found. Answer using customerMessage; do not ask for another identifier or say the name and phone were insufficient. The time is already in Calgary local time. It is an estimate until status is ready. No payment or SMS has been sent.'
  };
}

function handleTools(store, payload, publish = () => {}, audit = () => {}) {
  if(store.autoCancelNoShows())publish();
  const message = payload?.message;
  if (message?.type !== 'tool-calls' || !Array.isArray(message.toolCallList) || !message.toolCallList.length || message.toolCallList.length > 10) throw Error('Expected a tool-calls message with 1–10 calls.');
  const callId = message.call?.id;
  if (typeof callId !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(callId)) throw Error('A valid Vapi call ID is required.');
  if (message.toolCallList.some(tool => !tool || typeof tool.id !== 'string' || !tool.id || tool.id.length > 150)) throw Error('Each tool requires a tool call ID.');
  return {results:message.toolCallList.map(tool => {
    const diagnostic={tool:tool.function?.name};
    try {
      let args = tool.function?.arguments ?? {};
      if (typeof args === 'string') args = JSON.parse(args);
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('Arguments must be an object.');
      let result;
      switch (tool.function?.name) {
        case 'get_reservation_context':
        case 'check_reservation_slot':
        case 'submit_reservation_request':
        case 'get_reservation_status':
          result=handleReservationTool(store,tool.function.name,args,callId,publish,normalizeName,normalizePhone);
          break;
        case 'get_pickup_status': {
          const pickup = store.pickup.get();
          result={
            ...pickup,
            acceptingOrders:!pickup.paused,
            status:pickup.paused ? 'paused' : 'open',
            customerMessage:pickup.paused
              ? 'New pickup orders are temporarily paused. We cannot take a new pickup order right now. Please try again later.'
              : 'We are currently accepting pickup orders. What would you like to order?',
            instruction:pickup.paused
              ? 'Tell the caller pickup is paused. Do not ask for dishes, collect a new order, or submit it. Existing orders can still be checked.'
              : 'You may take a pickup order. Search the live menu before offering dishes.',
            timezone:'America/Edmonton',delivery:'Use Skip or Uber Eats. This agent accepts pickup only.'
          };
          break;
        }
        case 'search_pickup_menu': {
          if (args.query !== undefined && (typeof args.query !== 'string' || args.query.length > 150)) throw Error('Use a short menu search.');
          const query=(args.query || '').toLowerCase().trim();
          const available=store.menu.list().filter(i=>i.available);
          const matches=available.filter(i=>(i.name+' '+i.category).toLowerCase().includes(query));
          result={items:matches.slice(0,20).map(({id,name,category,price})=>({menuId:id,name,category,priceCents:price})), totalMatches:matches.length, currency:'CAD', subtotalExcludesTax:true, instruction:'Search by dish or category if results are truncated. Do not invent ingredients or allergen assurances.'};
          break;
        }
        case 'submit_pickup_order': {
          if (args.customerConfirmed !== true) throw Error('Read back the complete order, customer name and callback number, then obtain confirmation first.');
          const existing=store.list().find(r=>r.type === 'order' && r.vapiCallId === callId);
          const order=store.create({
            type:'order', mode:'Pickup', name:args.name, phone:args.phone,
            items:args.items, note:args.note || '',
            requestKey:'vapi_'+crypto.createHash('sha256').update(callId).digest('hex')
          }, {source:'vapi', callId});
          if (!existing) publish();
          result=summarizeOrder(order);
          break;
        }
        case 'get_current_order_status': {
          let order;
          const supplied=value=>value !== undefined && value !== null && !(typeof value === 'string' && !value.trim());
          const hasSelection=supplied(args.orderId);
          const callbackLookup=supplied(args.name) || hasSelection || supplied(args.phone);
          Object.assign(diagnostic,{mode:callbackLookup?'callback':'same_call',nameProvided:supplied(args.name),phoneProvided:supplied(args.phone),selectionProvided:hasSelection});
          if (callbackLookup) {
            const name=normalizeName(args.name);
            const phone=normalizePhone(args.phone);
            if (!name || !phone) throw Error('Please provide the customer name and callback phone number used when placing the order.');
            const phoneMatches=store.list().filter(r=>r.type === 'order' && normalizePhone(r.phone) === phone);
            let matches=phoneMatches.filter(r=>normalizeName(r.name) === name);
            Object.assign(diagnostic,{phoneMatched:phoneMatches.length>0,exactNameMatched:matches.length>0});
            if (!matches.length && !name.includes(' ')) {
              const firstNameMatches=phoneMatches.filter(r=>normalizeName(r.name).split(' ')[0] === name);
              const fullNames=new Set(firstNameMatches.map(r=>normalizeName(r.name)));
              if (fullNames.size > 1) throw Error('Please confirm the full name used when placing the order.');
              matches=firstNameMatches;
              diagnostic.firstNameMatched=matches.length>0;
            }
            if (hasSelection) {
              if (typeof args.orderId !== 'string') throw Error('Invalid order selection.');
              const selection=args.orderId.trim().toUpperCase();
              matches=matches.filter(r=>r.id === selection);
            } else {
              const active=matches.filter(r=>['pending','accepted','ready'].includes(r.status));
              if (active.length) matches=active;
            }
            if (!matches.length) throw Error('Unable to verify an order with those details. Please check the name and phone number or contact restaurant staff.');
            if (matches.length > 1) {
              Object.assign(diagnostic,{outcome:'multiple_orders_found',matchCount:matches.length});
              result={
                found:true,needsSelection:true,lookupOutcome:'multiple_orders_found',matchCount:matches.length,status:'selection_required',
                candidates:matches.sort((a,b)=>b.createdAt-a.createdAt).slice(0,5).map(r=>({
                  orderId:r.id,
                  placedAtLocal:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(r.createdAt),
                  itemSummary:r.items.slice(0,3).map(i=>i.qty+' × '+i.name).join(', ')
                })),
                customerMessage:'I found more than one order under that name and phone number. Could you tell me approximately when you placed your order or what you ordered?',
                instruction:'The orders WERE FOUND. Do not say no order was found. Candidates are newest first. Ask the caller to identify the order using placement time or item summary; if they explicitly request their most recent order, select the first candidate. Then call get_current_order_status with that orderId and the SAME verified name and phone. Do not omit name and phone on this callback. If still ambiguous, refer to staff.'
              };
              break;
            }
            order=matches[0];
          } else {
            order=store.list().find(r=>r.type === 'order' && r.vapiCallId === callId);
            if (!order) throw Error('For an order from a previous call, ask for the customer name and callback phone number, then call this tool with both.');
          }
          Object.assign(diagnostic,{outcome:'order_found',status:order.status});
          result=summarizeOrder(order);
          break;
        }
        default: throw Error('Unsupported tool. This agent cannot change restaurant decisions.');
      }
      if(tool.function?.name === 'get_current_order_status') audit(diagnostic);
      return {toolCallId:tool.id, result:JSON.stringify(result)};
    } catch (error) {
      if(tool.function?.name === 'get_current_order_status') audit({...diagnostic,outcome:'lookup_error',reason:error.code || error.message});
      return {toolCallId:tool.id, error:(['ENOENT','EACCES','EPERM','ENOSPC'].includes(error.code) ? 'Unable to save or load restaurant data. Ask the caller to contact staff.' : error.message).replace(/[\r\n]+/g,' ')};
    }
  })};
}

function createWebhookServer(store, publish, secret) {
  return http.createServer(async (req,res) => {
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    if (req.url !== '/vapi/tools') return json(404,{error:'Not found.'});
    if (req.method !== 'POST') return json(405,{error:'POST required.'});
    if (!secret || secret.length < 32) return json(503,{error:'Vapi webhook is not configured.'});
    if (!authorized(req.headers.authorization,secret)) return json(401,{error:'Unauthorized.'});
    if (!req.headers['content-type']?.startsWith('application/json')) return json(415,{error:'JSON required.'});
    try {
      let body='';
      for await (const chunk of req) {
        body+=chunk;
        if(Buffer.byteLength(body)>65536) return json(413,{error:'Payload too large.'});
      }
      let payload;
      try { payload=JSON.parse(body); } catch { return json(400,{error:'Invalid JSON.'}); }
      return json(200,handleTools(store,payload,publish,entry=>console.log('[order-lookup]',JSON.stringify(entry))));
    } catch { return json(400,{error:'Invalid tool message.'}); }
  });
}
module.exports={authorized,handleTools,createWebhookServer,summarizeOrder,normalizePhone};
