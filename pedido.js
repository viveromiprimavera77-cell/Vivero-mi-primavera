(() => {
  const cfg=window.VIVERO_CONFIG;
  if(!cfg||!window.supabase||!window.ViveroCart)return;

  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n||0));
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  let cats=[],products=[],assocs=[],variants=[],settings={};
  let shippingLocalities=[],shippingQuote=null,shippingQuoteTimer=null,shippingQuoteSeq=0,lastShippingQuoteKey="";
  const AMBA_PARTIDOS=new Set([
    "almirante brown","avellaneda","berazategui","berisso","brandsen","campana","canuelas","ensenada","escobar",
    "esteban echeverria","exaltacion de la cruz","ezeiza","florencio varela","general las heras","general rodriguez",
    "general san martin","hurlingham","ituzaingo","jose c paz","la matanza","la plata","lanus","lomas de zamora",
    "lujan","malvinas argentinas","marcos paz","merlo","moreno","moron","pilar","presidente peron","quilmes",
    "san fernando","san isidro","san miguel","san vicente","tigre","tres de febrero","vicente lopez","zarate"
  ]);

  function closeMenu(){
    $("sidebar").classList.remove("open");
    $("menuBackdrop").classList.remove("show");
    $("mobileMenuBtn").setAttribute("aria-expanded","false");
  }
  function waLink(number,message){
    const digits=String(number||"").replace(/\D/g,"");
    return digits?`https://wa.me/${digits}?text=${encodeURIComponent(message)}`:"";
  }
  function isAreaCategory(cat){return cat?.calculation_mode==="area"||cat?.slug==="grama"}
  function isMaterialCategory(cat){return cat?.calculation_mode==="material"||["tierra","sustratos","otros"].includes(cat?.slug)}
  function volumeTextDm3(v){const n=Number(v||0);return n>=1000?`${(n/1000).toLocaleString("es-AR")} m³`:`${n.toLocaleString("es-AR")} dm³`}
  function numericFromText(value){const m=String(value||"").replace(",",".").match(/\d+(?:\.\d+)?/);return m?Number(m[0]):999999}
  function dimensionsAreaM2(value){
    const nums=String(value||"").replaceAll(",",".").match(/\d+(?:\.\d+)?/g)?.map(Number)||[];
    if(nums.length<2)return 0;
    const [a,b]=nums;
    const normalized=(n)=>n>20?n/100:n;
    return normalized(a)*normalized(b);
  }
  function prioritizesHeight(product,list){return !!product?.prioritize_height||(list?.length>0&&list.every(v=>!v.liters)&&list.some(v=>v.height))}
  function presentationText(v,category=null){
    if(!v)return "";
    if(isMaterialCategory(category))return `${v.label}${v.liters?` · ${volumeTextDm3(v.liters)}`:""}`;
    if(isAreaCategory(category))return `${v.label}${v.height?` · ${v.height}`:""}`;
    return `${v.label}${v.liters?` · ${Number(v.liters).toLocaleString("es-AR")} L`:""}${!v.liters&&v.height?` · Alt. ${v.height}`:""}`;
  }
  function optionText(v,p,category=null){
    if(!v)return "";
    if(isAreaCategory(category))return `${v.height||"Sin dimensiones"} — ${v.label} — ${money(v.price)}`;
    if(isMaterialCategory(category))return `${v.label} · ${volumeTextDm3(v.liters)} — ${money(v.price)}`;
    const list=variants.filter(x=>x.product_id===p?.id&&x.active&&x.availability==="in_stock");
    if(prioritizesHeight(p,list))return `${v.height||"Sin altura"} — ${presentationText(v,category)} — ${money(v.price)}`;
    const size=v.liters?`${Number(v.liters).toLocaleString("es-AR")} L`:v.height?`Alt. ${v.height}`:"Opción única";
    return `${size} — ${v.label} — ${money(v.price)}`;
  }


  function shippingNormalize(v){
    return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  }
  function localityFromGeoref(x){
    const lat=Number((x&&x.centroide&&x.centroide.lat)!=null?x.centroide.lat:x&&x.centroide_lat);
    const lon=Number((x&&x.centroide&&x.centroide.lon)!=null?x.centroide.lon:x&&x.centroide_lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
    const name=String(x&&x.nombre||"").trim();
    const department=String(
      (x&&x.departamento&&x.departamento.nombre)||
      (x&&x.departamento_nombre)||
      (x&&x.municipio&&x.municipio.nombre)||
      (x&&x.municipio_nombre)||
      ""
    ).trim();
    return name?{name:name,department:department,lat:lat,lon:lon,isCaba:false}:null;
  }
  function isAmbaLocality(l){
    return !!(l&&l.isCaba)||AMBA_PARTIDOS.has(shippingNormalize(l&&l.department));
  }
  async function fetchGeorefLocalities(){
    const cacheKey="miPrimaveraShippingLocalitiesV1";
    try{
      const cached=JSON.parse(sessionStorage.getItem(cacheKey)||"null");
      if(Array.isArray(cached)&&cached.length)return cached;
    }catch{}
    const res=await fetch("https://apis.datos.gob.ar/georef/api/v2.0/localidades?provincia=06&max=5000");
    if(!res.ok)throw new Error("No se pudieron cargar las localidades");
    const data=await res.json();
    const list=(data.localidades||[]).map(localityFromGeoref).filter(Boolean);
    list.push({name:"Ciudad Autónoma de Buenos Aires",department:"CABA",lat:-34.6037,lon:-58.3816,isCaba:true});
    const dedup=new Map();
    list.forEach(function(l){
      const key=shippingNormalize(l.name)+"|"+shippingNormalize(l.department)+"|"+(l.isCaba?"caba":"");
      if(!dedup.has(key))dedup.set(key,l);
    });
    const values=Array.from(dedup.values());
    try{sessionStorage.setItem(cacheKey,JSON.stringify(values))}catch{}
    return values;
  }
  function useLocalityFallback(message){
    const select=$("shippingLocality"),fallback=$("shippingLocalityFallback");
    select.hidden=true;select.disabled=true;select.required=false;
    fallback.hidden=false;fallback.required=true;
    fallback.placeholder=message||"Escribí la localidad";
  }
  function renderLocalityOptions(){
    const region=$("shippingRegion").value;
    const select=$("shippingLocality"),fallback=$("shippingLocalityFallback");
    shippingQuote=null;$("shippingQuoteBox").hidden=true;
    if(!region){
      select.hidden=false;select.disabled=true;select.required=true;
      fallback.hidden=true;fallback.required=false;
      select.innerHTML='<option value="">Primero elegí la zona</option>';
      return;
    }
    const list=shippingLocalities.filter(function(l){return region==="amba"?isAmbaLocality(l):!isAmbaLocality(l)})
      .sort(function(a,b){return a.name.localeCompare(b.name,"es")||a.department.localeCompare(b.department,"es")});
    if(!list.length){useLocalityFallback("Escribí la localidad");return}
    select.hidden=false;select.disabled=false;select.required=true;
    fallback.hidden=true;fallback.required=false;fallback.value="";
    select.innerHTML='<option value="">Elegí la localidad</option>'+list.map(function(l){
      const label=l.department&&shippingNormalize(l.department)!==shippingNormalize(l.name)?l.name+" — "+l.department:l.name;
      return '<option value="'+esc(label)+'" data-lat="'+l.lat+'" data-lon="'+l.lon+'">'+esc(label)+'</option>';
    }).join("");
  }
  async function loadShippingLocalities(){
    try{
      shippingLocalities=await fetchGeorefLocalities();
      renderLocalityOptions();
    }catch(err){
      console.warn(err);
      shippingLocalities=[];
      if($("shippingRegion").value)useLocalityFallback("Escribí la localidad");
    }
  }
  function selectedDestination(){
    const fallback=$("shippingLocalityFallback");
    if(!fallback.hidden){
      const name=fallback.value.trim();
      return name?{name:name}:null;
    }
    const opt=$("shippingLocality").selectedOptions&&$("shippingLocality").selectedOptions[0];
    if(!opt||!opt.value)return null;
    return {name:opt.value};
  }
  function cartPayload(){
    return window.ViveroCart.get().map(function(x){
      return {
        product_id:x.product_id,variant_id:x.variant_id,category_id:x.category_id,quantity:Number(x.quantity),
        length_m:x.length_m||null,spacing_cm:x.spacing_cm||null,
        coverage_area_m2:x.coverage_area_m2||null,fill_depth_cm:x.fill_depth_cm||null,
        hole_count:x.hole_count||null,hole_width_cm:x.hole_width_cm||null,hole_depth_cm:x.hole_depth_cm||null,
        material_volume_dm3:x.material_volume_dm3||null
      };
    });
  }
  async function quoteShipping(){
    clearTimeout(shippingQuoteTimer);
    const region=$("shippingRegion").value,dest=selectedDestination();
    const cp=$("customerPostal").value.trim(),address=$("customerAddress").value.trim(),items=cartPayload();
    const seq=++shippingQuoteSeq;
    shippingQuote=null;$("shippingQuoteBox").hidden=true;
    if(!items.length||!region||!dest||!cp||address.length<4)return;

    const quoteKey=JSON.stringify({
      region:region,locality:dest.name,cp:cp,address:address,
      items:items.map(x=>[x.product_id,x.variant_id,x.category_id,x.quantity])
    });
    if(quoteKey===lastShippingQuoteKey&&shippingQuote)return;

    const result=await db.functions.invoke("shipping-route",{
      body:{
        action:"quote",
        items:items,
        shipping_region:region,
        shipping_locality:dest.name,
        postal_code:cp,
        shipping_address:address
      }
    });
    if(seq!==shippingQuoteSeq)return;
    if(result.error){console.warn(result.error);return}
    if(result.data&&result.data.ready){
      shippingQuote=result.data;
      lastShippingQuoteKey=quoteKey;
      $("shippingQuoteValue").textContent=money(result.data.price);
      $("shippingQuoteBox").hidden=false;
    }
  }
  function scheduleShippingQuote(){
    clearTimeout(shippingQuoteTimer);
    shippingQuoteTimer=setTimeout(function(){quoteShipping().catch(function(err){console.warn(err)})},320);
  }

  function renderNavigation(){
    $("categoryNav").innerHTML=cats.length?cats.map(c=>{
      const ids=assocs.filter(a=>a.category_id===c.id).map(a=>a.product_id);
      const ps=products.filter(p=>ids.includes(p.id));
      const url=`categoria.html?categoria=${encodeURIComponent(c.slug)}`;
      return `<a class="category-link" href="${url}">${esc(c.name)}</a>${ps.map(p=>`<a class="plant-link" href="${url}&planta=${encodeURIComponent(p.slug)}">↳ ${esc(p.name)}</a>`).join("")}`;
    }).join(""):'<span class="nav-loading">Sin categorías</span>';
  }

  function itemMeta(x){
    const parts=[];
    if(x.area_m2)parts.push(`${x.area_m2} m² a cubrir`);
    if(x.material_mode==="terrain")parts.push(`${x.coverage_area_m2} m² · ${x.fill_depth_cm} cm de profundidad · ${Number(x.material_volume_dm3||0).toLocaleString("es-AR")} dm³`);
    if(x.material_mode==="holes")parts.push(`${x.hole_count} pozos${x.hole_reference_liters?` · referencia ${x.hole_reference_liters} L`:""} · ${x.hole_width_cm}×${x.hole_width_cm}×${x.hole_depth_cm} cm · ${Number(x.material_volume_dm3||0).toLocaleString("es-AR")} dm³`);
    return parts.map(t=>`<span>${esc(t)}</span>`).join("");
  }

  function renderCheckout(){
    const items=window.ViveroCart.get();
    $("checkoutItems").innerHTML=items.length?items.map(x=>{
      const p=products.find(p=>p.id===x.product_id);
      const cat=cats.find(c=>c.id===x.category_id);
      const choices=variants.filter(v=>v.product_id===x.product_id&&v.active&&v.availability==="in_stock").sort((a,b)=>{
        const list=variants.filter(v=>v.product_id===x.product_id&&v.active&&v.availability==="in_stock");
        return prioritizesHeight(p,list)?numericFromText(a.height)-numericFromText(b.height):Number(a.liters??999999)-Number(b.liters??999999);
      });
      return `<div class="checkout-item">
        ${x.image_url?`<img src="${esc(x.image_url)}" alt="">`:'<div class="checkout-placeholder">MP</div>'}
        <div class="checkout-item-copy">
          <strong>${esc(x.product_name)}</strong>
          <span>${esc(x.variant_label||"")}${x.material_mode&&x.liters?` · ${esc(volumeTextDm3(x.liters))}`:x.liters?` · ${Number(x.liters).toLocaleString("es-AR")} L`:""}${x.height?` · ${x.area_mode?"Dim.":"Alt."} ${esc(x.height)}`:""}</span>
          ${itemMeta(x)}
          <label class="checkout-variant-label">Opción / presentación
            <select class="checkout-variant" data-variant-cart-id="${x.id}">
              ${choices.map(v=>`<option value="${v.id}" ${v.id===x.variant_id?"selected":""}>${esc(optionText(v,p,cat))}</option>`).join("")}
            </select>
          </label>
        </div>
        <label>Cantidad<input class="checkout-qty" type="number" min="1" value="${x.quantity}" data-qty-id="${x.id}"></label>
        <strong class="checkout-subtotal">${money(Number(x.unit_price)*Number(x.quantity))}</strong>
        <button class="checkout-remove" type="button" data-remove-id="${x.id}">Eliminar</button>
      </div>`;
    }).join(""):'<div class="cart-empty">El carrito está vacío. Podés volver al catálogo y agregar plantas.</div>';

    $("checkoutTotal").textContent=money(window.ViveroCart.total());
    $("confirmWhatsappBtn").disabled=!items.length;
    scheduleShippingQuote();
  }

  async function load(){
    const [cr,pr,ar,vr,sr]=await Promise.all([
      db.from("categories").select("*").eq("active",true).order("sort_order").order("name"),
      db.from("products").select("*").eq("active",true).order("sort_order").order("name"),
      db.from("product_categories").select("*").order("sort_order"),
      db.from("product_variants").select("*").eq("active",true).order("sort_order"),
      db.from("site_settings").select("*").eq("id",1).maybeSingle()
    ]);
    [cr,pr,ar,vr].forEach(r=>{if(r.error)throw r.error});
    cats=cr.data||[];products=pr.data||[];assocs=ar.data||[];variants=vr.data||[];settings=sr.data||{};
    renderNavigation();
    renderCheckout();
    await loadShippingLocalities();

    const wa=waLink(settings.whatsapp,"Hola Mi Primavera, quisiera hacer una consulta.");
    if(wa){$("whatsappFloat").href=wa;$("whatsappFloat").hidden=false}
  }

  $("mobileMenuBtn").addEventListener("click",()=>{
    const open=$("sidebar").classList.toggle("open");
    $("menuBackdrop").classList.toggle("show",open);
    $("mobileMenuBtn").setAttribute("aria-expanded",String(open));
  });
  $("menuBackdrop").addEventListener("click",closeMenu);
  $("categoryNav").addEventListener("click",()=>{if(innerWidth<=900)closeMenu()});

  $("clearCartBtn").addEventListener("click",()=>{
    if(!confirm("¿Eliminar todos los artículos del carrito?"))return;
    window.ViveroCart.clear();
    location.href="index.html";
  });

  $("shippingRegion").addEventListener("change",()=>{
    renderLocalityOptions();
    scheduleShippingQuote();
  });
  $("shippingLocality").addEventListener("change",scheduleShippingQuote);
  $("shippingLocalityFallback").addEventListener("change",scheduleShippingQuote);
  $("customerPostal").addEventListener("change",scheduleShippingQuote);
  $("customerPostal").addEventListener("blur",scheduleShippingQuote);
  $("customerAddress").addEventListener("change",scheduleShippingQuote);
  $("customerAddress").addEventListener("blur",scheduleShippingQuote);

  window.addEventListener("viverocartchange",renderCheckout);
  $("checkoutItems").addEventListener("input",e=>{
    if(e.target.matches(".checkout-qty"))window.ViveroCart.updateQty(e.target.dataset.qtyId,e.target.value);
  });
  $("checkoutItems").addEventListener("change",e=>{
    if(!e.target.matches(".checkout-variant"))return;
    const item=window.ViveroCart.get().find(x=>x.id===e.target.dataset.variantCartId);
    const v=variants.find(x=>x.id===e.target.value);
    if(!item||!v)return;
    const cat=cats.find(c=>c.id===item.category_id);
    const area=isAreaCategory(cat),material=isMaterialCategory(cat);
    const paneArea=area?dimensionsAreaM2(v.height):0;
    const packageDm3=material?Number(v.liters||0):0;
    const qty=area&&item.area_m2&&paneArea>0
      ?Math.ceil(Number(item.area_m2)/paneArea)
      :material&&item.material_volume_dm3&&packageDm3>0
        ?Math.ceil(Number(item.material_volume_dm3)/packageDm3)
        :item.quantity;
    window.ViveroCart.update(item.id,{
      variant_id:v.id,variant_label:v.label,liters:v.liters,height:v.height||null,
      unit_price:Number(v.price),quantity:qty,area_mode:area
    });
  });
  $("checkoutItems").addEventListener("click",e=>{
    if(e.target.dataset.removeId)window.ViveroCart.remove(e.target.dataset.removeId);
  });

  $("orderForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const cart=window.ViveroCart.get();
    if(!cart.length)return;
    const phoneNational=String($("customerPhone").value||"").replace(/\D/g,"");
    if(phoneNational.length!==10||phoneNational.startsWith("0")){
      $("orderMessage").textContent="Ingresá 10 dígitos: código de área sin 0 + número sin 15. Ejemplo: 11XXXXXXXX.";
      $("customerPhone").focus();
      return;
    }

    const region=$("shippingRegion").value;
    const dest=selectedDestination();
    if(!region||!dest){
      $("orderMessage").textContent="Elegí la zona y la localidad de entrega.";
      return;
    }

    const btn=$("confirmWhatsappBtn");
    btn.disabled=true;
    $("orderMessage").textContent="Calculando recorrido y registrando solicitud...";

    try{
      const payload=cartPayload();
      const result=await db.functions.invoke("shipping-route",{
        body:{
          action:"submit_order",
          customer_name:$("customerName").value.trim(),
          phone:phoneNational,
          shipping_address:$("customerAddress").value.trim(),
          postal_code:$("customerPostal").value.trim(),
          general_question:$("customerQuestion").value.trim(),
          items:payload,
          shipping_region:region,
          shipping_locality:dest.name
        }
      });
      if(result.error)throw result.error;
      if(!result.data||!result.data.ok){
        const reason=result.data&&result.data.reason;
        if(reason==="missing_weight")throw new Error("No pudimos calcular el envío automáticamente para uno de los productos. Contactanos para cotizarlo.");
        if(reason==="destination_not_found")throw new Error("No pudimos ubicar esa dirección. Revisá calle, altura, localidad y código postal.");
        throw new Error("No pudimos calcular el envío o registrar la solicitud.");
      }

      const code=result.data.order_code;
      const finalShipping=Number(result.data.shipping_price||0);
      const lines=[
        `Hola Mi Primavera. Quiero confirmar la solicitud ${code}.`,"",
        `Cliente: ${$("customerName").value.trim()}`,
        `Teléfono: +54 9 ${phoneNational}`,
        `Entrega: ${region==="amba"?"AMBA":"Buenos Aires"} · ${dest.name}`,
        `Dirección: ${$("customerAddress").value.trim()} · CP: ${$("customerPostal").value.trim()}`,"","ARTÍCULOS:",
        ...cart.map((x,i)=>`${i+1}. ${x.product_name} · ${x.variant_label}${x.material_mode&&x.liters?` · ${volumeTextDm3(x.liters)}`:!x.material_mode&&x.liters?` · ${x.liters} L`:""}${x.height?` · ${x.area_mode?"Dim.":"Alt."} ${x.height}`:""}${x.area_m2?` · ${x.area_m2} m²`:""}${x.material_mode==="terrain"?` · ${x.coverage_area_m2} m² a ${x.fill_depth_cm} cm`:""}${x.material_mode==="holes"?` · ${x.hole_count} pozos${x.hole_reference_liters?` (ref. ${x.hole_reference_liters} L)`:""} ${x.hole_width_cm}×${x.hole_width_cm}×${x.hole_depth_cm} cm`:""} · Cant.: ${x.quantity} · ${money(Number(x.unit_price)*Number(x.quantity))}`),
        "",
        `Total productos: ${money(cart.reduce((s,x)=>s+Number(x.unit_price)*Number(x.quantity),0))}`,
        `Envío estimado: ${money(finalShipping)}`,
        $("customerQuestion").value.trim()?`Consulta: ${$("customerQuestion").value.trim()}`:null
      ].filter(x=>x!==null);

      const digits=String(settings.whatsapp||"").replace(/\D/g,"");
      window.ViveroCart.clear();
      $("orderMessage").textContent=`Solicitud ${code} registrada. Abriendo WhatsApp...`;
      if(!digits)throw new Error(`La solicitud ${code} quedó registrada, pero falta configurar el WhatsApp del vivero en el panel.`);
      setTimeout(()=>{location.href=`https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`},400);
    }catch(err){
      console.error(err);
      $("orderMessage").textContent=err.message||"No se pudo registrar la solicitud.";
      btn.disabled=false;
    }
  });

  const topBtn=$("backToTop");
  window.addEventListener("scroll",()=>topBtn.classList.toggle("show",window.scrollY>500),{passive:true});
  topBtn.addEventListener("click",()=>scrollTo({top:0,behavior:"smooth"}));

  load().catch(err=>{
    console.error(err);
    $("orderMessage").textContent="No se pudo cargar el resumen del pedido.";
  });
})();