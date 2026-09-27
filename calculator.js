(() => {
  const cfg=window.VIVERO_CONFIG;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
  let cats=[],products=[],assocs=[],variants=[],settings={};
  let current={},selectedSpacing=null,customApproved=false,customMode=false;

  async function load(){
    const [cr,pr,ar,vr,sr]=await Promise.all([
      db.from('categories').select('*').eq('active',true).order('sort_order').order('name'),
      db.from('products').select('*').eq('active',true).order('sort_order').order('name'),
      db.from('product_categories').select('*').order('sort_order'),
      db.from('product_variants').select('*').eq('active',true).order('sort_order'),
      db.from('site_settings').select('*').eq('id',1).maybeSingle()
    ]);
    [cr,pr,ar,vr].forEach(r=>{if(r.error)throw r.error});
    cats=cr.data||[];products=pr.data||[];assocs=ar.data||[];variants=vr.data||[];settings=sr.data||{};

    const params=new URLSearchParams(location.search);
    renderCategories();
    if(params.get('category')&&cats.some(c=>c.id===params.get('category')))$('calcCategory').value=params.get('category');
    renderProducts();
    if(params.get('product')&&products.some(p=>p.id===params.get('product')))$('calcProduct').value=params.get('product');
    renderVariants();
    if(params.get('variant')&&variants.some(v=>v.id===params.get('variant')))$('calcVariant').value=params.get('variant');
    resetSpacing();
    calculate();
    renderCheckout();
    if(params.get('checkout')==='1')showCheckout();
  }

  function productListForCategory(){
    const ids=assocs.filter(a=>a.category_id===$('calcCategory').value).map(a=>a.product_id);
    return products.filter(p=>ids.includes(p.id));
  }
  function variantsForProduct(){
    return variants.filter(v=>v.product_id===$('calcProduct').value&&v.active&&v.availability==='in_stock')
      .sort((a,b)=>Number(a.liters??999999)-Number(b.liters??999999)||String(a.label).localeCompare(String(b.label),'es'));
  }
  function renderCategories(){$('calcCategory').innerHTML=cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
  function renderProducts(){$('calcProduct').innerHTML=productListForCategory().map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}
  function renderVariants(){
    const list=variantsForProduct();
    $('calcVariant').innerHTML=list.length?list.map(v=>{
      const liters=v.liters?`${Number(v.liters).toLocaleString('es-AR')} L`:'Única';
      return `<option value="${v.id}">${liters} — ${v.label} — ${money(v.price)}</option>`;
    }).join(''):`<option value="">Sin opciones en stock</option>`;
    $('addToCartBtn').disabled=!list.length;
  }

  function spacingValues(product){
    return [product?.spacing_1_cm,product?.spacing_2_cm,product?.spacing_3_cm].map(Number).filter(x=>x>0);
  }
  function resetSpacing(){
    customMode=false;customApproved=false;
    $('customSpacingWrap').hidden=true;$('customSpacingWarning').hidden=true;
    const product=products.find(p=>p.id===$('calcProduct').value);
    const vals=spacingValues(product);
    selectedSpacing=vals[0]||null;
    renderSpacingOptions();
  }
  function renderSpacingOptions(){
    const category=cats.find(c=>c.id===$('calcCategory').value);
    const product=products.find(p=>p.id===$('calcProduct').value);
    const linear=category?.calculation_mode==='linear';
    $('linearFields').hidden=!linear;$('unitFields').hidden=linear;
    if(!linear)return;
    const vals=spacingValues(product);
    $('spacingOptions').innerHTML=[
      ...vals.map((v,i)=>`<button type="button" class="spacing-chip ${!customMode&&Number(selectedSpacing)===Number(v)?'active':''}" data-spacing="${v}" data-index="${i+1}">${Number(v).toLocaleString('es-AR')} cm</button>`),
      `<button type="button" class="spacing-chip ${customMode?'active':''}" data-custom-spacing="1">Otra distancia</button>`
    ].join('');
  }

  function closureMonthsFor(variant,spacing){
    const product=products.find(p=>p.id===$('calcProduct').value);
    const vals=spacingValues(product);
    const idx=vals.findIndex(v=>Number(v)===Number(spacing));
    return idx<0?null:(variant?.[`closure_months_${idx+1}`]||null);
  }
  function updateClosureEstimate(variant){
    const box=$('closureEstimate');
    if(customMode){
      box.innerHTML=`<p><strong>Tiempo de cierre:</strong> sin estimación para una distancia personalizada.</p><small>El tiempo real depende de riego, suelo, fertilización, clima, poda, estado inicial de la planta y otros factores.</small>`;
      return;
    }
    const months=closureMonthsFor(variant,selectedSpacing);
    if(months){
      box.innerHTML=`<p><strong>Tiempo estimado de cierre:</strong> aprox. ${months} meses con ${Number(selectedSpacing).toLocaleString('es-AR')} cm entre plantas y la opción seleccionada.</p><small>El tiempo es estimativo y puede variar según los cuidados, el clima, el suelo, la fertilización, la poda y otros factores.</small>`;
    }else{
      box.innerHTML=`<p><strong>Tiempo estimado de cierre:</strong> todavía no cargado para esta combinación.</p><small>Podés consultar al vivero para una estimación más precisa.</small>`;
    }
  }

  function calculate(){
    const cid=$('calcCategory').value,pid=$('calcProduct').value,vid=$('calcVariant').value;
    const category=cats.find(c=>c.id===cid)||null;
    const product=products.find(p=>p.id===pid)||null;
    const assoc=assocs.find(a=>a.category_id===cid&&a.product_id===pid)||null;
    const variant=variants.find(v=>v.id===vid)||null;
    const linear=category?.calculation_mode==='linear';

    if(product){
      $('calcProductPreview').innerHTML=`${product.image_url?`<img src="${product.image_url}" alt="">`:''}<div><strong>${product.name}</strong><span>${product.description||''}</span></div>`;
    }
    $('selectedPresentation').textContent=variant?.label||'—';
    $('selectedOptionPrice').textContent=variant?`${variant.liters?`${Number(variant.liters).toLocaleString('es-AR')} L · `:''}${money(variant.price)}`:'—';

    let qty=0,spacing=null;
    if(linear){
      spacing=customMode?Number($('customSpacing').value||0):Number(selectedSpacing||0);
      const length=Number($('calcLength').value||0);
      qty=length>0&&spacing>0?Math.ceil((length*100)/spacing):0;
      updateClosureEstimate(variant);
    }else{
      qty=Math.max(1,Math.floor(Number($('calcQuantityInput').value||1)));
    }
    const unit=Number(variant?.price||0),total=qty*unit;
    $('resultQty').textContent=qty.toLocaleString('es-AR');
    $('resultUnitPrice').textContent=money(unit);
    $('resultTotal').textContent=money(total);
    $('addToCartBtn').disabled=!variant||qty<1||(linear&&customMode&&!customApproved);
    current={category,product,assoc,variant,quantity:qty,total,linear,spacing};
  }

  function addCurrentToCart(){
    calculate();
    if(!current.variant||current.quantity<1)return;
    window.ViveroCart.add({
      product_id:current.product.id,variant_id:current.variant.id,category_id:current.category.id,
      product_name:current.product.name,variant_label:current.variant.label,liters:current.variant.liters,
      category_name:current.category.name,quantity:current.quantity,unit_price:Number(current.variant.price),
      image_url:current.product.image_url||'',length_m:current.linear?Number($('calcLength').value):null,
      spacing_cm:current.linear?Number(current.spacing):null
    });
    $('addedChoice').hidden=false;$('addedChoice').scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function renderCheckout(){
    const items=window.ViveroCart.get();
    $('checkoutItems').innerHTML=items.length?items.map(x=>`
      <div class="checkout-item" data-cart-id="${x.id}">
        ${x.image_url?`<img src="${x.image_url}" alt="">`:`<div class="checkout-placeholder">MP</div>`}
        <div class="checkout-item-copy"><strong>${x.product_name}</strong><span>${x.category_name} · ${x.variant_label}${x.liters?` · ${x.liters} L`:''}</span>${x.length_m?`<span>${x.length_m} m · distancia ${x.spacing_cm} cm</span>`:''}</div>
        <label>Cantidad<input class="checkout-qty" type="number" min="1" value="${x.quantity}" data-qty-id="${x.id}"></label>
        <strong class="checkout-subtotal">${money(Number(x.unit_price)*Number(x.quantity))}</strong>
        <button class="checkout-remove" type="button" data-remove-id="${x.id}">Eliminar</button>
      </div>`).join(''):`<div class="cart-empty">El carrito está vacío. Podés volver al catálogo y agregar plantas.</div>`;
    $('checkoutTotal').textContent=money(window.ViveroCart.total());
    $('confirmWhatsappBtn').disabled=!items.length;
  }
  function showCheckout(){$('checkoutSection').hidden=false;renderCheckout();setTimeout(()=>$('checkoutSection').scrollIntoView({behavior:'smooth',block:'start'}),80)}

  $('calcCategory').addEventListener('change',()=>{renderProducts();renderVariants();resetSpacing();calculate()});
  $('calcProduct').addEventListener('change',()=>{renderVariants();resetSpacing();calculate()});
  $('calcVariant').addEventListener('change',calculate);
  $('calcLength').addEventListener('input',calculate);
  $('calcQuantityInput').addEventListener('input',calculate);

  $('spacingOptions').addEventListener('click',e=>{
    const recommended=e.target.closest('[data-spacing]');
    const custom=e.target.closest('[data-custom-spacing]');
    if(recommended){
      selectedSpacing=Number(recommended.dataset.spacing);customMode=false;customApproved=false;
      $('customSpacingWrap').hidden=true;$('customSpacingWarning').hidden=true;renderSpacingOptions();calculate();
    }
    if(custom){
      customMode=true;customApproved=false;selectedSpacing=null;
      $('customSpacingWrap').hidden=false;$('customSpacingWarning').hidden=false;$('customSpacing').value='';
      renderSpacingOptions();calculate();
    }
  });
  $('customSpacing').addEventListener('input',()=>{customApproved=false;$('customSpacingWarning').hidden=false;calculate()});
  $('approveCustomSpacing').addEventListener('click',()=>{if(Number($('customSpacing').value||0)<=0)return;customApproved=true;$('customSpacingWarning').hidden=true;calculate()});
  $('backToRecommended').addEventListener('click',()=>{
    customMode=false;customApproved=false;$('customSpacingWrap').hidden=true;$('customSpacingWarning').hidden=true;
    const p=products.find(x=>x.id===$('calcProduct').value);selectedSpacing=spacingValues(p)[0]||null;renderSpacingOptions();calculate();
  });

  $('addToCartBtn').addEventListener('click',addCurrentToCart);
  $('keepShoppingBtn').addEventListener('click',()=>{location.href='./#catalogo'});
  $('continueOrderBtn').addEventListener('click',showCheckout);
  $('clearCartBtn').addEventListener('click',()=>{if(confirm('¿Eliminar todos los artículos del carrito?')){window.ViveroCart.clear();renderCheckout()}});
  window.addEventListener('viverocartchange',renderCheckout);
  $('checkoutItems').addEventListener('input',e=>{if(e.target.matches('.checkout-qty'))window.ViveroCart.updateQty(e.target.dataset.qtyId,e.target.value)});
  $('checkoutItems').addEventListener('click',e=>{if(e.target.dataset.removeId){window.ViveroCart.remove(e.target.dataset.removeId);renderCheckout()}});

  $('orderForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const cart=window.ViveroCart.get();if(!cart.length)return;
    const btn=$('confirmWhatsappBtn');btn.disabled=true;$('orderMessage').textContent='Registrando solicitud...';
    try{
      const payload=cart.map(x=>({product_id:x.product_id,variant_id:x.variant_id,category_id:x.category_id,quantity:Number(x.quantity),length_m:x.length_m||null,spacing_cm:x.spacing_cm||null}));
      const {data,error}=await db.rpc('create_cart_order',{p_customer_name:$('customerName').value.trim(),p_shipping_address:$('customerAddress').value.trim(),p_postal_code:$('customerPostal').value.trim(),p_general_question:$('customerQuestion').value.trim(),p_items:payload});
      if(error)throw error;
      const order=Array.isArray(data)?data[0]:data,code=order.order_code;
      const lines=[
        `Hola Mi Primavera. Quiero confirmar la solicitud ${code}.`,'',
        `Cliente: ${$('customerName').value.trim()}`,`Dirección: ${$('customerAddress').value.trim()}`,`CP: ${$('customerPostal').value.trim()}`,'','ARTÍCULOS:',
        ...cart.map((x,i)=>`${i+1}. ${x.product_name} · ${x.variant_label}${x.liters?` · ${x.liters} L`:''} · Cant.: ${x.quantity} · ${money(Number(x.unit_price)*Number(x.quantity))}`),
        '',`Total estimado: ${money(cart.reduce((s,x)=>s+Number(x.unit_price)*Number(x.quantity),0))}`,
        $('customerQuestion').value.trim()?`Consulta: ${$('customerQuestion').value.trim()}`:null
      ].filter(x=>x!==null);
      const digits=String(settings.whatsapp||'').replace(/\D/g,'');
      window.ViveroCart.clear();$('orderMessage').textContent=`Solicitud ${code} registrada. Abriendo WhatsApp...`;
      if(!digits)throw new Error(`La solicitud ${code} quedó registrada, pero falta configurar el WhatsApp del vivero en el panel.`);
      setTimeout(()=>{location.href=`https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`},400);
    }catch(err){console.error(err);$('orderMessage').textContent=err.message||'No se pudo registrar la solicitud.';btn.disabled=false}
  });

  load().catch(err=>{console.error(err);$('orderMessage').textContent='No se pudo cargar la calculadora.'});
})();
