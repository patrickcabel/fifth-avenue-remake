const fs=require('node:fs'),path=require('node:path');
const empty={type:'object',properties:{},additionalProperties:false};
const tools=[
  {name:'check_reservation_slot',description:'Check a proposed reservation date, time and guest count against service hours and table capacity. This is a provisional one-table estimate, not confirmation; staff must assign tables.',parameters:{type:'object',properties:{
    date:{type:'string',description:'Future Calgary calendar date YYYY-MM-DD.'},time:{type:'string',description:'24-hour Calgary time HH:mm.'},guests:{type:'integer',minimum:1,maximum:30}
  },required:['date','time','guests'],additionalProperties:false}},
  {name:'get_reservation_context',description:'Get the current Calgary date and time before taking a reservation request. This does not check table capacity or confirm availability.',parameters:empty},
  {name:'submit_reservation_request',description:'Submit one pending reservation request per call after customer read-back approval. Staff must confirm. Retry with identical details.',parameters:{type:'object',properties:{
    name:{type:'string'},phone:{type:'string'},date:{type:'string',description:'Exact future date YYYY-MM-DD in Calgary, confirmed with the caller.'},time:{type:'string',description:'24-hour Calgary time HH:mm.'},guests:{type:'integer',minimum:1,maximum:30},note:{type:'string'},customerConfirmed:{type:'boolean'}
  },required:['name','phone','date','time','guests','customerConfirmed'],additionalProperties:false}},
  {name:'get_reservation_status',description:'Check restaurant confirmation or decline of a reservation. For callbacks, send name and phone; if multiple matches, clarify date/time and resend both plus the selected reservationId. Omit all fields for a request submitted this call.',parameters:{type:'object',properties:{
    name:{type:'string'},phone:{type:'string'},reservationId:{type:'string',description:'Optional internal selection from returned candidates. Always include name and phone when using this.'}
  },additionalProperties:false}},
  {name:'get_pickup_status',description:'Check whether the restaurant is accepting pickup orders. Call before taking an order.',parameters:empty},
  {name:'search_pickup_menu',description:'Find available pickup dishes and authoritative CAD prices. Use returned menuId values in orders; narrow the query when results are truncated.',parameters:{type:'object',properties:{query:{type:'string',description:'Dish name or category, such as salmon roll, ramen, or appetizers.'}},additionalProperties:false}},
  {name:'submit_pickup_order',description:'Submit one pickup request per call only after reading it back and receiving explicit customer approval. It remains pending until staff accepts. Retry interrupted calls with identical arguments.',parameters:{type:'object',properties:{
    name:{type:'string',description:'Confirmed customer name.'},phone:{type:'string',description:'Confirmed callback number, digits and optional +, spaces, parentheses or hyphens.'},
    customerConfirmed:{type:'boolean',description:'True only after the customer explicitly approves the read-back.'},
    note:{type:'string',description:'Order-level requests for staff review.'},
    items:{type:'array',minItems:1,maxItems:50,items:{type:'object',properties:{menuId:{type:'string'},qty:{type:'integer',minimum:1,maximum:99},note:{type:'string',description:'Required dish choices or special requests; staff must review.'}},required:['menuId','qty'],additionalProperties:false}}
  },required:['name','phone','customerConfirmed','items'],additionalProperties:false}},
  {name:'get_current_order_status',description:'Check pickup order status using customer name and original callback number on a later call. No reference is required. If multiple orders match, ask which placement date/time and select the returned orderId. Omit parameters for this call’s new order.',parameters:{type:'object',properties:{
    name:{type:'string',description:'Customer name used when placing the order. Required with phone for callbacks.'},
    phone:{type:'string',description:'Original callback phone number. Required with name for callbacks.'},
    orderId:{type:'string',description:'Optional internal selection from returned candidates if multiple orders match. Never require the caller to provide a reference.'}
  },additionalProperties:false}}
].map(fn=>({type:'function',async:false,function:fn,server:{url:'https://YOUR-TUNNEL.trycloudflare.com/vapi/tools',credentialId:'YOUR_VAPI_CUSTOM_CREDENTIAL_ID'}}));
const json=JSON.stringify(tools,null,2)+'\n';
fs.writeFileSync(path.join(__dirname,'../integrations/vapi/tools.json'),json);
fs.mkdirSync(path.join(__dirname,'../outputs/vapi'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'../outputs/vapi/tools.json'),json);
for(const file of ['assistant-prompt.txt','reservation-prompt.txt','SETUP.md']) fs.copyFileSync(path.join(__dirname,'../integrations/vapi',file),path.join(__dirname,'../outputs/vapi',file));
console.log('Vapi tool templates and setup guide prepared. Replace URL and credential placeholders before use.');
