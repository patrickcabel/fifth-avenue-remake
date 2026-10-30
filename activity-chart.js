/* Arrival counts are intentionally separate from occupancy or capacity. */
function buildArrivalSeries(records, day) {
  const hours=Array.from({length:24},(_,hour)=>({hour,confirmed:0,pending:0,confirmedBookings:0,pendingBookings:0}));
  let undated=0;
  for(const r of records) {
    if(r.type!=='reservation' || !['confirmed','pending','arrived'].includes(r.status)) continue;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) {undated++;continue;}
    if(r.date!==day) continue;
    let hour;
    const time=String(r.time || '').trim();
    const canonical=time.match(/^([01]\d|2[0-3]):[0-5]\d$/);
    const legacy=time.match(/^(1[0-2]|[1-9]):[0-5]\d\s*(AM|PM)$/i);
    if(canonical) hour=Number(canonical[1]);
    else if(legacy) hour=Number(legacy[1])%12+(legacy[2].toUpperCase()==='PM'?12:0);
    if(hour===undefined || !Number.isInteger(r.guests) || r.guests<1) continue;
    const bucket=r.status==='arrived'?'confirmed':r.status;
    hours[hour][bucket]+=r.guests;
    hours[hour][bucket+'Bookings']++;
  }
  return {hours,undated};
}
if(typeof module!=='undefined') module.exports={buildArrivalSeries};
if(typeof document!=='undefined') (()=>{
  const $=s=>document.querySelector(s);
  let records=[],connected=false,series;
  const label=hour=>(hour%12 || 12)+(hour<12?' AM':' PM');
  function today() {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
  }
  $('#activity-date').value=today();
  function describe(hour) {
    const h=series.hours[hour];
    $('#activity-detail').textContent=label(hour)+': '+h.confirmed+' confirmed guests in '+h.confirmedBookings+' booking(s); '+h.pending+' guests in pending requests.';
  }
  function render() {
    const day=$('#activity-date').value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    series=buildArrivalSeries(records,day);
    const hours=series.hours,showPending=$('#activity-pending').checked;
    const guests=hours.reduce((sum,h)=>sum+h.confirmed,0);
    const pending=hours.reduce((sum,h)=>sum+h.pending,0);
    const bookings=hours.reduce((sum,h)=>sum+h.confirmedBookings,0);
    const peak=Math.max(...hours.map(h=>h.confirmed));
    const peakHours=hours.filter(h=>h.confirmed===peak);
    $('#activity-guests').textContent=guests;
    $('#activity-bookings').textContent=bookings;
    $('#activity-peak').textContent=peak?label(peakHours[0].hour)+(peakHours.length>1?' + ties':''):'—';
    $('#activity-detail').textContent='Point to a bar or use Tab to inspect an hour.';
    $('#activity-empty').textContent=guests+pending===0?'No confirmed or pending reservations for this date.':pending+' guests in pending requests; not yet confirmed.';
    $('#activity-connection').textContent=(!connected?'Disconnected: showing the last loaded reservation data. ':'')+(series.undated?series.undated+' older reservation(s) have no calendar date and are excluded.':'');
    const max=Math.max(4,...hours.map(h=>h.confirmed+(showPending?h.pending:0)));
    const step=Math.max(1,Math.ceil(max/4)),ceiling=step*4;
    const W=960,H=240,left=42,right=12,top=12,bottom=36,plotH=H-top-bottom,slot=(W-left-right)/24;
    const y=value=>top+plotH-value/ceiling*plotH;
    let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-labelledby="arrival-chart-title arrival-chart-description"><title id="arrival-chart-title">Expected reservation arrivals by hour</title><desc id="arrival-chart-description">Gold bars show confirmed guests. Terracotta bars show pending guests when enabled. Hourly numbers are also available in the table below.</desc>';
    for(let n=0;n<=4;n++) {
      const count=n*step,at=y(count);
      svg+='<line x1="'+left+'" y1="'+at+'" x2="'+(W-right)+'" y2="'+at+'" class="activity-grid"/><text x="'+(left-10)+'" y="'+(at+4)+'" text-anchor="end">'+count+'</text>';
    }
    hours.forEach(h=>{
      const x=left+h.hour*slot+5,width=slot-10,p=showPending?h.pending:0;
      const desc=label(h.hour)+': '+h.confirmed+' confirmed guests, '+h.pending+' pending guests';
      svg+='<g tabindex="0" data-hour="'+h.hour+'" aria-label="'+desc+'"><title>'+desc+'</title><rect x="'+(x-3)+'" y="'+top+'" width="'+(width+6)+'" height="'+plotH+'" fill="transparent"/>';
      svg+='<rect x="'+x+'" y="'+y(h.confirmed)+'" width="'+width+'" height="'+h.confirmed/ceiling*plotH+'" rx="3" class="arrival-confirmed"/>';
      if(p) svg+='<rect x="'+x+'" y="'+y(h.confirmed+p)+'" width="'+width+'" height="'+p/ceiling*plotH+'" rx="3" class="arrival-pending"/>';
      svg+='</g>';
      if(h.hour%3===0) svg+='<text x="'+(x+width/2)+'" y="'+(H-12)+'" text-anchor="middle">'+label(h.hour)+'</text>';
    });
    $('#activity-chart').innerHTML=svg+'</svg>';
    $('#activity-table').innerHTML='<table><caption>Guest arrivals for '+day+' · Calgary time</caption><thead><tr><th scope="col">Hour</th><th scope="col">Confirmed guests</th><th scope="col">Pending guests</th></tr></thead><tbody>'+hours.map(h=>'<tr><th scope="row">'+label(h.hour)+'</th><td>'+h.confirmed+'</td><td>'+h.pending+'</td></tr>').join('')+'</tbody></table>';
  }
  window.addEventListener('service-data',event=>{
    records=event.detail.requests;connected=event.detail.connected;
    $('#activity-panel').hidden=!['all','reservation'].includes(event.detail.view);
    render();
  });
  $('#activity-date').addEventListener('change',render);
  $('#activity-pending').addEventListener('change',render);
  $('#activity-today').addEventListener('click',()=>{$('#activity-date').value=today();render();});
  function shift(amount) {
    const day=$('#activity-date').value || today();
    const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+amount);
    $('#activity-date').value=date.toISOString().slice(0,10);render();
  }
  $('#activity-prev').addEventListener('click',()=>shift(-1));
  $('#activity-next').addEventListener('click',()=>shift(1));
  for(const event of ['mouseover','focusin']) $('#activity-chart').addEventListener(event,e=>{
    const bar=e.target.closest('[data-hour]');if(bar)describe(Number(bar.dataset.hour));
  });
  render();
})();
