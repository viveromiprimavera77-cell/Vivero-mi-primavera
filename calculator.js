(() => {
  const cfg=window.VIVERO_CONFIG;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
  let cats=[],products=[],assocs=[],variants=[],holeRecommendations=[],settings={};
  let current={},selectedSpacing=null,customApproved=false,customMode=false;
  function numericFromText(value){const m=String(value||'').replace(',','.').match(/\d+(?:\.\d+)?/);return m?Number(m[0]):999999}
  function isAreaCategory(category){return category?.calculation_mode==='area'||category?.slug==='grama'}
  function isMaterialCategory(category){return category?.slug==='otros'}
  function normalizeText(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
  function isBarkProduct(product){
    return normalizeText(product?.slug||product?.name).includes('corteza');
  }
  function firstProductImage(product){
    return product?.image_url||product?.integrated_image_url||product?.info_image_url||'';
  }
  function volumeTextDm3(value){
    const dm3=Number(value||0);
    if(!dm3)return 'Sin volumen configurado';
    if(dm3>=1000)return `${(dm3/1000).toLocaleString('es-AR',{maximumFractionDigits:2})} m³`;
    return `${dm3.toLocaleString('es-AR',{maximumFractionDigits:2})} dm³`;
  }
  function dimensionsAreaM2(value){
    const text=String(value||'').toLowerCase().replace(/,/g,'.');
    const nums=text.match(/\d+(?:\.\d+)?/g)||[];
    if(nums.length<2)return 0;
    let a=Number(nums[0]),b=Number(nums[1]);
    if(!(a>0&&b>0))return 0;
    const explicitMeters=/\bm\b/.test(text)&&!text.includes('cm');
    if(!explicitMeters){a/=100;b/=100}
    return a*b;
  }
  function presentationText(v,category=null){
    if(!v)return '—';
    if(isAreaCategory(category)&&v.height)return `${v.label} · ${v.height}`;
    if(isMaterialCategory(category))return `${v.label}${v.liters?` · ${volumeTextDm3(v.liters)}`:''}`;
    return `${v.label}${v.liters?` · ${Number(v.liters).toLocaleString('es-AR')} L`:''}`;
  }
  function prioritizesHeight(product,list){return !!product?.prioritize_height || (list?.length>0 && list.every(v=>!v.liters) && list.some(v=>v.height))}
  function optionText(v,p,category=null){
    if(!v)return '';
    if(isAreaCategory(category)){
      return `${v.height||'Sin dimensiones'} — ${v.label} — ${money(v.price)}`;
    }
    if(isMaterialCategory(category)){
      return `${v.label} · ${volumeTextDm3(v.liters)} — ${money(v.price)}`;
    }
    if(prioritizesHeight(p, variants.filter(x=>x.product_id===p?.id&&x.active&&x.availability==='in_stock'))){
      return `${v.height||'Sin altura'} — ${presentationText(v,category)} — ${money(v.price)}`;
    }
    const size=v.liters?`${Number(v.liters).toLocaleString('es-AR')} L`:v.height?`Alt. ${v.height}`:'Opción única';
    return `${size} — ${v.label} — ${money(v.price)}`;
  }

  async function load(){
    const [cr,pr,ar,vr,hr,sr]=await Promise.all([
      db.from('categories').select('*').eq('active',true).order('sort_order').order('name'),
      db.from('products').select('*').eq('active',true).order('sort_order').order('name'),
      db.from('product_categories').select('*').order('sort_order'),
      db.from('product_variants').select('*').eq('active',true).order('sort_order'),
      db.from('hole_recommendations').select('*').eq('active',true).order('liters'),
      db.from('site_settings').select('*').eq('id',1).maybeSingle()
    ]);
    [cr,pr,ar,vr,hr].forEach(r=>{if(r.error)throw r.error});
    cats=cr.data||[];products=pr.data||[];assocs=ar.data||[];variants=vr.data||[];holeRecommendations=hr.data||[];settings=sr.data||{};

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
    renderAddonPrompt();
    if(params.get('checkout')==='1')showCheckout();
  }

  function productListForCategory(){
    const ids=assocs.filter(a=>a.category_id===$('calcCategory').value).map(a=>a.product_id);
    return products.filter(p=>ids.includes(p.id));
  }
  function variantsForProduct(){
    const product=products.find(p=>p.id===$('calcProduct').value);
    const category=cats.find(c=>c.id===$('calcCategory').value);
    const base=variants.filter(v=>v.product_id===$('calcProduct').value&&v.active&&v.availability==='in_stock');
    const area=isAreaCategory(category);
    const priority=area||prioritizesHeight(product,base);
    return base.sort((a,b)=>{
      if(area){
        const d=dimensionsAreaM2(a.height)-dimensionsAreaM2(b.height);if(d!==0)return d;
      }else if(priority){
        const h=numericFromText(a.height)-numericFromText(b.height);if(h!==0)return h;
      }else{
        const l=Number(a.liters??999999)-Number(b.liters??999999);if(l!==0)return l;
      }
      return String(a.label).localeCompare(String(b.label),'es');
    });
  }
  function renderCategories(){$('calcCategory').innerHTML=cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
  function renderProducts(){$('calcProduct').innerHTML=productListForCategory().map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}
  function renderVariants(){
    const list=variantsForProduct();
    const product=products.find(p=>p.id===$('calcProduct').value);
    const category=cats.find(c=>c.id===$('calcCategory').value);
    $('calcVariantLabel').textContent=isMaterialCategory(category)?'Presentación / volumen disponible':isAreaCategory(category)?'Dimensiones / opción disponible':prioritizesHeight(product,list)?'Altura / opción disponible':'Litros / opción disponible';
    $('calcVariant').innerHTML=list.length?list.map(v=>`<option value="${v.id}">${optionText(v,product,category)}</option>`).join(''):`<option value="">Sin opciones en stock</option>`;
    $('addToCartBtn').disabled=!list.length;
  }

  function latestPlantContext(){
    const item=[...window.ViveroCart.get()].reverse().find(x=>!x.material_mode&&!x.area_mode&&Number(x.liters||0)>0);
    if(!item)return null;
    return {
      quantity:Number(item.quantity||1),
      liters:Number(item.liters||0)
    };
  }
  function materialUseMode(){
    return document.querySelector('input[name="materialUse"]:checked')?.value||'terrain';
  }
  function renderHoleRecommendationOptions(preferredLiters=null){
    const select=$('materialHoleLiters');
    const current=preferredLiters??Number(select.value||0);
    if(!holeRecommendations.length){
      select.innerHTML='<option value="">Sin recomendaciones cargadas</option>';
      select.disabled=true;
      $('materialHoleRecommendation').querySelector('strong').textContent='Configurá las recomendaciones desde el panel';
      return;
    }
    select.disabled=false;
    select.innerHTML='<option value="">Elegir litros</option>'+holeRecommendations.map(r=>`<option value="${r.liters}">${Number(r.liters).toLocaleString('es-AR')} L</option>`).join('');
    const exact=holeRecommendations.find(r=>Number(r.liters)===Number(current));
    if(exact)select.value=String(exact.liters);
    applyHoleRecommendation();
  }
  function applyHoleRecommendation(){
    const liters=Number($('materialHoleLiters').value||0);
    const rec=holeRecommendations.find(r=>Number(r.liters)===liters);
    const box=$('materialHoleRecommendation');
    if(!rec){
      box.querySelector('strong').textContent='Elegí los litros';
      return;
    }
    $('materialHoleWidth').value=String(rec.width_cm);
    $('materialHoleDepth').value=String(rec.depth_cm);
    box.querySelector('strong').textContent=`${Number(rec.liters).toLocaleString('es-AR')} L → ${Number(rec.width_cm).toLocaleString('es-AR')} × ${Number(rec.width_cm).toLocaleString('es-AR')} cm · profundidad ${Number(rec.depth_cm).toLocaleString('es-AR')} cm`;
  }
  function applyLatestPlantContext(){
    const context=latestPlantContext();
    if(context){
      $('materialHoleCount').value=String(Math.max(1,Math.floor(context.quantity||1)));
      renderHoleRecommendationOptions(context.liters);
    }else{
      renderHoleRecommendationOptions();
    }
  }
  function updateMaterialFields(useLatestContext=false){
    const product=products.find(p=>p.id===$('calcProduct').value);
    const bark=isBarkProduct(product);
    const holesRadio=document.querySelector('input[name="materialUse"][value="holes"]');
    const terrainRadio=document.querySelector('input[name="materialUse"][value="terrain"]');
    if(holesRadio?.closest('label'))holesRadio.closest('label').hidden=bark;
    if(bark&&holesRadio?.checked&&terrainRadio)terrainRadio.checked=true;
    const mode=materialUseMode();
    $('materialTerrainFields').hidden=mode!=='terrain';
    $('materialHoleFields').hidden=mode!=='holes'||bark;
    if(mode==='holes'&&!bark){
      if(useLatestContext)applyLatestPlantContext();
      else if(!$('materialHoleLiters').options.length)renderHoleRecommendationOptions();
    }
  }

  function renderAddonPrompt(){
    const category=cats.find(c=>c.slug==='otros');
    const prompt=$('addonMaterialPrompt');
    if(!category||current.category?.slug==='otros'){prompt.hidden=true;return}
    const ids=assocs.filter(a=>a.category_id===category.id).map(a=>a.product_id);
    const list=products.filter(p=>ids.includes(p.id)&&variants.some(v=>v.product_id===p.id&&v.active&&v.availability==='in_stock'));
    prompt.hidden=!list.length;
    if(!list.length)return;
    $('addonProductSelect').innerHTML=list.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  }
  function openAddonCalculator(){
    const category=cats.find(c=>c.slug==='otros');
    const productId=$('addonProductSelect').value;
    if(!category||!productId)return;
    $('calcCategory').value=category.id;
    renderProducts();
    $('calcProduct').value=productId;
    renderVariants();
    resetSpacing();
    const context=latestPlantContext();
    if(context){
      const holesRadio=document.querySelector('input[name="materialUse"][value="holes"]');
      if(holesRadio)holesRadio.checked=true;
    }
    updateMaterialFields(true);
    calculate();
    $('addedChoice').hidden=true;
    history.replaceState(null,'',`calculadora.html?category=${category.id}&product=${productId}`);
    scrollTo({top:0,behavior:'smooth'});
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
    const area=isAreaCategory(category);
    const material=isMaterialCategory(category);
    $('linearFields').hidden=!linear;
    $('areaFields').hidden=!area;
    $('materialFields').hidden=!material;
    $('unitFields').hidden=linear||area||material;
    if(material){updateMaterialFields();return}
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
    const area=isAreaCategory(category);
    const material=isMaterialCategory(category);

    if(product){
      const previewImage=firstProductImage(product);
      $('calcProductPreview').innerHTML=`${previewImage?`<img src="${previewImage}" alt="">`:''}<div><strong>${product.name}</strong><span>${product.description||''}</span></div>`;
    }
    $('selectedPresentation').textContent=presentationText(variant,category);
    $('selectedOptionPrice').textContent=variant
      ?`${material&&variant.liters?`${volumeTextDm3(variant.liters)} · `:area&&variant.height?`Dim. ${variant.height} · `:prioritizesHeight(product,variantsForProduct())&&variant.height?`Alt. ${variant.height} · `:!prioritizesHeight(product,variantsForProduct())&&variant.liters?`${Number(variant.liters).toLocaleString('es-AR')} L · `:''}${money(variant.price)}`
      :'—';

    let qty=0,spacing=null,areaM2=null,paneAreaM2=null,materialVolumeDm3=null,materialMode=null;
    let coverageAreaM2=null,fillDepthCm=null,holeCount=null,holeWidthCm=null,holeDepthCm=null,holeReferenceLiters=null;

    if(linear){
      spacing=customMode?Number($('customSpacing').value||0):Number(selectedSpacing||0);
      const length=Number($('calcLength').value||0);
      qty=length>0&&spacing>0?Math.ceil((length*100)/spacing):0;
      updateClosureEstimate(variant);
    }else if(area){
      areaM2=Number($('calcArea').value||0);
      paneAreaM2=dimensionsAreaM2(variant?.height);
      qty=areaM2>0&&paneAreaM2>0?Math.ceil(areaM2/paneAreaM2):0;
      $('areaCoverageInfo').innerHTML=paneAreaM2>0
        ?`<p><strong>Cobertura por pan:</strong> ${paneAreaM2.toLocaleString('es-AR',{maximumFractionDigits:3})} m² según dimensiones ${variant?.height||''}.</p><small>La cantidad se redondea hacia arriba para cubrir toda la superficie indicada.</small>`
        :`<p><strong>Dimensiones pendientes:</strong> cargá una medida como 40x40 cm en la opción de venta para poder calcular.</p>`;
    }else if(material){
      materialMode=materialUseMode();
      if(materialMode==='terrain'){
        coverageAreaM2=Number($('materialArea').value||0);
        fillDepthCm=Number($('materialDepth').value||0);
        materialVolumeDm3=coverageAreaM2>0&&fillDepthCm>0?coverageAreaM2*fillDepthCm*10:0;
      }else{
        holeCount=Math.max(0,Math.floor(Number($('materialHoleCount').value||0)));
        holeReferenceLiters=Number($('materialHoleLiters').value||0)||null;
        holeWidthCm=Number($('materialHoleWidth').value||0);
        holeDepthCm=Number($('materialHoleDepth').value||0);
        materialVolumeDm3=holeCount>0&&holeWidthCm>0&&holeDepthCm>0
          ?(holeCount*holeWidthCm*holeWidthCm*holeDepthCm)/1000
          :0;
      }
      const packageDm3=Number(variant?.liters||0);
      qty=materialVolumeDm3>0&&packageDm3>0?Math.ceil(materialVolumeDm3/packageDm3):0;
      const cubicMeters=Number(materialVolumeDm3||0)/1000;
      $('materialCoverageInfo').innerHTML=packageDm3>0&&materialVolumeDm3>0
        ?`<p><strong>Volumen estimado:</strong> ${Number(materialVolumeDm3).toLocaleString('es-AR',{maximumFractionDigits:1})} dm³ (${cubicMeters.toLocaleString('es-AR',{maximumFractionDigits:2})} m³).</p><small>Con ${presentationText(variant,category)} necesitás <strong>${qty.toLocaleString('es-AR')}</strong> unidad/es. Se redondea hacia arriba para no quedar corto.</small>`
        :`<p><strong>Completá las medidas</strong> y elegí una presentación con volumen configurado para obtener la cantidad.</p>`;
    }else{
      qty=Math.max(1,Math.floor(Number($('calcQuantityInput').value||1)));
    }

    const unit=Number(variant?.price||0),total=qty*unit;
    $('resultQty').textContent=qty.toLocaleString('es-AR');
    $('resultUnitPrice').textContent=money(unit);
    $('resultTotal').textContent=money(total);
    $('addToCartBtn').disabled=!variant||qty<1||(linear&&customMode&&!customApproved)||(area&&paneAreaM2<=0)||(material&&materialVolumeDm3<=0);
    current={category,product,assoc,variant,quantity:qty,total,linear,area,material,spacing,areaM2,paneAreaM2,
      materialMode,materialVolumeDm3,coverageAreaM2,fillDepthCm,holeCount,holeWidthCm,holeDepthCm,holeReferenceLiters};
  }

  function addCurrentToCart(){
    calculate();
    if(!current.variant||current.quantity<1)return;

    window.ViveroCart.add({
      product_id:current.product.id,variant_id:current.variant.id,category_id:current.category.id,
      product_name:current.product.name,variant_label:current.variant.label,liters:current.variant.liters,height:current.variant.height||null,
      category_name:current.category.name,quantity:current.quantity,unit_price:Number(current.variant.price),
      image_url:firstProductImage(current.product),length_m:current.linear?Number($('calcLength').value):null,
      spacing_cm:current.linear?Number(current.spacing):null,area_m2:current.area?Number(current.areaM2):null,area_mode:current.area,
      material_mode:current.material?current.materialMode:null,
      material_volume_dm3:current.material?Number(current.materialVolumeDm3):null,
      coverage_area_m2:current.material&&current.materialMode==='terrain'?Number(current.coverageAreaM2):null,
      fill_depth_cm:current.material&&current.materialMode==='terrain'?Number(current.fillDepthCm):null,
      hole_count:current.material&&current.materialMode==='holes'?Number(current.holeCount):null,
      hole_reference_liters:current.material&&current.materialMode==='holes'?Number(current.holeReferenceLiters||0)||null:null,
      hole_width_cm:current.material&&current.materialMode==='holes'?Number(current.holeWidthCm):null,
      hole_depth_cm:current.material&&current.materialMode==='holes'?Number(current.holeDepthCm):null
    });
    renderAddonPrompt();
    $('addedChoice').hidden=false;$('addedChoice').scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function renderCheckout(){
    const items=window.ViveroCart.get();
    $('checkoutItems').innerHTML=items.length?items.map(x=>`
      <div class="checkout-item" data-cart-id="${x.id}">
        ${x.image_url?`<img src="${x.image_url}" alt="">`:`<div class="checkout-placeholder">MP</div>`}
        <div class="checkout-item-copy"><strong>${x.product_name}</strong><span>${x.category_name} · ${x.variant_label}${x.material_mode&&x.liters?` · ${volumeTextDm3(x.liters)}`:!x.material_mode&&x.liters?` · ${x.liters} L`:''}${x.height?` · ${x.area_mode?"Dim.":"Alt."} ${x.height}`:''}</span>${x.length_m?`<span>${x.length_m} m · distancia ${x.spacing_cm} cm</span>`:''}${x.area_m2?`<span>${x.area_m2} m² a cubrir</span>`:''}${x.material_mode==='terrain'?`<span>${x.coverage_area_m2} m² · ${x.fill_depth_cm} cm de profundidad · ${Number(x.material_volume_dm3||0).toLocaleString('es-AR')} dm³</span>`:''}${x.material_mode==='holes'?`<span>${x.hole_count} pozos${x.hole_reference_liters?` · referencia ${x.hole_reference_liters} L`:''} · ${x.hole_width_cm}×${x.hole_width_cm}×${x.hole_depth_cm} cm · ${Number(x.material_volume_dm3||0).toLocaleString('es-AR')} dm³</span>`:''}
          <label class="checkout-variant-label">Opción / presentación
            <select class="checkout-variant" data-variant-cart-id="${x.id}">${variants.filter(v=>v.product_id===x.product_id&&v.active&&v.availability==='in_stock').sort((a,b)=>{const p=products.find(p=>p.id===x.product_id);const list=variants.filter(v=>v.product_id===x.product_id&&v.active&&v.availability==='in_stock');return prioritizesHeight(p,list)?(numericFromText(a.height)-numericFromText(b.height)):(Number(a.liters??999999)-Number(b.liters??999999))}).map(v=>`<option value="${v.id}" ${v.id===x.variant_id?'selected':''}>${optionText(v,products.find(p=>p.id===x.product_id),cats.find(c=>c.id===x.category_id))}</option>`).join('')}</select>
          </label>
        </div>
        <label>Cantidad<input class="checkout-qty" type="number" min="1" value="${x.quantity}" data-qty-id="${x.id}"></label>
        <strong class="checkout-subtotal">${money(Number(x.unit_price)*Number(x.quantity))}</strong>
        <button class="checkout-remove" type="button" data-remove-id="${x.id}">Eliminar</button>
      </div>`).join(''):`<div class="cart-empty">El carrito está vacío. Podés volver al catálogo y agregar plantas.</div>`;
    $('checkoutTotal').textContent=money(window.ViveroCart.total());
    $('confirmWhatsappBtn').disabled=!items.length;
  }
  function showCheckout(){$('checkoutSection').hidden=false;renderCheckout();setTimeout(()=>$('checkoutSection').scrollIntoView({behavior:'smooth',block:'start'}),80)}

  $('calcCategory').addEventListener('change',()=>{renderProducts();renderVariants();resetSpacing();updateMaterialFields(true);calculate()});
  $('calcProduct').addEventListener('change',()=>{renderVariants();resetSpacing();updateMaterialFields(true);calculate()});
  $('calcVariant').addEventListener('change',calculate);
  $('calcLength').addEventListener('input',calculate);
  $('calcArea').addEventListener('input',calculate);

  const adjustStepperValue=(inputId,delta,minValue)=>{
    const input=$(inputId);
    const min=Number(minValue??input.min??0);
    const current=Number(input.value||min);
    const next=Math.max(min,current+delta);
    input.value=Number.isInteger(next)?String(next):String(Math.round(next*100)/100);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  };

  function setupHoldStepper(button,action){
    let holdDelay=null,repeatTimer=null,suppressClick=false;
    const stop=()=>{
      clearTimeout(holdDelay);clearInterval(repeatTimer);
      holdDelay=null;repeatTimer=null;
      button.classList.remove('holding');
    };
    button.addEventListener('pointerdown',e=>{
      if(e.button!==undefined&&e.button!==0)return;
      e.preventDefault();
      suppressClick=true;
      button.classList.add('holding');
      button.setPointerCapture?.(e.pointerId);
      action();
      holdDelay=setTimeout(()=>{
        repeatTimer=setInterval(action,90);
      },350);
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>button.addEventListener(ev,stop));
    button.addEventListener('click',()=>{
      if(suppressClick){suppressClick=false;return}
      action();
    });
  }
  setupHoldStepper($('calcLengthUp'),()=>adjustStepperValue('calcLength',1,1));
  setupHoldStepper($('calcLengthDown'),()=>adjustStepperValue('calcLength',-1,1));
  setupHoldStepper($('calcAreaUp'),()=>adjustStepperValue('calcArea',1,0.1));
  setupHoldStepper($('calcAreaDown'),()=>adjustStepperValue('calcArea',-1,0.1));
  $('calcQuantityInput').addEventListener('input',calculate);
  document.querySelectorAll('input[name="materialUse"]').forEach(r=>r.addEventListener('change',()=>{updateMaterialFields(true);calculate()}));
  $('materialHoleLiters').addEventListener('change',()=>{applyHoleRecommendation();calculate()});
  ['materialArea','materialDepth','materialHoleCount','materialHoleWidth','materialHoleDepth'].forEach(id=>$(id).addEventListener('input',calculate));

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
  $('addonProductBtn').addEventListener('click',openAddonCalculator);
  $('keepShoppingBtn').addEventListener('click',()=>{location.href='index.html#catalogo'});
  $('continueOrderBtn').addEventListener('click',showCheckout);
  $('clearCartBtn').addEventListener('click',()=>{if(confirm('¿Eliminar todos los artículos del carrito?')){window.ViveroCart.clear();renderCheckout()}});
  window.addEventListener('viverocartchange',renderCheckout);
  $('checkoutItems').addEventListener('input',e=>{if(e.target.matches('.checkout-qty'))window.ViveroCart.updateQty(e.target.dataset.qtyId,e.target.value)});
  $('checkoutItems').addEventListener('change',e=>{
    if(!e.target.matches('.checkout-variant'))return;
    const item=window.ViveroCart.get().find(x=>x.id===e.target.dataset.variantCartId);
    const v=variants.find(x=>x.id===e.target.value);
    if(!item||!v)return;
    const cat=cats.find(c=>c.id===item.category_id),area=isAreaCategory(cat),material=isMaterialCategory(cat);
    const paneArea=area?dimensionsAreaM2(v.height):0;
    const packageDm3=material?Number(v.liters||0):0;
    const qty=area&&item.area_m2&&paneArea>0
      ?Math.ceil(Number(item.area_m2)/paneArea)
      :material&&item.material_volume_dm3&&packageDm3>0
        ?Math.ceil(Number(item.material_volume_dm3)/packageDm3)
        :item.quantity;
    window.ViveroCart.update(item.id,{variant_id:v.id,variant_label:v.label,liters:v.liters,height:v.height||null,unit_price:Number(v.price),quantity:qty,area_mode:area});
    renderCheckout();
  });
  $('checkoutItems').addEventListener('click',e=>{if(e.target.dataset.removeId){window.ViveroCart.remove(e.target.dataset.removeId);renderCheckout()}});

  $('orderForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const cart=window.ViveroCart.get();if(!cart.length)return;
    const phoneNational=String($('customerPhone').value||'').replace(/\D/g,'');
    if(phoneNational.length!==10||phoneNational.startsWith('0')){
      $('orderMessage').textContent='Ingresá 10 dígitos: código de área sin 0 + número sin 15. Ejemplo: 11XXXXXXXX.';
      $('customerPhone').focus();return;
    }
    const btn=$('confirmWhatsappBtn');btn.disabled=true;$('orderMessage').textContent='Registrando solicitud...';
    try{
      const payload=cart.map(x=>({
        product_id:x.product_id,variant_id:x.variant_id,category_id:x.category_id,quantity:Number(x.quantity),
        length_m:x.length_m||null,spacing_cm:x.spacing_cm||null,
        coverage_area_m2:x.coverage_area_m2||null,fill_depth_cm:x.fill_depth_cm||null,
        hole_count:x.hole_count||null,hole_width_cm:x.hole_width_cm||null,hole_depth_cm:x.hole_depth_cm||null,
        material_volume_dm3:x.material_volume_dm3||null
      }));
      const {data,error}=await db.rpc('create_cart_order',{p_customer_name:$('customerName').value.trim(),p_phone:phoneNational,p_shipping_address:$('customerAddress').value.trim(),p_postal_code:$('customerPostal').value.trim(),p_general_question:$('customerQuestion').value.trim(),p_items:payload});
      if(error)throw error;
      const order=Array.isArray(data)?data[0]:data,code=order.order_code;
      const lines=[
        `Hola Mi Primavera. Quiero confirmar la solicitud ${code}.`,'',
        `Cliente: ${$('customerName').value.trim()}`,`Teléfono: +54 9 ${phoneNational}`,`Dirección: ${$('customerAddress').value.trim()} · CP: ${$('customerPostal').value.trim()}`,'','ARTÍCULOS:',
        ...cart.map((x,i)=>`${i+1}. ${x.product_name} · ${x.variant_label}${x.material_mode&&x.liters?` · ${volumeTextDm3(x.liters)}`:!x.material_mode&&x.liters?` · ${x.liters} L`:''}${x.height?` · ${x.area_mode?"Dim.":"Alt."} ${x.height}`:''}${x.area_m2?` · ${x.area_m2} m²`:''}${x.material_mode==='terrain'?` · ${x.coverage_area_m2} m² a ${x.fill_depth_cm} cm`:''}${x.material_mode==='holes'?` · ${x.hole_count} pozos${x.hole_reference_liters?` (ref. ${x.hole_reference_liters} L)`:''} ${x.hole_width_cm}×${x.hole_width_cm}×${x.hole_depth_cm} cm`:''} · Cant.: ${x.quantity} · ${money(Number(x.unit_price)*Number(x.quantity))}`),
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
