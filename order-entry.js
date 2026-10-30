(() => {
  const $ = s=>document.querySelector(s);
  const escape = value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=cents=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents/100);
  let menu=[], cart=[], saving=false, paused=false, lastSignature='', requestKey='';
  function renderMenu() {
    const search=$('#dish-search').value.toLowerCase().trim();
    const matches=menu.filter(i=>(i.name+' '+i.category).toLowerCase().includes(search));
    $('#dish-list').innerHTML=matches.length ? matches.map(i=>'<div class="dish"><div><small>'+escape(i.category)+'</small><strong>'+escape(i.name)+'</strong><span>'+money(i.price)+'</span>'+(!i.available?'<span class="sold-out-text">Sold out · temporarily unavailable</span>':'')+'</div><button type="button" class="secondary" data-add="'+i.id+'" '+(!i.available?'disabled ':'')+'aria-label="'+(i.available?'Add ':'Sold out: ')+escape(i.name)+'">'+(i.available?'Add':'Sold out')+'</button></div>').join('') : '<p class="note">No matching dishes.</p>';
  }
  function renderCart() {
    $('#cart').innerHTML=cart.length ? cart.map(line=>{
      const item=menu.find(i=>i.id===line.menuId);
      return '<div class="cart-line"><strong>'+escape(item.name)+'</strong>'+(!item.available?'<p class="sold-out-text">Sold out · remove this dish to continue.</p>':'')+'<label>Quantity<input type="number" min="1" max="99" step="1" value="'+line.qty+'" data-qty="'+item.id+'"></label><label>Item requests<input maxlength="300" data-note="'+item.id+'" value="'+escape(line.note)+'" placeholder="For staff to review"></label><div class="cart-line-footer"><span>'+money(item.price*line.qty)+'</span><button type="button" class="decline" data-remove="'+item.id+'">Remove</button></div></div>';
    }).join('') : '<p class="note">Add dishes from the menu to begin.</p>';
    $('#cart-total').textContent=money(cart.reduce((sum,line)=>sum+menu.find(i=>i.id===line.menuId).price*line.qty,0));
    $('#submit-order').disabled=!cart.length || saving || paused || cart.some(line=>!menu.find(i=>i.id===line.menuId)?.available);
  }
  $('#new-order').addEventListener('click', async()=>{
    $('#order-form').reset(); $('#order-error').textContent=''; cart=[]; lastSignature='';requestKey='';
    $('#order-dialog').showModal(); $('#dish-list').textContent='Loading menu…'; renderCart();
    try {
      const response=await fetch('/api/staff/menu',{signal:AbortSignal.timeout(8000)});
      if(!response.ok) throw Error('Menu unavailable. Restart the backend and try again.');
      menu=await response.json(); renderMenu();
    } catch(error) { $('#dish-list').textContent=''; $('#order-error').textContent=error.message; }
  });
  $('#cancel-order').addEventListener('click',()=>{if(!saving) $('#order-dialog').close();});
  $('#order-dialog').addEventListener('cancel',event=>{if(saving) event.preventDefault();});
  $('#dish-search').addEventListener('input',renderMenu);
  $('#dish-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-add]'); if(!button || saving) return;
    if (!menu.find(i=>i.id===button.dataset.add)?.available) return;
    const existing=cart.find(i=>i.menuId===button.dataset.add);
    if(existing) existing.qty=Math.min(99,existing.qty+1);
    else cart.push({menuId:button.dataset.add,qty:1,note:''});
    renderCart();
  });
  $('#cart').addEventListener('click',event=>{
    const button=event.target.closest('[data-remove]'); if(!button || saving) return;
    cart=cart.filter(i=>i.menuId!==button.dataset.remove); renderCart();
  });
  $('#cart').addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.note) cart.find(i=>i.menuId===input.dataset.note).note=input.value;
  });
  $('#cart').addEventListener('change',event=>{
    const input=event.target; if(!input.dataset.qty || saving) return;
    if(!input.checkValidity()) { input.reportValidity(); return; }
    cart.find(i=>i.menuId===input.dataset.qty).qty=Number(input.value); renderCart();
  });
  $('#order-form').addEventListener('submit',async event=>{
    event.preventDefault(); if(saving || paused || !cart.length || cart.some(line=>!menu.find(i=>i.id===line.menuId)?.available)) return;
    const form=new FormData(event.target);
    saving=true; $('#order-error').textContent='';
    const controls=[...event.target.querySelectorAll('input,textarea,button')];
    controls.forEach(el=>el.disabled=true);
    try {
      const payload={type:'order',mode:'Pickup',source:'staff',name:form.get('customer'),phone:form.get('phone'),note:form.get('notes'),items:cart};
      const signature=JSON.stringify(payload);
      if(signature!==lastSignature) {requestKey=crypto.randomUUID();lastSignature=signature;}
      const response=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,requestKey})});
      const body=await response.json();
      if(!response.ok) throw Error(body.error || 'Order could not be saved.');
      $('#order-dialog').close(); window.dispatchEvent(new Event('order-created'));
    } catch(error) { $('#order-error').textContent=error.message+' Your draft is still here.'; }
    finally { saving=false; controls.forEach(el=>el.disabled=false); renderCart(); }
  });

  window.addEventListener('pickup-status',event=>{
    paused=event.detail.paused;
    document.querySelector('#order-pickup-status').textContent=paused?'Pickup is paused. Your draft will remain here until service resumes.':'';
    renderCart();
  });
  async function updateMenu() {
    if(!$('#order-dialog').open || saving) return;
    try {
      const response=await fetch('/api/staff/menu',{signal:AbortSignal.timeout(8000)});
      if(!response.ok) return;
      const latest=await response.json();
      if(JSON.stringify(latest)!==JSON.stringify(menu)) {
        menu=latest; renderMenu(); renderCart();
      }
    } catch { /* Submission still checks current availability on the server. */ }
  }
  window.addEventListener('service-connected',updateMenu);
  window.addEventListener('service-changed',updateMenu);
})();
