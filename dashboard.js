(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const money = (cents) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initial = () => [
    { id: "ORD-1042", type: "order", name: "Alex Morgan", phone: "555-0101", mode: "Pickup", status: "pending", minutes: 25, items: [{ name: "Spicy Salmon Roll (8 pcs)", qty: 2, price: 1800 }, { name: "Miso Soup", qty: 2, price: 400 }], note: "Extra chopsticks, please.", createdAt: Date.now() },
    { id: "RES-208", type: "reservation", name: "Jamie Chen", phone: "555-0102", status: "pending", guests: 4, date: "Next Friday", time: "7:00 PM", note: "Birthday dinner. Window table if available.", createdAt: Date.now() },
    { id: "ORD-1041", type: "order", name: "Taylor Wilson", phone: "555-0103", mode: "Pickup", status: "accepted", minutes: 45, items: [{ name: "California Roll (8 pcs)", qty: 2, price: 1200 }, { name: "Chicken Karaage", qty: 1, price: 1200 }], note: "Customer will collect at the front counter.", createdAt: Date.now(), acceptedAt: Date.now() }
  ];
  let requests = [], connected = false, busy = false;
  let view = "all", historyType = "order", decliningId, noticeTimer, simulation = 0;
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/json" } });
    if(response.status===401){location.replace("/login.html");throw Error("Staff sign-in required.");}
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not save request.");
    return body;
  }
  async function refresh() {
    const incoming = await api("/api/requests");
    requests = incoming;
    connected = true;
    render();
  }
  async function decide(r, action, extra = {}) {
    if (busy || !connected) return false;
    busy = true; render();
    let saved = false;
    try {
      await api("/api/requests/" + r.id, { method: "PATCH", body: JSON.stringify({ revision:r.revision, action, ...extra }) });
      saved = true;
      await refresh();
      return true;
    } catch (error) {
      notify(saved ? "Decision saved, but the queue could not refresh. Reconnecting…" : error.message);
      try { await refresh(); } catch { connected = false; }
      return false;
    } finally { busy = false; render(); }
  }
  function pickupTime(r) {
    const readyAt = r.readyAt || (r.acceptedAt && r.acceptedAt + r.minutes * 60000);
    return readyAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" }).format(readyAt) + " Calgary time" : "";
  }
  function notify(message) { $("#notice").textContent = message; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $("#notice").textContent = ""; }, 6500); }
  function card(r) {
    const pending = r.status === "pending";
    const order = r.type === "order";
    const details = order ? '<div><strong>FULFILLMENT</strong>' + escape(r.mode) + '</div><div><strong>ESTIMATED TIME</strong>' + escape(r.minutes) + ' minutes after acceptance' + (r.status !== 'pending' ? ' · ' + escape(pickupTime(r)) : '') + '</div>' : '<div><strong>PARTY SIZE</strong>' + escape(r.guests) + ' guests</div><div><strong>REQUESTED TABLE</strong>' + escape(r.date) + ' · ' + escape(r.time) + '</div>';
    const items = order ? '<ul class="items">' + r.items.map(i => '<li><span>' + escape(i.qty) + ' × ' + escape(i.name) + (i.note ? '<small class="note" style="display:block">Request: ' + escape(i.note) + '</small>' : '') + '</span><span>' + money(i.qty * i.price) + '</span></li>').join("") + '</ul><div class="total"><span>Subtotal · before tax</span><strong>' + money(r.items.reduce((sum, i) => sum + i.qty * i.price, 0)) + '</strong></div>' : "";
    const timing = order ? '<label>Pickup ready in<select aria-label="Estimated time for ' + escape(r.id) + '" data-time="' + escape(r.id) + '">' + [15, 25, 30, 45, 60, 90].map(m => '<option value="' + m + '"' + (r.minutes === m ? ' selected' : '') + '>' + m + ' min</option>').join("") + '</select></label>' : '<span class="meta">Awaiting restaurant confirmation</span>';
    let actions = pending ? timing + '<button class="decline" data-action="decline" data-id="' + escape(r.id) + '">Decline</button><button class="primary" data-action="accept" data-id="' + escape(r.id) + '">' + (order ? "Accept order" : "Confirm reservation") + '</button>' : r.status === "accepted" ? '<span class="meta">Pickup by ' + escape(pickupTime(r)) + '</span><button class="primary" data-action="ready" data-id="' + escape(r.id) + '">Mark ready for pickup</button>' : r.status === "ready" ? '<span class="meta">Ready at the counter · ' + escape(pickupTime(r)) + '</span><button class="primary" data-action="complete" data-id="' + escape(r.id) + '">Mark collected</button>' : '<span class="meta">' + (r.status === "declined" ? 'Reason: ' + escape(r.reason) : r.status === "confirmed" ? 'Restaurant confirmed this booking.' : 'Order completed.') + '</span>';
    if (!order) {
      const editable=['pending','confirmed'].includes(r.status);
      if(editable) actions+='<button class="secondary" data-action="edit_reservation" data-id="'+escape(r.id)+'">Edit reservation</button><button class="decline" data-action="cancel_reservation" data-id="'+escape(r.id)+'">Cancel reservation</button>';
      if(r.status==='confirmed') actions+='<button class="primary" data-action="arrive" data-id="'+escape(r.id)+'">Mark arrived</button><button class="secondary" data-action="no_show" data-id="'+escape(r.id)+'">No-show</button>';
      if(r.status==='cancelled') actions='<span class="meta">Cancelled: '+escape(r.cancellationReason || '')+'</span>';
      if(r.status==='arrived') actions='<span class="meta">Guests marked as arrived.</span>';
      if(r.status==='no_show') actions='<span class="meta">Guests marked as a no-show.</span>';
    }
    if(!order && r.reservationCheck) actions+='<p class="note">'+escape((r.tableCount || 1)+' table(s) · 2-hour window. '+r.reservationCheck.warnings.join(' '))+'</p>';
    return '<article class="card"><div class="card-top"><span class="type ' + r.type + '">' + (order ? '↗ Pickup order' : '◷ Table reservation') + ' · ' + escape(r.id) + '</span><span class="badge ' + r.status + '">' + (pending ? 'Needs attention' : escape(r.status.replace(/_/g," "))) + '</span></div><h3>' + escape(r.name) + '</h3><div class="meta">' + escape(r.phone) + ' · ' + (r.source === 'vapi' ? 'Vapi phone agent' : r.source === 'staff' ? (order ? 'Staff-entered pickup request' : 'Staff-entered phone reservation') : 'Simulated phone agent request') + '</div><div class="details">' + details + '</div>' + (r.address ? '<p class="note">' + escape(r.address) + '</p>' : '') + items + '<p class="note">Guest note: ' + escape(r.note || "None") + '</p><div class="actions">' + actions + '</div></article>';
  }
  function render() {
    $("#connection").textContent = connected ? "Connected · saved on this computer" : "Disconnected · waiting for local server";
    $("#simulate").disabled = busy || !connected;
    $("#new-order").disabled = busy || !connected;
    $("#new-order").hidden = view === "reservation" || view === "history";
    $("#new-reservation").hidden = !["all","reservation"].includes(view);
    $("#new-reservation").disabled = busy || !connected;
    const pending = requests.filter(r => r.status === "pending");
    $("#pending-stat").textContent = pending.length;
    $("#active-stat").textContent = requests.filter(r => ["accepted", "ready"].includes(r.status)).length;
    $("#reservation-stat").textContent = requests.filter(r => r.status === "confirmed").length;
    $("#all-count").textContent = pending.length;
    for (const type of ["order", "reservation"]) $("#" + type + "-count").textContent = pending.filter(r => r.type === type).length;
    $("#queue-title").textContent = ({ all: "All requests", order: "Pickup orders", reservation: "Reservations", history: "Request history" })[view];
    const archived=['completed','declined','cancelled','arrived','no_show'];
    $('#history-filters').hidden=view!=='history';
    $('#pickup-history-count').textContent=requests.filter(r=>r.type==='order'&&archived.includes(r.status)).length;
    $('#reservation-history-count').textContent=requests.filter(r=>r.type==='reservation'&&archived.includes(r.status)).length;
    document.querySelectorAll('[data-history-type]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.historyType===historyType)));
    if(view==='history')$('#queue-title').textContent=historyType==='order'?'Pickup order history':'Reservation history';
    const query = $("#search").value.trim().toLowerCase();
    const visible = requests.filter(r => (view === "history" ? (r.type === historyType && ["completed", "declined", "cancelled", "arrived", "no_show"].includes(r.status)) : !["completed", "declined", "cancelled", "arrived", "no_show"].includes(r.status) && (view === "all" || view === r.type)) && (r.name + " " + r.id + " " + r.phone).toLowerCase().includes(query)).sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.createdAt - a.createdAt);
    $("#queue").innerHTML = visible.length ? visible.map(card).join("") : '<div class="empty">' + (query ? 'No matching requests.' : 'All caught up. No requests in this queue.') + '</div>';
    document.querySelectorAll("#queue button, #queue select").forEach(el => el.disabled = busy || !connected);
    window.dispatchEvent(new CustomEvent("service-data",{detail:{requests,view,connected}}));
  }
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
    view = button.dataset.view; document.querySelectorAll("[data-view]").forEach(b => { b.classList.toggle("active", b === button); b.setAttribute("aria-current", b === button ? "page" : "false"); }); render();
  }));
  document.querySelectorAll('[data-history-type]').forEach(button=>button.addEventListener('click',()=>{historyType=button.dataset.historyType;render();}));
  $("#search").addEventListener("input", render);
  $("#queue").addEventListener("change", async event => {
    const r = requests.find(r => r.id === event.target.dataset.time);
    if (r) await decide(r, "time", { minutes:Number(event.target.value) });
  });
  $("#queue").addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button || busy || !connected) return;
    const r = requests.find(r => r.id === button.dataset.id); if (!r) return;
    const action = button.dataset.action;
    if (action === "edit_reservation") { window.dispatchEvent(new CustomEvent("edit-reservation",{detail:{...r}})); return; }
    if (["arrive","no_show"].includes(action) && !window.confirm(action === "arrive" ? "Mark these guests as arrived?" : "Mark this reservation as a no-show?")) return;
    if (action === "decline" || action === "cancel_reservation") {
      decliningId = { id:r.id, revision:r.revision, action };
      $("#decline-dialog h2").textContent=action === "cancel_reservation" ? "Cancel reservation" : "Decline request";
      $("#decline-dialog label").firstChild.textContent=action === "cancel_reservation" ? "Cancellation reason" : "Reason for declining";
      $("#decline-form button[type=submit]").textContent=action === "cancel_reservation" ? "Cancel reservation" : "Decline request";
      $("#decline-reason").value = ""; $("#decline-reason").setCustomValidity("");
      $("#decline-dialog").showModal(); $("#decline-reason").focus(); return;
    }
    if (await decide(r, action)) notify(r.id + " updated. Customer notifications are not connected yet.");
  });
  $("#cancel-decline").addEventListener("click", () => $("#decline-dialog").close());
  $("#decline-form").addEventListener("submit", async event => {
    event.preventDefault();
    const reason = $("#decline-reason").value.trim();
    if (!reason) { $("#decline-reason").setCustomValidity("Enter a reason."); $("#decline-reason").reportValidity(); return; }
    if (await decide(decliningId, decliningId.action, {reason})) {
      $("#decline-dialog").close(); notify("Decision saved. No customer notification sent.");
    }
  });
  $("#decline-reason").addEventListener("input", event => event.target.setCustomValidity(""));
  $("#simulate").addEventListener("click", async () => {
    if (busy || !connected) return;
    const reservation = simulation++ % 2 === 1;
    const r = { ...initial()[reservation ? 1 : 0], name:reservation ? "Sam Rivera" : "Jordan Lee" };
    if (!reservation) r.items = [{menuId:"sushi-rolls-1",qty:2},{menuId:"appetizers-22",qty:2}];
    if (reservation) {r.date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);r.time='19:00';}
    busy = true; render();
    let saved = false;
    try {
      await api("/api/requests", {method:"POST", body:JSON.stringify(r)});
      saved = true;
      await refresh(); notify("Simulated " + r.type + " saved. Ready for review.");
    } catch(error) { notify(saved ? "Request saved. Queue will refresh on reconnect." : error.message); }
    finally { busy = false; render(); }
  });
  window.addEventListener('review-requests',()=>{view='all';$('#search').value='';document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view==='all');button.setAttribute('aria-current',button.dataset.view==='all'?'page':'false');});render();$('#queue-title').scrollIntoView({behavior:'smooth',block:'start'});});
  render();
  window.addEventListener("order-created", () => refresh().catch(() => { connected = false; render(); }));
  window.addEventListener("reservation-created", () => refresh().catch(() => { connected = false; render(); }));
  refresh().catch(() => notify("Start the local server with npm run dev to connect."));
  const updateQueue=()=>refresh().catch(()=>{connected=false;render();});
  window.addEventListener('service-connected',updateQueue);
  window.addEventListener('service-changed',updateQueue);
  window.addEventListener('service-offline',()=>{connected=false;render();});
})();
