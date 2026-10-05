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
    $("statPending").textContent=orders.filter(o=>o.status==="pending_confirmation").length;
    $("statConfirmed").textContent=orders.filter(o=>o.status==="confirmed").length;
    $("statDispatched").textContent=orders.filter(o=>o.status==="dispatched").length;
  }
  function renderCategoryChoices(selected={}){
    $("productCategoryChoices").innerHTML=categories.length?categories.map(c=>`
      <label class="category-choice">
        <input type="checkbox" class="pc-check" value="${c.id}" ${selected[c.id]?"checked":""}>
        <span>${esc(c.name)}${c.calculation_mode==="linear"?" · cálculo por metros lineales":""}</span>
      </label>`).join(""):`<p class="form-message">Primero creá una categoría.</p>`;
  }

  function spacingCaption(index){
    const spacing=$("productSpacing"+index)?.value?.trim();
    return spacing?` (${spacing} cm)`:"";
  }
  function updateClosureLabels(row){
    if(!row)return;
    [1,2,3].forEach(i=>{
      const label=row.querySelector(`.closure-label-${i}`);
      if(label)label.textContent=`Para distancia ${i}${spacingCaption(i,row)}`;
    });
  }
  function updateAllClosureLabels(){
    [...$("variantRows").children].forEach(updateClosureLabels);
  }

  function addVariantRow(v={}){
    const div=document.createElement("div");
    div.className="variant-row";
    div.dataset.variantId=v.id||"";
    div.innerHTML=`
      <div class="variant-main-grid">
        <label>Tipo de presentación<input class="v-label" value="${esc(v.label||"")}" placeholder="Ej.: Maceta soplada, Terrón"></label>
        <label>Litros <span class="optional-tag">opcional</span><input class="v-liters" type="number" min="0.1" step="0.1" value="${v.liters??""}" placeholder="Ej.: 10"></label>
        <label>Altura <span class="optional-tag">opcional</span><input class="v-height" value="${esc(v.height||"")}" placeholder="Ej.: 1,80 m"></label>
        <label>Precio venta<input class="v-price" type="number" min="0" step="0.01" value="${v.price??0}"></label>
        <label>Costo<input class="v-cost" type="number" min="0" step="0.01" value="${v.cost??0}"></label>
        <label>Estado<select class="v-availability"><option value="in_stock" ${v.availability!=="consult"?"selected":""}>🟢 En stock</option><option value="consult" ${v.availability==="consult"?"selected":""}>Consultar</option></select></label>
        <button type="button" class="variant-remove">✕</button>
      </div>
      <div class="variant-closure-grid">
        <div class="variant-closure-title">Tiempo estimado de cierre (meses), solo si aplica</div>
        <label><span class="closure-label-1">Para distancia 1</span><input class="v-close-1" type="number" min="1" step="1" value="${v.closure_months_1??""}" placeholder="Meses"></label>
        <label><span class="closure-label-2">Para distancia 2</span><input class="v-close-2" type="number" min="1" step="1" value="${v.closure_months_2??""}" placeholder="Meses"></label>
        <label><span class="closure-label-3">Para distancia 3</span><input class="v-close-3" type="number" min="1" step="1" value="${v.closure_months_3??""}" placeholder="Meses"></label>
      </div>`;
    div.querySelector(".variant-remove").addEventListener("click",()=>{
      if($("variantRows").children.length>1)div.remove();
      else toast("La planta debe tener al menos una opción de venta.");
    });
    div.querySelector(".v-liters").addEventListener("input",()=>updateClosureLabels(div));
    div.querySelector(".v-height").addEventListener("input",()=>updateClosureLabels(div));
    $("variantRows").appendChild(div);
    updateClosureLabels(div);
  }
  $("addVariantBtn").addEventListener("click",()=>{
    const rows=[...$("variantRows").children],last=rows.at(-1);
    addVariantRow({label:last?.querySelector(".v-label")?.value||""});
  });

  async function uploadImage(file,slug,type){
    if(!file)return null;
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase(),path=`${slug}/${type}-${Date.now()}.${ext}`;
    const {error}=await db.storage.from("product-images").upload(path,file,{cacheControl:"3600",upsert:false});
    if(error)throw error;return db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  }
  function gatherVariants(){
    return [...$("variantRows").children].map((row,i)=>({
      id:row.dataset.variantId||null,
      label:row.querySelector(".v-label").value.trim(),
      liters:row.querySelector(".v-liters").value?Number(row.querySelector(".v-liters").value):null,
      height:row.querySelector(".v-height").value.trim()||null,
      price:Number(row.querySelector(".v-price").value||0),
      cost:Number(row.querySelector(".v-cost").value||0),
      availability:row.querySelector(".v-availability").value,
      closure_months_1:row.querySelector(".v-close-1").value?Number(row.querySelector(".v-close-1").value):null,
      closure_months_2:row.querySelector(".v-close-2").value?Number(row.querySelector(".v-close-2").value):null,
      closure_months_3:row.querySelector(".v-close-3").value?Number(row.querySelector(".v-close-3").value):null,
      active:true,sort_order:i
    })).filter(v=>v.label);
  }
  function gatherCategoryMap(){
    return [...document.querySelectorAll(".pc-check:checked")].map((ch,i)=>({
      category_id:ch.value,recommended_spacing_cm:null,sort_order:i
    }));
  }

  const PRODUCT_SUMMARY_STEP=6;
  let productWizardStep=0;

  function validateProductStep(step){
    msg("productMessage","");
    if(step===0){
      if(!$("productName").value.trim()){
        msg("productMessage","Ingresá el nombre de la planta.","error");
        $("productName").focus();
        return false;
      }
    }
    if(step===2 && !gatherCategoryMap().length){
      msg("productMessage","Elegí al menos una categoría.","error");
      return false;
    }
    if(step===5){
      const vrows=gatherVariants();
      if(!vrows.length){
        msg("productMessage","Agregá al menos una opción de venta con tipo de presentación.","error");
        return false;
      }
      if($("productPrioritizeHeight").checked && vrows.some(v=>!v.height)){
        msg("productMessage","Si activás ‘Priorizar altura’, cargá una altura en cada opción de venta.","error");
        return false;
      }
      const optionKeys=vrows.map(v=>`${v.label.trim().toLowerCase()}|${v.liters??""}|${(v.height||"").trim().toLowerCase()}`);
      if(new Set(optionKeys).size!==optionKeys.length){
        msg("productMessage","Hay dos opciones iguales. Diferencialas por litros o por altura antes de continuar.","error");
        return false;
      }
    }
    return true;
  }

  function renderProductSummary(){
    const selectedCategories=[...document.querySelectorAll(".pc-check:checked")]
      .map(ch=>categories.find(c=>c.id===ch.value)?.name)
      .filter(Boolean);
    const distances=[1,2,3].map(i=>$("productSpacing"+i).value.trim()).filter(Boolean).map(v=>`${v} cm`);
    const highlights=[
      $("productMaxHeight").value.trim()&&`Altura máxima: ${$("productMaxHeight").value.trim()}`,
      $("productMaturityTime").value.trim()&&`Desarrollo máximo: ${$("productMaturityTime").value.trim()}`,
      $("productPruningPerYear").value.trim()&&`Podas anuales: ${$("productPruningPerYear").value.trim()}`
    ].filter(Boolean);
    const imageState=(fileId,currentId)=>{
      const file=$(fileId).files[0];
      if(file)return file.name;
      return $(currentId).value?"Imagen actual cargada":"Sin imagen";
    };
    const vrows=gatherVariants();
    const variantsHtml=vrows.map((v,i)=>{
      const details=[v.liters?`${Number(v.liters).toLocaleString("es-AR")} L`:"",v.height||""].filter(Boolean).join(" · ");
      const closures=[1,2,3].map(n=>{
        const months=v[`closure_months_${n}`],spacing=$("productSpacing"+n).value.trim();
        return months?`Distancia ${n}${spacing?` (${spacing} cm)`:""}: ${months} meses`:"";
      }).filter(Boolean);
      return `<div class="summary-sale-option"><strong>${i+1}. ${esc(v.label)}</strong><span>${esc(details||"Sin litros/altura")} · Venta: ${money(v.price)} · Costo: ${money(v.cost)} · ${v.availability==="in_stock"?"En stock":"Consultar"}</span>${closures.length?`<small>${esc(closures.join(" · "))}</small>`:""}</div>`;
    }).join("");

    $("productSummary").innerHTML=`
      <article><span>Datos principales</span><strong>${esc($("productName").value.trim())}</strong><p>Posición: ${Number($("productOrder").value||0)}</p><p>${esc($("productDescription").value.trim()||"Sin descripción")}</p></article>
      <article><span>Imágenes</span><p>Principal: ${esc(imageState("productImageMain","currentMainImage"))}</p><p>Integrada: ${esc(imageState("productImageIntegrated","currentIntegratedImage"))}</p><p>Ficha: ${esc(imageState("productImageInfo","currentInfoImage"))}</p></article>
      <article><span>Categorías</span><strong>${esc(selectedCategories.join(", ")||"Sin categorías")}</strong></article>
      <article><span>Datos destacados</span><p>${esc(highlights.join(" · ")||"Omitidos")}</p></article>
      <article><span>Distancias recomendadas</span><strong>${esc(distances.join(" · ")||"Sin distancias configuradas")}</strong></article>
      <article class="summary-wide"><span>Opciones de venta</span><div class="summary-sale-list">${variantsHtml}</div><p>Selector: ${$("productPrioritizeHeight").checked?"priorizar altura":"priorizar litros"} · ${$("productFeatured").checked?"Destacada":"No destacada"} · ${$("productActive").checked?"Visible":"Oculta"}</p></article>`;
  }

  function showProductStep(step,scroll=true){
    productWizardStep=Math.max(0,Math.min(PRODUCT_SUMMARY_STEP,step));
    document.querySelectorAll(".product-wizard-step").forEach(el=>{
      el.hidden=Number(el.dataset.productStep)!==productWizardStep;
    });
    $("productOmitBtn").hidden=productWizardStep!==3;
    $("productNextBtn").hidden=productWizardStep===PRODUCT_SUMMARY_STEP;
    $("productFinishBtn").hidden=productWizardStep!==PRODUCT_SUMMARY_STEP;
    if(productWizardStep===5)updateAllClosureLabels();
    if(productWizardStep===PRODUCT_SUMMARY_STEP)renderProductSummary();
    msg("productMessage","");
    if(scroll)$("productForm").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function advanceProductStep(){
    if(!validateProductStep(productWizardStep))return;
    showProductStep(productWizardStep+1);
  }

  $("productNextBtn").addEventListener("click",advanceProductStep);
  $("productOmitBtn").addEventListener("click",()=>showProductStep(productWizardStep+1));

  $("productForm").addEventListener("submit",async e=>{
    e.preventDefault();
    if(productWizardStep!==PRODUCT_SUMMARY_STEP){advanceProductStep();return;}
    msg("productMessage","Guardando...");
    try{
      const name=$("productName").value.trim(),slug=slugify(name),catMap=gatherCategoryMap(),vrows=gatherVariants();
      if(!name||!slug)throw new Error("Ingresá un nombre válido.");
      if(!catMap.length)throw new Error("Elegí al menos una categoría.");
      if(!vrows.length)throw new Error("Agregá al menos una presentación.");
      if($("productPrioritizeHeight").checked && vrows.some(v=>!v.height))throw new Error("Si activás ‘Priorizar altura’, cargá una altura en cada opción de venta.");
      const optionKeys=vrows.map(v=>`${v.label.trim().toLowerCase()}|${v.liters??""}|${(v.height||"").trim().toLowerCase()}`);
      if(new Set(optionKeys).size!==optionKeys.length)throw new Error("Hay dos opciones iguales. Diferencialas por litros o por altura antes de guardar.");
      let main=$("currentMainImage").value||null,integrated=$("currentIntegratedImage").value||null,info=$("currentInfoImage").value||null;
      const files=[["productImageMain","main"],["productImageIntegrated","integrated"],["productImageInfo","info"]];
      for(const [id,type] of files){
        const file=$(id).files[0];if(file){const url=await uploadImage(file,slug,type);if(type==="main")main=url;if(type==="integrated")integrated=url;if(type==="info")info=url}
      }
      const first=vrows[0],payload={
        category_id:catMap[0].category_id,name,slug,description:$("productDescription").value.trim(),price:first.price,cost:first.cost,
        availability:vrows.some(v=>v.availability==="in_stock")?"in_stock":"consult",pot_size:first.label,image_url:main,integrated_image_url:integrated,info_image_url:info,
        max_height:$("productMaxHeight").value.trim()||null,
        maturity_time:$("productMaturityTime").value.trim()||null,
        pruning_per_year:$("productPruningPerYear").value.trim()||null,
        prioritize_height:$("productPrioritizeHeight").checked,
        spacing_1_cm:$("productSpacing1").value?Number($("productSpacing1").value):null,
        spacing_2_cm:$("productSpacing2").value?Number($("productSpacing2").value):null,
        spacing_3_cm:$("productSpacing3").value?Number($("productSpacing3").value):null,
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
        const vp={product_id:product.id,label:v.label,liters:v.liters,height:v.height,price:v.price,cost:v.cost,availability:v.availability,
          closure_months_1:v.closure_months_1,closure_months_2:v.closure_months_2,closure_months_3:v.closure_months_3,
          active:true,sort_order:v.sort_order,updated_at:new Date().toISOString()};
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
    $("productOrder").value=0;$("productActive").checked=true;$("productFeatured").checked=false;
    $("productMaxHeight").value="";$("productMaturityTime").value="";$("productPruningPerYear").value="";$("productPrioritizeHeight").checked=false;
    $("productSpacing1").value="";$("productSpacing2").value="";$("productSpacing3").value="";
    $("productFormTitle").textContent="Agregar planta";
    $("variantRows").innerHTML="";addVariantRow();renderCategoryChoices();["mainImageState","integratedImageState","infoImageState"].forEach(id=>$(id).textContent="");msg("productMessage","");
    showProductStep(0,false);
  }

  function renderProducts(){
    const term=$("productSearch").value.trim().toLowerCase();
    const list=products.filter(p=>!term||p.name.toLowerCase().includes(term));
    $("productList").innerHTML=list.length?list.map(p=>{
      const cs=assocs.filter(a=>a.product_id===p.id).map(a=>categories.find(c=>c.id===a.category_id)?.name).filter(Boolean).join(", ");
      const vs=variants.filter(v=>v.product_id===p.id).map(v=>`${v.label}${v.liters?` · ${Number(v.liters).toLocaleString("es-AR")} L`:""}${v.height?` · ${v.height}`:""}`).join(", ");
      return `<div class="item-row"><div><div class="item-title">${esc(p.name)} ${p.active?"":"· Oculta"}</div><div class="item-meta">${esc(cs||"Sin categoría")} · ${esc(vs||"Sin presentación")} · selector: ${p.prioritize_height?"altura":"litros"} · posición ${p.sort_order}</div></div><div class="item-actions"><button class="small-btn" data-edit-product="${p.id}">Editar</button><button class="small-btn" data-toggle-product="${p.id}">${p.active?"Ocultar":"Mostrar"}</button><button class="small-btn danger" data-delete-product="${p.id}">Eliminar</button></div></div>`;
    }).join(""):`<p class="form-message">No hay plantas.</p>`;
  }
  $("productSearch").addEventListener("input",renderProducts);
  $("productList").addEventListener("click",async e=>{
    const edit=e.target.dataset.editProduct,toggle=e.target.dataset.toggleProduct,del=e.target.dataset.deleteProduct;
    if(edit){
      const p=products.find(x=>x.id===edit);if(!p)return;
      $("productId").value=p.id;$("productName").value=p.name;$("productDescription").value=p.description||"";$("productOrder").value=p.sort_order;$("productFeatured").checked=p.featured;$("productActive").checked=p.active;
      $("productMaxHeight").value=p.max_height||"";$("productMaturityTime").value=p.maturity_time||"";$("productPruningPerYear").value=p.pruning_per_year||"";$("productPrioritizeHeight").checked=!!p.prioritize_height;
      $("productSpacing1").value=p.spacing_1_cm||"";$("productSpacing2").value=p.spacing_2_cm||"";$("productSpacing3").value=p.spacing_3_cm||"";
      $("currentMainImage").value=p.image_url||"";$("currentIntegratedImage").value=p.integrated_image_url||"";$("currentInfoImage").value=p.info_image_url||"";
      $("mainImageState").textContent=p.image_url?"Foto actual cargada":"";$("integratedImageState").textContent=p.integrated_image_url?"Foto actual cargada":"";$("infoImageState").textContent=p.info_image_url?"Ficha actual cargada":"";
      const pa=assocs.filter(a=>a.product_id===p.id),selected={},sp={};pa.forEach(a=>{selected[a.category_id]=true;sp[a.category_id]=a.recommended_spacing_cm});
      renderCategoryChoices(selected);$("variantRows").innerHTML="";variants.filter(v=>v.product_id===p.id).forEach(addVariantRow);if(!$("variantRows").children.length)addVariantRow();
      $("productFormTitle").textContent=`Editar: ${p.name}`;showProductStep(0);
    }
    if(toggle){const p=products.find(x=>x.id===toggle);const {error}=await db.from("products").update({active:!p.active,updated_at:new Date().toISOString()}).eq("id",p.id);if(error)return toast(error.message);await loadAll()}
    if(del){const p=products.find(x=>x.id===del);if(!confirm(`¿Eliminar "${p.name}"?`))return;const {error}=await db.from("products").delete().eq("id",p.id);if(error)return toast(error.message);await loadAll();toast("Planta eliminada")}
  });
  $("newProductBtn").addEventListener("click",()=>{resetProductForm();$("productName").focus()});
  $("cancelProductEdit").addEventListener("click",resetProductForm);

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

  function customerWhatsappLink(phone){
    const digits=String(phone||'').replace(/\D/g,'');
    return digits?`https://wa.me/${digits}`:'';
  }
  function displayCustomerPhone(phone){
    const digits=String(phone||'').replace(/\D/g,'');
    if(digits.startsWith('549')&&digits.length===13)return `+54 9 ${digits.slice(3)}`;
    return phone||'Sin teléfono';
  }
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
      return `<details class="order-card collapsible-order" data-order="${o.id}">
        <summary class="order-head">
          <div><div class="order-code">${esc(o.order_code)}</div><div class="order-meta">${new Date(o.created_at).toLocaleString("es-AR")} · ${items.length} ítem(s) · ${money(t.sales)}</div></div>
          <div class="order-summary-right"><span class="badge ${statusClass(o.status)}">${statusLabel(o.status)}</span><span class="order-chevron">⌄</span></div>
        </summary>
        <div class="order-body">
          <div class="order-customer">
            <div><span>Cliente</span><strong>${esc(o.customer_name)}</strong></div>
            <div><span>Dirección</span><strong>${esc(o.shipping_address)} <small class="inline-cp">· CP ${esc(o.postal_code)}</small></strong></div>
            <div><span>Teléfono</span><strong>${esc(displayCustomerPhone(o.phone))}</strong>${customerWhatsappLink(o.phone)?`<a class="whatsapp-customer-link" href="${customerWhatsappLink(o.phone)}" target="_blank" rel="noopener">Ver en WhatsApp</a>`:""}</div>
          </div>
          ${o.general_question?`<p class="item-meta"><strong>Consulta:</strong> ${esc(o.general_question)}</p>`:""}
          <div class="order-items">${items.map(i=>`<div class="order-item-row" data-item="${i.id}"><label>Ítem<input class="oi-name" value="${esc(i.item_name+(i.variant_label?` · ${i.variant_label}`:""))}"></label><label>Cant.<input class="oi-qty" type="number" min="1" value="${i.quantity}"></label><label>Precio u.<input class="oi-price" type="number" min="0" step="0.01" value="${i.unit_price}"></label><label>Costo u.<input class="oi-cost" type="number" min="0" step="0.01" value="${i.unit_cost}"></label><button class="small-btn danger" data-delete-item="${i.id}">Quitar</button></div>`).join("")}</div>
          <div class="order-total-row"><span>Venta: ${money(t.sales)}</span><span>Costo: ${money(t.cost)}</span><span>Ganancia: ${money(t.profit)}</span></div>
          <label>Otros costos del pedido<input class="order-extra-cost" type="number" min="0" step="0.01" value="${o.extra_cost||0}"></label>
          <div class="add-item-box"><strong>Agregar ítem</strong><div class="add-item-grid"><label>Producto / presentación<select class="add-catalog-variant">${catalogOptions()}</select></label><label>Cant.<input class="add-qty" type="number" min="1" value="1"></label><label>Precio<input class="add-price" type="number" min="0" value="0"></label><label>Costo<input class="add-cost" type="number" min="0" value="0"></label><button class="small-btn" data-add-item="${o.id}">Agregar</button></div><label class="custom-name-wrap">Nombre personalizado<input class="add-custom-name" placeholder="Ej.: Tierra abonada"></label></div>
          <div class="order-actions"><button class="small-btn" data-save-order="${o.id}">Guardar cambios</button>${o.status==="pending_confirmation"?`<button class="status-btn confirm" data-confirm-order="${o.id}">Confirmar pedido</button>`:""}${o.status==="confirmed"?`<button class="status-btn dispatch" data-dispatch-order="${o.id}">Pedido despachado</button>`:""}${o.status!=="dispatched"&&o.status!=="cancelled"?`<button class="status-btn cancel" data-cancel-order="${o.id}">Cancelar</button>`:""}</div>
        </div>
      </details>`;
    }).join(""):`<p class="form-message">Todavía no hay pedidos.</p>`;

    document.querySelectorAll(".add-catalog-variant").forEach(sel=>sel.addEventListener("change",()=>{const card=sel.closest(".order-card"),v=variants.find(x=>x.id===sel.value),p=v?products.find(x=>x.id===v.product_id):null;card.querySelector(".add-price").value=v?.price||0;card.querySelector(".add-cost").value=v?.cost||0;card.querySelector(".custom-name-wrap").hidden=!!v;if(!v)card.querySelector(".add-custom-name").value=""}));
    const dispatched=orders.filter(o=>o.status==="dispatched" && o.status!=="cancelled"),tot=dispatched.reduce((a,o)=>{const t=orderTotals(o.id);a.sales+=t.sales;a.cost+=t.cost;a.profit+=t.profit;return a},{sales:0,cost:0,profit:0});
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
      const patch={status,updated_at:new Date().toISOString()};if(status==="confirmed")patch.confirmed_at=new Date().toISOString();if(status==="dispatched")patch.dispatched_at=new Date().toISOString();if(status==="cancelled")patch.dispatched_at=null;
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


  ["productSpacing1","productSpacing2","productSpacing3"].forEach(id=>$(id)?.addEventListener("input",updateAllClosureLabels));
  db.auth.onAuthStateChange(()=>setTimeout(refreshAuth,0));
  refreshAuth().catch(err=>console.error(err));
})();
