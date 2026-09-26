(() => {
  const cfg=window.VIVERO_CONFIG;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n||0));
  let cats=[],products=[],assocs=[],variants=[],settings={};
  let current={category:null,product:null,assoc:null,variant:null,quantity:0,total:0};

  async function load(){
    const [cr,pr,ar,vr,sr]=await Promise.all([
      db.from("categories").select("*").eq("active",true).order("sort_order").order("name"),
      db.from("products").select("*").eq("active",true).order("sort_order").order("name"),
      db.from("product_categories").select("*").order("sort_order"),
      db.from("product_variants").select("*").eq("active",true).order("sort_order"),
      db.from("site_settings").select("*").eq("id",1).maybeSingle()
    ]);
    [cr,pr,ar,vr].forEach(r=>{if(r.error) throw r.error});
    cats=cr.data||[];products=pr.data||[];assocs=ar.data||[];variants=vr.data||[];settings=sr.data||{};
    renderCategories();
    const params=new URLSearchParams(location.search);
    if(params.get("category") && cats.some(c=>c.id===params.get("category"))) $("calcCategory").value=params.get("category");
    renderProducts();
    if(params.get("product") && products.some(p=>p.id===params.get("product"))) $("calcProduct").value=params.get("product");
    renderVariants();
    calculate();
  }

  function renderCategories(){
    $("calcCategory").innerHTML=cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
  }
  function renderProducts(){
    const cid=$("calcCategory").value;
    const pids=assocs.filter(a=>a.category_id===cid).map(a=>a.product_id);
    const list=products.filter(p=>pids.includes(p.id));
    $("calcProduct").innerHTML=list.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
  }
  function renderVariants(){
    const pid=$("calcProduct").value;
    const list=variants.filter(v=>v.product_id===pid && v.availability==="in_stock");
    $("calcVariant").innerHTML=list.length?list.map(v=>`<option value="${v.id}">${v.label} — ${money(v.price)}</option>`).join(""):`<option value="">Sin presentaciones en stock</option>`;
    $("continueOrderBtn").disabled=!list.length;
  }
  function calculate(){
    const cid=$("calcCategory").value,pid=$("calcProduct").value,vid=$("calcVariant").value;
    const category=cats.find(c=>c.id===cid)||null;
    const product=products.find(p=>p.id===pid)||null;
    const assoc=assocs.find(a=>a.category_id===cid && a.product_id===pid)||null;
    const variant=variants.find(v=>v.id===vid)||null;
    const linear=category?.calculation_mode==="linear";
    $("linearFields").hidden=!linear;$("unitFields").hidden=linear;

    if(product){
      $("calcProductPreview").innerHTML=`${product.image_url?`<img src="${product.image_url}" alt="">`:""}<div><strong>${product.name}</strong><span>${product.description||""}</span></div>`;
    } else $("calcProductPreview").innerHTML="";

    if(linear){
      const recommended=Number(assoc?.recommended_spacing_cm||70);
      if(!$("calcSpacing").dataset.touched) $("calcSpacing").value=recommended;
      $("spacingHelp").textContent=`Distancia recomendada para esta planta en esta categoría: ${recommended} cm.`;
    }
    let qty=0;
    if(linear){
      const length=Number($("calcLength").value||0),spacing=Number($("calcSpacing").value||0);
      qty=length>0&&spacing>0?Math.ceil((length*100)/spacing):0;
    }else qty=Math.max(1,Math.floor(Number($("calcQuantityInput").value||1)));
    const unit=Number(variant?.price||0),total=qty*unit;
    $("resultQty").textContent=qty.toLocaleString("es-AR");
    $("resultUnitPrice").textContent=money(unit);
    $("resultTotal").textContent=money(total);
    current={category,product,assoc,variant,quantity:qty,total};
  }

  function updateSummary(){
    const c=current;
    $("orderSummary").innerHTML=`<strong>Resumen de la solicitud</strong><br>${c.product?.name||""} · ${c.variant?.label||""}<br>Cantidad: ${c.quantity} · Total estimado: ${money(c.total)}${c.category?.calculation_mode==="linear"?`<br>Uso: ${c.category.name} · ${$("calcLength").value} m · distancia ${$("calcSpacing").value} cm`:`<br>Categoría: ${c.category?.name||""}`}`;
  }

  $("calcCategory").addEventListener("change",()=>{renderProducts();renderVariants();$("calcSpacing").dataset.touched="";calculate()});
  $("calcProduct").addEventListener("change",()=>{renderVariants();$("calcSpacing").dataset.touched="";calculate()});
  $("calcVariant").addEventListener("change",calculate);
  ["calcLength","calcQuantityInput"].forEach(id=>$(id).addEventListener("input",calculate));
  $("calcSpacing").addEventListener("input",()=>{$("calcSpacing").dataset.touched="1";calculate()});

  $("continueOrderBtn").addEventListener("click",()=>{
    calculate();
    if(!current.variant || current.quantity<1) return;
    updateSummary();$("orderFormSection").hidden=false;$("orderFormSection").scrollIntoView({behavior:"smooth"});
  });

  $("orderForm").addEventListener("submit",async e=>{
    e.preventDefault();calculate();
    const btn=$("confirmWhatsappBtn");btn.disabled=true;$("orderMessage").textContent="Registrando solicitud...";
    try{
      const linear=current.category?.calculation_mode==="linear";
      const {data,error}=await db.rpc("create_order",{
        p_customer_name:$("customerName").value.trim(),
        p_shipping_address:$("customerAddress").value.trim(),
        p_postal_code:$("customerPostal").value.trim(),
        p_general_question:$("customerQuestion").value.trim(),
        p_product_id:current.product.id,
        p_variant_id:current.variant.id,
        p_category_id:current.category.id,
        p_quantity:current.quantity,
        p_length_m:linear?Number($("calcLength").value):null,
        p_spacing_cm:linear?Number($("calcSpacing").value):null
      });
      if(error) throw error;
      const order=Array.isArray(data)?data[0]:data;
      const code=order.order_code;
      const lines=[
        `Hola Mi Primavera. Quiero confirmar la solicitud ${code}.`,
        ``,
        `Cliente: ${$("customerName").value.trim()}`,
        `Dirección: ${$("customerAddress").value.trim()}`,
        `CP: ${$("customerPostal").value.trim()}`,
        `Categoría: ${current.category.name}`,
        `Planta: ${current.product.name}`,
        `Presentación: ${current.variant.label}`,
        linear?`Metros: ${$("calcLength").value}`:null,
        linear?`Distancia: ${$("calcSpacing").value} cm`:null,
        `Cantidad: ${current.quantity}`,
        `Total estimado: ${money(current.total)}`,
        $("customerQuestion").value.trim()?`Consulta: ${$("customerQuestion").value.trim()}`:null
      ].filter(Boolean);
      $("orderMessage").textContent=`Solicitud ${code} registrada. Abriendo WhatsApp...`;
      const digits=String(settings.whatsapp||"").replace(/\D/g,"");
      if(!digits) throw new Error(`La solicitud ${code} quedó registrada, pero falta configurar el WhatsApp del vivero en el panel.`);
      setTimeout(()=>{location.href=`https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`},450);
    }catch(err){
      console.error(err);$("orderMessage").textContent=err.message||"No se pudo registrar la solicitud.";btn.disabled=false;
    }
  });

  load().catch(err=>{console.error(err);$("orderMessage").textContent="No se pudo cargar la calculadora."});
})();
