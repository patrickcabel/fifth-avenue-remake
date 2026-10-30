/* Published restaurant hours; Sunday is index 0. */
function reservationDefaultHours() {
  return Array.from({length:7},(_,day)=>({closed:false,open:day===0||day===6?'12:00':'11:00',close:'21:00'}));
}
if(typeof module!=='undefined')module.exports={reservationDefaultHours};
if(typeof window!=='undefined')window.reservationDefaultHours=reservationDefaultHours;
