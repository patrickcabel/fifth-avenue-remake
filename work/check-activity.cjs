const assert=require('node:assert/strict');
const {buildArrivalSeries}=require('../activity-chart.js');
const reservation={type:'reservation',date:'2026-11-06',time:'19:30',guests:4,status:'confirmed'};
const result=buildArrivalSeries([
  reservation,
  {...reservation,time:'19:00',guests:2},
  {...reservation,status:'pending',guests:6},
  {...reservation,status:'declined',guests:20},
  {...reservation,type:'order',guests:20},
  {...reservation,date:'2026-11-07',guests:20},
  {...reservation,date:'Next Friday'},
  {...reservation,time:'12:00 AM',guests:3},
  {...reservation,time:'12:00 PM',guests:5},
  {...reservation,time:'7:00 PM',guests:1},
  {...reservation,time:'bad',guests:30},
  {...reservation,time:'19:00',guests:'4'}
],'2026-11-06');
assert.equal(result.hours.length,24);
assert.equal(result.hours[19].confirmed,7);
assert.equal(result.hours[19].confirmedBookings,3);
assert.equal(result.hours[19].pending,6);
assert.equal(result.hours[0].confirmed,3);
assert.equal(result.hours[12].confirmed,5);
assert.equal(result.undated,1);
assert.equal(buildArrivalSeries([],'2026-11-06').hours.every(h=>h.confirmed===0&&h.pending===0),true);
assert.equal(buildArrivalSeries([{...reservation,status:'pending'}],'2026-11-06').hours[19].confirmed,0);
console.log('PASS: hourly arrival totals, booking counts, pending separation, date filtering, legacy times, empty days, invalid records');
