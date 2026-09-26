(() => {
  const cfg=window.VIVERO_CONFIG;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n||0));
  const slugify=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  let products=[],categories=[],assocs=[],variants=[],settings={},orders=[],orderItems=[],currentUser=null,removingVideo=false;

  function toast(m){$("adminToast").textContent=m;$("adminToast").classList.add("show");setTimeout(()=>$("adminToast").classList.remove("show"),2300)}
  function msg(id,m="",type=""){$(id).textContent=m;$(id).className=`form-message ${type}`.trim()}
  async function isAdmin(uid){
    const {data,error}=await db.from("admin_users").select("user_id").eq("user_id",uid).maybeSingle();
    if(error){console.error(error);return false} return !!data;
  }
  async function refreshAuth(){
    const {data:{session}}=await db.auth.getSession();currentUser=session?.user||null;
    if(!currentUser){$("loginView").hidden=false;$("dashboard").hidden=true;$("logoutBtn").hidden=true;return}
    if(!await isAdmin(currentUser.id)){$("loginView").hidden=false;$("dashboard").hidden=true;$("logoutBtn").hidden=false;msg("loginMessage","Este usuario no está autorizado como administrador.","error");return}
    $("loginView").hidden=true;$("dashboard").hidden=false;$("logoutBtn").hidden=false;msg("loginMessage","");
    await loadAll();
  }
  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();msg("loginMessage","Ingresando...");
    const {error}=await db.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
    if(error)return msg("loginMessage",error.message,"error");
    await refreshAuth();
  });
  $("logoutBtn").addEventListener("click",async()=>{await db.auth.signOut();location.reload()});

  async function loadAll(){
    const [pr,cr,ar,vr,sr,or,oir]=await Promise.all([
      db.from("products").select("*").order("sort_order").order("name"),
      db.from("categories").select("*").order("sort_order").order("name"),
      db.from("product_categories").select("*").order("sort_order"),
      db.from("product_variants").select("*").order("sort_order"),
      db.from("site_settings").select("*").eq("id",1).maybeSingle(),
      db.from("orders").select("*").order("created_at",{ascending:false}),
      db.from("order_items").select("*").order("created_at")
    ]);
    [pr,cr,ar,vr,or,oir].forEach(r=>{if(r.error)throw r.error});
    products=pr.data||[];categories=cr.data||[];assocs=ar.data||[];variants=vr.data||[];settings=sr.data||{};orders=or.data||[];orderItems=oir.data||[];
    renderStats();renderCategoryChoices();renderProducts();renderCategories();renderOrders();fillSettings();
    if(!$("variantRows").children.length) addVariantRow();
  }

  function renderStats(){
    $("statProducts").textContent=products.filter(p=>p.active).length;
    $("statCategories").textContent=categories.filter(c=>c.active).length;
    $("statPending").textContent=orders.filter(o=>o.status==="pending_confirmation").length;
    const dispatched=orders.filter(o=>o.status==="dispatched");
    const sales=dispatched.reduce((sum,o)=>sum+orderTotals(o.id).sales,0);
    $("statSales").textContent=money(sales);
  }
  function renderCategoryChoices(selected={},spacingMap={}){
    $("productCategoryChoices").innerHTML=categories.length?categories.map(c=>`
      <label class="category-choice">
        <input type="checkbox" class="pc-check" value="${c.id}" ${selected[c.id]?"checked":""}>
        <span>${esc(c.name)}${c.calculation_mode==="linear"?" · lineal":""}</span>
        <span class="spacing-wrap" ${c.calculation_mode==="linear"?"":"hidden"}>
          <input type="number" min="1" step="1" class="pc-spacing" data-category="${c.id}" value="${spacingMap[c.id]??70}">
          <small>cm recomendados</small>
        </span>
      </label>`).join(""):`<p class="form-message">Primero creá una categoría.</p>`;
  }
  function addVariantRow(v={}){
    const div=document.createElement("div");div.className="variant-row";div.dataset.variantId=v.id||"";
    div.innerHTML=`
      <label>Tipo de presentación<input class="v-label" value="${esc(v.label||"")}" placeholder="Ej.: Maceta soplada, Terrón"></label>
      <label>Litros<input class="v-liters" type="number" min="0.1" step="0.1" value="${v.liters??""}" placeholder="Ej.: 3, 10, 15"></label>
      <label>Precio<input class="v-price" type="number" min="0" step="0.01" value="${v.price??0}"></label>
      <label>Costo<input class="v-cost" type="number" min="0" step="0.01" value="${v.cost??0}"></label>
      <label>Estado<select class="v-availability"><option value="in_stock" ${v.availability!=="consult"?"selected":""}>🟢 En stock</option><option value="consult" ${v.availability==="consult"?"selected":""}>Consultar</option></select></label>
      <button type="button" class="variant-remove">✕</button>`;
    div.querySelector(".variant-remove").addEventListener("click",()=>{if($("variantRows").children.length>1)div.remove();else toast("La planta debe tener al menos una presentación.")});
    $("variantRows").appendChild(div);
  }
  $("addVariantBtn").addEventListener("click",()=>addVariantRow());

  async function uploadImage(file,slug,type){
    if(!file)return null;
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase(),path=`${slug}/${type}-${Date.now()}.${ext}`;
    const {error}=await db.storage.from("product-images").upload(path,file,{cacheControl:"3600",upsert:false});
    if(error)throw error;return db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  }
  function gatherVariants(){
    return [...$("variantRows").children].map((row,i)=>({
      id:row.dataset.variantId||null,label:row.querySelector(".v-label").value.trim(),liters:row.querySelector(".v-liters").value?Number(row.querySelector(".v-liters").value):null,
      price:Number(row.querySelector(".v-price").value||0),cost:Number(row.querySelector(".v-cost").value||0),availability:row.querySelector(".v-availability").value,active:true,sort_order:i
    })).filter(v=>v.label);
  }
  function gatherCategoryMap(){
    return [...document.querySelectorAll(".pc-check:checked")].map((ch,i)=>{
      const c=categories.find(x=>x.id===ch.value);
      const spacing=c?.calculation_mode==="linear"?Number(document.querySelector(`.pc-spacing[data-category="${ch.value}"]`).value||70):null;
      return {category_id:ch.value,recommended_spacing_cm:spacing,sort_order:i};
    });
  }

  $("productForm").addEventListener("submit",async e=>{
    e.preventDefault();msg("productMessage","Guardando...");
    try{
      const name=$("productName").value.trim(),slug=slugify(name),catMap=gatherCategoryMap(),vrows=gatherVariants();
      if(!name||!slug)throw new Error("Ingresá un nombre válido.");
      if(!catMap.length)throw new Error("Elegí al menos una categoría.");
      if(!vrows.length)throw new Error("Agregá al menos una presentación.");
      let main=$("currentMainImage").value||null,integrated=$("currentIntegratedImage").value||null,info=$("currentInfoImage").value||null;
      const files=[["productImageMain","main"],["productImageIntegrated","integrated"],["productImageInfo","info"]];
      for(const [id,type] of files){
        const file=$(id).files[0];if(file){const url=await uploadImage(file,slug,type);if(type==="main")main=url;if(type==="integrated")integrated=url;if(type==="info")info=url}
      }
      const first=vrows[0],payload={
        category_id:catMap[0].category_id,name,slug,description:$("productDescription").value.trim(),price:first.price,cost:first.cost,
        availability:vrows.some(v=>v.availability==="in_stock")?"in_stock":"consult",pot_size:first.label,image_url:main,integrated_image_url:integrated,info_image_url:info,
        featured:$("productFeatured").checked,sort_order:Number($("productOrder").value||0),active:$("productActive").checked,updated_at:new Date().toISOString()
      };
      let product;
      if($("productId").value){
        const {data,error}=await db.from("products").update(payload).eq("id",$("productId").value).select().single();if(error)throw error;product=data;
      }else{
        const {data,error}=await db.from("products").insert(payload).select().single();if(error)throw error;product=data;
      }
      const {error:delAssocErr}=await db.from("product_categories").delete().eq("product_id",product.id);if(delAssocErr)throw delAssocErr;
      const {error:assocErr}=await db.from("product_categories").insert(catMap.map(x=>({...x,product_id:product.id})));if(assocErr)throw assocErr;

      const existing=variants.filter(v=>v.product_id===product.id),keep=[];
      for(const v of vrows){
        const vp={product_id:product.id,label:v.label,liters:v.liters,price:v.price,cost:v.cost,availability:v.availability,active:true,sort_order:v.sort_order,updated_at:new Date().toISOString()};
        if(v.id){
          const {error}=await db.from("product_variants").update(vp).eq("id",v.id);if(error)throw error;keep.push(v.id);
        }else{
          const {data,error}=await db.from("product_variants").insert(vp).select("id").single();if(error)throw error;keep.push(data.id);
        }
      }
      for(const old of existing){if(!keep.includes(old.id)){const {error}=await db.from("product_variants").delete().eq("id",old.id);if(error)throw error}}
      resetProductForm();await loadAll();toast("Planta guardada");
    }catch(err){console.error(err);msg("productMessage",err.message||"No se pudo guardar.","error")}
  });

  function resetProductForm(){
    $("productForm").reset();$("productId").value="";$("currentMainImage").value="";$("currentIntegratedImage").value="";$("currentInfoImage").value="";
    $("productOrder").value=0;$("productActive").checked=true;$("productFeatured").checked=false;$("productFormTitle").textContent="Agregar planta";$("cancelProductEdit").hidden=true;
    $("variantRows").innerHTML="";addVariantRow();renderCategoryChoices();["mainImageState","integratedImageState","infoImageState"].forEach(id=>$(id).textContent="");msg("productMessage","");
  }

  function renderProducts(){
    const term=$("productSearch").value.trim().toLowerCase();
    const list=products.filter(p=>!term||p.name.toLowerCase().includes(term));
    $("productList").innerHTML=list.length?list.map(p=>{
      const cs=assocs.filter(a=>a.product_id===p.id).map(a=>categories.find(c=>c.id===a.category_id)?.name).filter(Boolean).join(", ");
      const vs=variants.filter(v=>v.product_id===p.id).map(v=>v.label).join(", ");
      return `<div class="item-row"><div><div class="item-title">${esc(p.name)} ${p.active?"":"· Oculta"}</div><div class="item-meta">${esc(cs||"Sin categoría")} · ${esc(vs||"Sin presentación")} · posición ${p.sort_order}</div></div><div class="item-actions"><button class="small-btn" data-edit-product="${p.id}">Editar</button><button class="small-btn" data-toggle-product="${p.id}">${p.active?"Ocultar":"Mostrar"}</button><button class="small-btn danger" data-delete-product="${p.id}">Eliminar</button></div></div>`;
    }).join(""):`<p class="form-message">No hay plantas.</p>`;
  }
  $("productSearch").addEventListener("input",renderProducts);
  $("productList").addEventListener("click",async e=>{
    const edit=e.target.dataset.editProduct,toggle=e.target.dataset.toggleProduct,del=e.target.dataset.deleteProduct;
    if(edit){
      const p=products.find(x=>x.id===edit);if(!p)return;
      $("productId").value=p.id;$("productName").value=p.name;$("productDescription").value=p.description||"";$("productOrder").value=p.sort_order;$("productFeatured").checked=p.featured;$("productActive").checked=p.active;
      $("currentMainImage").value=p.image_url||"";$("currentIntegratedImage").value=p.integrated_image_url||"";$("currentInfoImage").value=p.info_image_url||"";
      $("mainImageState").textContent=p.image_url?"Foto actual cargada":"";$("integratedImageState").textContent=p.integrated_image_url?"Foto actual cargada":"";$("infoImageState").textContent=p.info_image_url?"Ficha actual cargada":"";
      const pa=assocs.filter(a=>a.product_id===p.id),selected={},sp={};pa.forEach(a=>{selected[a.category_id]=true;sp[a.category_id]=a.recommended_spacing_cm});
      renderCategoryChoices(selected,sp);$("variantRows").innerHTML="";variants.filter(v=>v.product_id===p.id).forEach(addVariantRow);if(!$("variantRows").children.length)addVariantRow();
      $("productFormTitle").textContent=`Editar: ${p.name}`;$("cancelProductEdit").hidden=false;scrollTo({top:220,behavior:"smooth"});
    }
    if(toggle){const p=products.find(x=>x.id===toggle);const {error}=await db.from("products").update({active:!p.active,updated_at:new Date().toISOString()}).eq("id",p.id);if(error)return toast(error.message);await loadAll()}
    if(del){const p=products.find(x=>x.id===del);if(!confirm(`¿Eliminar "${p.name}"?`))return;const {error}=await db.from("products").delete().eq("id",p.id);if(error)return toast(error.message);await loadAll();toast("Planta eliminada")}
  });
  $("newProductBtn").addEventListener("click",resetProductForm);$("cancelProductEdit").addEventListener("click",resetProductForm);

  $("categoryForm").addEventListener("submit",async e=>{
    e.preventDefault();msg("categoryMessage","Guardando...");
    const payload={name:$("categoryName").value.trim(),slug:slugify($("categoryName").value),description:$("categoryDescription").value.trim(),sort_order:Number($("categoryOrder").value||0),calculation_mode:$("categoryMode").value,active:$("categoryActive").checked,updated_at:new Date().toISOString()};
    const q=$("categoryId").value?db.from("categories").update(payload).eq("id",$("categoryId").value):db.from("categories").insert(payload);const {error}=await q;
    if(error)return msg("categoryMessage",error.message,"error");resetCategoryForm();await loadAll();toast("Categoría guardada");
  });
  function resetCategoryForm(){$("categoryForm").reset();$("categoryId").value="";$("categoryOrder").value=0;$("categoryMode").value="unit";$("categoryActive").checked=true;$("categoryFormTitle").textContent="Agregar categoría";$("cancelCategoryEdit").hidden=true;msg("categoryMessage","")}
  function renderCategories(){
    $("categoryList").innerHTML=categories.map(c=>`<div class="item-row"><div><div class="item-title">${esc(c.name)} ${c.active?"":"· Oculta"}</div><div class="item-meta">${c.calculation_mode==="linear"?"Metros lineales":"Por unidades"} · posición ${c.sort_order}</div></div><div class="item-actions"><button class="small-btn" data-edit-category="${c.id}">Editar</button><button class="small-btn danger" data-delete-category="${c.id}">Eliminar</button></div></div>`).join("");
  }
  $("categoryList").addEventListener("click",async e=>{
    const edit=e.target.dataset.editCategory,del=e.target.dataset.deleteCategory;
    if(edit){const c=categories.find(x=>x.id===edit);$("categoryId").value=c.id;$("categoryName").value=c.name;$("categoryDescription").value=c.description||"";$("categoryOrder").value=c.sort_order;$("categoryMode").value=c.calculation_mode;$("categoryActive").checked=c.active;$("categoryFormTitle").textContent=`Editar: ${c.name}`;$("cancelCategoryEdit").hidden=false;scrollTo({top:220,behavior:"smooth"})}
    if(del){if(assocs.some(a=>a.category_id===del))return toast("Quitá primero las plantas de esta categoría.");if(!confirm("¿Eliminar categoría?"))return;const {error}=await db.from("categories").delete().eq("id",del);if(error)return toast(error.message);await loadAll()}
  });
  $("newCategoryBtn").addEventListener("click",resetCategoryForm);$("cancelCategoryEdit").addEventListener("click",resetCategoryForm);

  function statusLabel(s){return s==="pending_confirmation"?"Pedido a confirmar":s==="confirmed"?"Confirmado":s==="dispatched"?"Despachado":"Cancelado"}
  function statusClass(s){return s==="pending_confirmation"?"pending":s==="confirmed"?"confirmed":s==="dispatched"?"dispatched":"cancelled"}
  function orderTotals(orderId){
    const o=orders.find(x=>x.id===orderId),items=orderItems.filter(i=>i.order_id===orderId);
    const sales=items.reduce((s,i)=>s+Number(i.unit_price)*Number(i.quantity),0);
    const cost=items.reduce((s,i)=>s+Number(i.unit_cost)*Number(i.quantity),0)+Number(o?.extra_cost||0);
    return {sales,cost,profit:sales-cost};
  }
  function catalogOptions(){
    const opts=[];
    products.forEach(p=>variants.filter(v=>v.product_id===p.id&&v.active).forEach(v=>opts.push(`<option value="${v.id}">${esc(p.name)} — ${esc(v.label)} — ${money(v.price)}</option>`)));
    return `<option value="">Ítem personalizado</option>${opts.join("")}`;
  }
  function renderOrders(){
    $("orderList").innerHTML=orders.length?orders.map(o=>{
      const items=orderItems.filter(i=>i.order_id===o.id),t=orderTotals(o.id);
      return `<article class="order-card" data-order="${o.id}">
        <div class="order-head"><div><div class="order-code">${esc(o.order_code)}</div><div class="order-meta">${new Date(o.created_at).toLocaleString("es-AR")} · ${items.length} ítem(s)</div></div><span class="badge ${statusClass(o.status)}">${statusLabel(o.status)}</span></div>
        <div class="order-body">
          <div class="order-customer"><div><span>Cliente</span><strong>${esc(o.customer_name)}</strong></div><div><span>Dirección</span><strong>${esc(o.shipping_address)}</strong></div><div><span>CP</span><strong>${esc(o.postal_code)}</strong></div></div>
          ${o.general_question?`<p class="item-meta"><strong>Consulta:</strong> ${esc(o.general_question)}</p>`:""}
          <div class="order-items">${items.map(i=>`<div class="order-item-row" data-item="${i.id}">
            <label>Ítem<input class="oi-name" value="${esc(i.item_name+(i.variant_label?` · ${i.variant_label}`:""))}"></label>
            <label>Cant.<input class="oi-qty" type="number" min="1" value="${i.quantity}"></label>
            <label>Precio u.<input class="oi-price" type="number" min="0" step="0.01" value="${i.unit_price}"></label>
            <label>Costo u.<input class="oi-cost" type="number" min="0" step="0.01" value="${i.unit_cost}"></label>
            <button class="small-btn danger" data-delete-item="${i.id}">Quitar</button>
          </div>`).join("")}</div>
          <div class="order-total-row"><span>Venta: ${money(t.sales)}</span><span>Costo: ${money(t.cost)}</span><span>Ganancia: ${money(t.profit)}</span></div>
          <label>Otros costos del pedido<input class="order-extra-cost" type="number" min="0" step="0.01" value="${o.extra_cost||0}"></label>
          <div class="add-item-box"><strong>Agregar ítem</strong><div class="add-item-grid">
            <label>Producto / presentación<select class="add-catalog-variant">${catalogOptions()}</select></label>
            <label>Cant.<input class="add-qty" type="number" min="1" value="1"></label>
            <label>Precio<input class="add-price" type="number" min="0" value="0"></label>
            <label>Costo<input class="add-cost" type="number" min="0" value="0"></label>
            <button class="small-btn" data-add-item="${o.id}">Agregar</button>
          </div><label class="custom-name-wrap">Nombre personalizado<input class="add-custom-name" placeholder="Ej.: Tierra abonada"></label></div>
          <div class="order-actions">
            <button class="small-btn" data-save-order="${o.id}">Guardar cambios</button>
            ${o.status==="pending_confirmation"?`<button class="status-btn confirm" data-confirm-order="${o.id}">Confirmar pedido</button>`:""}
            ${o.status==="confirmed"?`<button class="status-btn dispatch" data-dispatch-order="${o.id}">Pedido despachado</button>`:""}
            ${o.status!=="dispatched"&&o.status!=="cancelled"?`<button class="status-btn cancel" data-cancel-order="${o.id}">Cancelar</button>`:""}
          </div>
        </div>
      </article>`;
    }).join(""):`<p class="form-message">Todavía no hay pedidos.</p>`;

    document.querySelectorAll(".add-catalog-variant").forEach(sel=>sel.addEventListener("change",()=>{
      const card=sel.closest(".order-card"),v=variants.find(x=>x.id===sel.value),p=v?products.find(x=>x.id===v.product_id):null;
      card.querySelector(".add-price").value=v?.price||0;card.querySelector(".add-cost").value=v?.cost||0;card.querySelector(".custom-name-wrap").hidden=!!v;
      if(!v)card.querySelector(".add-custom-name").value="";
    }));
    const dispatched=orders.filter(o=>o.status==="dispatched"),tot=dispatched.reduce((a,o)=>{const t=orderTotals(o.id);a.sales+=t.sales;a.cost+=t.cost;a.profit+=t.profit;return a},{sales:0,cost:0,profit:0});
    $("summaryDispatched").textContent=dispatched.length;$("summarySales").textContent=money(tot.sales);$("summaryCosts").textContent=money(tot.cost);$("summaryProfit").textContent=money(tot.profit);
  }

  $("orderList").addEventListener("click",async e=>{
    const card=e.target.closest(".order-card");if(!card)return;const orderId=card.dataset.order;
    if(e.target.dataset.deleteItem){
      if(orderItems.filter(i=>i.order_id===orderId).length<=1)return toast("El pedido debe conservar al menos un ítem.");
      if(!confirm("¿Quitar este ítem?"))return;const {error}=await db.from("order_items").delete().eq("id",e.target.dataset.deleteItem);if(error)return toast(error.message);await loadAll();return;
    }
    if(e.target.dataset.saveOrder){
      try{
        for(const row of card.querySelectorAll(".order-item-row")){
          const id=row.dataset.item,rawName=row.querySelector(".oi-name").value.trim();
          const {error}=await db.from("order_items").update({item_name:rawName,variant_label:null,quantity:Number(row.querySelector(".oi-qty").value||1),unit_price:Number(row.querySelector(".oi-price").value||0),unit_cost:Number(row.querySelector(".oi-cost").value||0),updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;
        }
        const {error}=await db.from("orders").update({extra_cost:Number(card.querySelector(".order-extra-cost").value||0),updated_at:new Date().toISOString()}).eq("id",orderId);if(error)throw error;
        await loadAll();toast("Pedido actualizado");
      }catch(err){toast(err.message)}return;
    }
    if(e.target.dataset.addItem){
      const sel=card.querySelector(".add-catalog-variant"),v=variants.find(x=>x.id===sel.value),p=v?products.find(x=>x.id===v.product_id):null;
      const qty=Number(card.querySelector(".add-qty").value||1),price=Number(card.querySelector(".add-price").value||0),cost=Number(card.querySelector(".add-cost").value||0);
      const name=v?p.name:card.querySelector(".add-custom-name").value.trim();if(!name)return toast("Escribí el nombre del ítem.");
      const payload={order_id:orderId,product_id:p?.id||null,variant_id:v?.id||null,item_name:name,variant_label:v?.label||null,quantity:qty,unit_price:price,unit_cost:cost,updated_at:new Date().toISOString()};
      const {error}=await db.from("order_items").insert(payload);if(error)return toast(error.message);await loadAll();toast("Ítem agregado");return;
    }
    const status=e.target.dataset.confirmOrder?"confirmed":e.target.dataset.dispatchOrder?"dispatched":e.target.dataset.cancelOrder?"cancelled":null;
    if(status){
      const patch={status,updated_at:new Date().toISOString()};if(status==="confirmed")patch.confirmed_at=new Date().toISOString();if(status==="dispatched")patch.dispatched_at=new Date().toISOString();
      const {error}=await db.from("orders").update(patch).eq("id",orderId);if(error)return toast(error.message);await loadAll();toast(status==="dispatched"?"Pedido marcado como despachado":"Estado actualizado");
    }
  });

  function fillSettings(){
    $("settingName").value=settings.nursery_name||"Mi Primavera";$("settingTagline").value=settings.tagline||"";$("settingWhatsapp").value=settings.whatsapp||"";$("settingShippingTitle").value=settings.shipping_title||"Envíos";$("settingShippingText").value=settings.shipping_text||"";$("settingInstagram").value=settings.instagram_url||"";$("settingFacebook").value=settings.facebook_url||"";$("settingAboutTitle").value=settings.about_title||"Acerca de nosotros";$("settingAboutText").value=settings.about_text||"";
    $("currentVideoWrap").hidden=!settings.hero_video_url;if(settings.hero_video_url)$("currentVideoLink").href=settings.hero_video_url;removingVideo=false;
  }
  async function uploadVideo(file){
    const ext=(file.name.split(".").pop()||"mp4").toLowerCase(),path=`hero/${Date.now()}.${ext}`;const {error}=await db.storage.from("site-media").upload(path,file,{cacheControl:"3600",upsert:false});if(error)throw error;return db.storage.from("site-media").getPublicUrl(path).data.publicUrl;
  }
  $("removeVideoBtn").addEventListener("click",()=>{removingVideo=true;$("currentVideoWrap").hidden=true;toast("Se quitará al guardar")});
  $("settingsForm").addEventListener("submit",async e=>{
    e.preventDefault();msg("settingsMessage","Guardando...");
    try{
      let hero=removingVideo?"":settings.hero_video_url||"";if($("heroVideoFile").files[0])hero=await uploadVideo($("heroVideoFile").files[0]);
      const payload={nursery_name:$("settingName").value.trim()||"Mi Primavera",tagline:$("settingTagline").value.trim(),whatsapp:$("settingWhatsapp").value.trim(),hero_video_url:hero,shipping_title:$("settingShippingTitle").value.trim(),shipping_text:$("settingShippingText").value.trim(),about_title:$("settingAboutTitle").value.trim(),about_text:$("settingAboutText").value.trim(),instagram_url:$("settingInstagram").value.trim(),facebook_url:$("settingFacebook").value.trim(),updated_at:new Date().toISOString()};
      const {error}=await db.from("site_settings").update(payload).eq("id",1);if(error)throw error;settings={...settings,...payload};fillSettings();msg("settingsMessage","Configuración guardada.","success");toast("Sitio actualizado");
    }catch(err){msg("settingsMessage",err.message,"error")}
  });

  document.querySelectorAll(".tab-btn").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));btn.classList.add("active");$(btn.dataset.tab).classList.add("active")}));
  function num(id){return Number($(id).value||0)}
  function calcProfit(){const base=num("calcPlant")+num("calcInputs")+num("calcSupplierTransport")+num("calcDelivery")+num("calcOther"),sale=num("calcSale"),fee=num("calcFee")/100,target=num("calcTargetMargin")/100,commission=sale*fee,profit=sale-base-commission,margin=sale?profit/sale*100:0,markup=base?profit/base*100:0,den=1-fee-target,suggested=den>0?base/den:0;$("calcBaseResult").textContent=money(base);$("calcFeeResult").textContent=money(commission);$("calcProfitResult").textContent=money(profit);$("calcMarginResult").textContent=`${margin.toFixed(1)}%`;$("calcMarkupResult").textContent=`${markup.toFixed(1)}%`;$("calcSuggestedResult").textContent=den>0?money(suggested):"Revisar %"}
  document.querySelectorAll(".calc-input").forEach(i=>i.addEventListener("input",calcProfit));calcProfit();

  db.auth.onAuthStateChange(()=>setTimeout(refreshAuth,0));
  refreshAuth().catch(err=>console.error(err));
})();
