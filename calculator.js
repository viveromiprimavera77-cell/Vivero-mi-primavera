(() => {
  const cfg=window.VIVERO_CONFIG;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n||0));
  let cats=[],products=[],assocs=[],variants=[],settings={};
  let current={};

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

    const params=new URLSearchParams(location.search);
    renderCategories();
    if(params.get("category")&&cats.some(c=>c.id===params.get("category")))$("calcCategory").value=params.get("category");
    renderProducts();
    if(params.get("product")&&products.some(p=>p.id===params.get("product")))$("calcProduct").value=params.get("product");
    renderPresentations();

    const wanted=variants.find(v=>v.id===params.get("variant"));
    if(wanted&&wanted.product_id===$("calcProduct").value){
      $("calcPresentation").value=wanted.label;
      renderLiters();
      $("calcLiters").value=wanted.id;
    }else renderLiters();

    calculate();
    renderCheckout();

    if(params.get("checkout")==="1"){
      showCheckout();
    }
  }

  function productListForCategory(){
    const cid=$("calcCategory").value;
    const ids=assocs.filter(a=>a.category_id===cid).map(a=>a.product_id);
    return products.filter(p=>ids.includes(p.id));
  }
  function variantsForProduct(){
    return variants.filter(v=>v.product_id===$("calcProduct").value&&v.active);
  }
  function renderCategories(){
    $("calcCategory").innerHTML=cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
  }
  function renderProducts(){
    const list=productListForCategory();
    $("calcProduct").innerHTML=list.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
  }
  function renderPresentations(){
    const list=variantsForProduct();
    const labels=[...new Set(list.map(v=>v.label))];
    $("calcPresentation").innerHTML=labels.map(x=>`<option value="${x}">${x}</option>`).join("");
  }
  function renderLiters(){
    const label=$("calcPresentation").value;
    const list=variantsForProduct().filter(v=>v.label===label&&v.availability==="in_stock").sort((a,b)=>Number(a.liters||0)-Number(b.liters||0));
    $("calcLiters").innerHTML=list.length?list.map(v=>`<option value="${v.id}">${v.liters?`${Number(v.liters).toLocaleString("es-AR")} L`:"Única"} — ${money(v.price)}</option>`).join(""):`<option value="">Sin opciones en stock</option>`;
    $("addToCartBtn").disabled=!list.length;
  }

  function calculate(){
    const cid=$("calcCategory").value,pid=$("calcProduct").value,vid=$("calcLiters").value;
    const category=cats.find(c=>c.id===cid)||null;
    const product=products.find(p=>p.id===pid)||null;
    const assoc=assocs.find(a=>a.category_id===cid&&a.product_id===pid)||null;
    const variant=variants.find(v=>v.id===vid)||null;
    const linear=category?.calculation_mode==="linear";

    $("linearFields").hidden=!linear;$("unitFields").hidden=linear;
    if(product){
      $("calcProductPreview").innerHTML=`${product.image_url?`<img src="${product.image_url}" alt="">`:""}<div><strong>${product.name}</strong><span>${product.description||""}</span></div>`;
    }

    if(linear){
      const recommended=Number(assoc?.recommended_spacing_cm||70);
      if(!$("calcSpacing").dataset.touched)$("calcSpacing").value=recommended;
      $("spacingHelp").textContent=`Distancia recomendada: ${recommended} cm.`;
    }

    let qty=0;
    if(linear){
      const length=Number($("calcLength").value||0),spacing=Number($("calcSpacing").value||0);
      qty=length>0&&spacing>0?Math.ceil((length*100)/spacing):0;
    }else{
      qty=Math.max(1,Math.floor(Number($("calcQuantityInput").value||1)));
    }

    const unit=Number(variant?.price||0),total=qty*unit;
    $("resultQty").textContent=qty.toLocaleString("es-AR");
    $("resultUnitPrice").textContent=money(unit);
    $("resultTotal").textContent=money(total);
    current={category,product,assoc,variant,quantity:qty,total,linear};
  }

  function addCurrentToCart(){
    calculate();
    if(!current.product||!current.variant||current.quantity<1)return;
    window.ViveroCart.add({
      product_id:current.product.id,
      variant_id:current.variant.id,
      category_id:current.category.id,
      product_name:current.product.name,
      variant_label:current.variant.label,
      liters:current.variant.liters,
      category_name:current.category.name,
      quantity:current.quantity,
      unit_price:Number(current.variant.price),
      image_url:current.product.image_url||"",
      length_m:current.linear?Number($("calcLength").value):null,
      spacing_cm:current.linear?Number($("calcSpacing").value):null
    });
    $("addedChoice").hidden=false;
    $("addedChoice").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function renderCheckout(){
    const items=window.ViveroCart.get();
    $("checkoutItems").innerHTML=items.length?items.map(x=>`
      <div class="checkout-item" data-cart-id="${x.id}">
        ${x.image_url?`<img src="${x.image_url}" alt="">`:`<div class="checkout-placeholder">MP</div>`}
        <div class="checkout-item-copy">
          <strong>${x.product_name}</strong>
          <span>${x.category_name} · ${x.variant_label}${x.liters?` · ${x.liters} L`:""}</span>
          ${x.length_m?`<span>${x.length_m} m · distancia ${x.spacing_cm} cm</span>`:""}
        </div>
        <label>Cantidad<input class="checkout-qty" type="number" min="1" value="${x.quantity}" data-qty-id="${x.id}"></label>
        <strong class="checkout-subtotal">${money(Number(x.unit_price)*Number(x.quantity))}</strong>
        <button class="checkout-remove" type="button" data-remove-id="${x.id}">Eliminar</button>
      </div>`).join(""):`<div class="cart-empty">El carrito está vacío. Podés volver al catálogo y agregar plantas.</div>`;
    $("checkoutTotal").textContent=money(window.ViveroCart.total());
    $("confirmWhatsappBtn").disabled=!items.length;
  }

  function showCheckout(){
    $("checkoutSection").hidden=false;
    renderCheckout();
    setTimeout(()=>$("checkoutSection").scrollIntoView({behavior:"smooth",block:"start"}),80);
  }

  $("calcCategory").addEventListener("change",()=>{renderProducts();renderPresentations();renderLiters();$("calcSpacing").dataset.touched="";calculate()});
  $("calcProduct").addEventListener("change",()=>{renderPresentations();renderLiters();$("calcSpacing").dataset.touched="";calculate()});
  $("calcPresentation").addEventListener("change",()=>{renderLiters();calculate()});
  $("calcLiters").addEventListener("change",calculate);
  ["calcLength","calcQuantityInput"].forEach(id=>$(id).addEventListener("input",calculate));
  $("calcSpacing").addEventListener("input",()=>{$("calcSpacing").dataset.touched="1";calculate()});

  $("addToCartBtn").addEventListener("click",addCurrentToCart);
  $("keepShoppingBtn").addEventListener("click",()=>{location.href="./#catalogo"});
  $("continueOrderBtn").addEventListener("click",showCheckout);
  $("clearCartBtn").addEventListener("click",()=>{if(confirm("¿Eliminar todos los artículos del carrito?")){window.ViveroCart.clear();renderCheckout()}});
  window.addEventListener("viverocartchange",renderCheckout);

  $("checkoutItems").addEventListener("input",e=>{
    if(!e.target.matches(".checkout-qty"))return;
    window.ViveroCart.updateQty(e.target.dataset.qtyId,e.target.value);
  });
  $("checkoutItems").addEventListener("click",e=>{
    if(!e.target.dataset.removeId)return;
    window.ViveroCart.remove(e.target.dataset.removeId);
    renderCheckout();
  });

  $("orderForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const cart=window.ViveroCart.get();
    if(!cart.length)return;
    const btn=$("confirmWhatsappBtn");btn.disabled=true;$("orderMessage").textContent="Registrando solicitud...";
    try{
      const payload=cart.map(x=>({
        product_id:x.product_id,
        variant_id:x.variant_id,
        category_id:x.category_id,
        quantity:Number(x.quantity),
        length_m:x.length_m||null,
        spacing_cm:x.spacing_cm||null
      }));
      const {data,error}=await db.rpc("create_cart_order",{
        p_customer_name:$("customerName").value.trim(),
        p_shipping_address:$("customerAddress").value.trim(),
        p_postal_code:$("customerPostal").value.trim(),
        p_general_question:$("customerQuestion").value.trim(),
        p_items:payload
      });
      if(error)throw error;
      const order=Array.isArray(data)?data[0]:data;
      const code=order.order_code;
      const lines=[
        `Hola Mi Primavera. Quiero confirmar la solicitud ${code}.`,
        ``,
        `Cliente: ${$("customerName").value.trim()}`,
        `Dirección: ${$("customerAddress").value.trim()}`,
        `CP: ${$("customerPostal").value.trim()}`,
        ``,
        `ARTÍCULOS:`,
        ...cart.map((x,i)=>`${i+1}. ${x.product_name} · ${x.variant_label}${x.liters?` · ${x.liters} L`:""} · Cant.: ${x.quantity} · ${money(Number(x.unit_price)*Number(x.quantity))}`),
        ``,
        `Total estimado: ${money(cart.reduce((s,x)=>s+Number(x.unit_price)*Number(x.quantity),0))}`,
        $("customerQuestion").value.trim()?`Consulta: ${$("customerQuestion").value.trim()}`:null
      ].filter(x=>x!==null);
      const digits=String(settings.whatsapp||"").replace(/\D/g,"");
      window.ViveroCart.clear();
      $("orderMessage").textContent=`Solicitud ${code} registrada. Abriendo WhatsApp...`;
      if(!digits)throw new Error(`La solicitud ${code} quedó registrada, pero falta configurar el WhatsApp del vivero en el panel.`);
      setTimeout(()=>{location.href=`https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`},400);
    }catch(err){
      console.error(err);$("orderMessage").textContent=err.message||"No se pudo registrar la solicitud.";btn.disabled=false;
    }
  });

  load().catch(err=>{console.error(err);$("orderMessage").textContent="No se pudo cargar la calculadora."});
})();
