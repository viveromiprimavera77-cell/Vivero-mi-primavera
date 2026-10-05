(() => {
  const cfg=window.VIVERO_CONFIG;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n||0));
  const slugify=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  let products=[],categories=[],assocs=[],variants=[],holeRecommendations=[],settings={},orders=[],orderItems=[],currentUser=null,removingVideo=false;

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
    const [pr,cr,ar,vr,hr,sr,or,oir]=await Promise.all([
      db.from("products").select("*").order("sort_order").order("name"),
      db.from("categories").select("*").order("sort_order").order("name"),
      db.from("product_categories").select("*").order("sort_order"),
      db.from("product_variants").select("*").order("sort_order"),
      db.from("hole_recommendations").select("*").order("liters"),
      db.from("site_settings").select("*").eq("id",1).maybeSingle(),
      db.from("orders").select("*").order("created_at",{ascending:false}),
      db.from("order_items").select("*").order("created_at")
    ]);
    [pr,cr,ar,vr,hr,or,oir].forEach(r=>{if(r.error)throw r.error});
    products=pr.data||[];categories=cr.data||[];assocs=ar.data||[];variants=vr.data||[];holeRecommendations=hr.data||[];settings=sr.data||{};orders=or.data||[];orderItems=oir.data||[];
    renderStats();renderCategoryChoices();renderProducts();renderCategories();renderCategoryOrderOptions();renderHoleRecommendations();renderOrders();fillSettings();
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
        <span>${esc(c.name)}${c.calculation_mode==="linear"?" · cálculo por metros lineales":c.calculation_mode==="area"?" · cálculo por m²":""}</span>
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

  const STANDARD_LITERS=[3,5,7,10,15,20,30,40,50];
  function isAreaProductSelection(){
    return [...document.querySelectorAll(".pc-check:checked")].some(ch=>{
      const cat=categories.find(c=>c.id===ch.value);
      return cat?.calculation_mode==="area"||cat?.slug==="grama";
    });
  }
  function isOtherProductSelection(){
    return [...document.querySelectorAll(".pc-check:checked")].some(ch=>categories.find(c=>c.id===ch.value)?.slug==="otros");
  }
  function normalizePresentationLabel(value){
    const key=String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if(key==="plantin")return "Plantín";
    if(key==="terron")return "Terrón";
    if(key==="maceta soplada")return "Maceta soplada";
    if(key==="panes cuadrados"||key==="pan cuadrado")return "Panes cuadrados";
    if(key==="camion"||key==="camión")return "Camión";
    if(key==="bolsa")return "Bolsa";
    if(key==="por dm3"||key==="por dm³"||key==="dm3"||key==="dm³")return "Por dm³";
    return "";
  }
  function validPaneDimensions(value){
    const nums=String(value||"").replace(/,/g,".").match(/\d+(?:\.\d+)?/g)||[];
    return nums.length>=2&&Number(nums[0])>0&&Number(nums[1])>0;
  }
  function variantLitersValue(row){
    const manual=row.querySelector(".v-liters-manual");
    if(isOtherProductSelection()){
      return manual.value?Number(manual.value):null;
    }
    if(row.querySelector(".v-label").value!=="Maceta soplada")return null;
    const choice=row.querySelector(".v-liters-select").value;
    if(choice==="other"){
      return manual.value?Number(manual.value):null;
    }
    return choice?Number(choice):null;
  }
  function syncVariantPresentation(row){
    const type=row.querySelector(".v-label").value;
    const litersSelect=row.querySelector(".v-liters-select");
    const manual=row.querySelector(".v-liters-manual");
    const material=isOtherProductSelection();
    const usesLiters=type==="Maceta soplada";
    if(material){
      litersSelect.hidden=true;litersSelect.disabled=true;
      manual.hidden=false;manual.disabled=false;
      manual.placeholder="Ej.: 8000 para 8 m³, 25 para bolsa de 25 dm³, 1 por dm³";
    }else{
      litersSelect.hidden=false;
      litersSelect.disabled=!usesLiters;
      manual.placeholder="Ingresar litros";
      if(!usesLiters){
        litersSelect.value="";
        manual.value="";
        manual.hidden=true;
        manual.disabled=true;
      }else{
        manual.hidden=litersSelect.value!=="other";
        manual.disabled=litersSelect.value!=="other";
      }
    }
    updateClosureLabels(row);
  }
  function refreshVariantAreaMode(){
    const area=isAreaProductSelection();
    const material=isOtherProductSelection();
    [...$("variantRows").children].forEach(row=>{
      const sel=row.querySelector(".v-label");
      const ensureOption=(value,label,enabled)=>{
        let opt=sel.querySelector(`option[value="${value}"]`);
        if(enabled&&!opt){opt=document.createElement("option");opt.value=value;opt.textContent=label;sel.appendChild(opt)}
        if(!enabled&&opt){if(sel.value===value)sel.value="";opt.remove()}
      };
      ensureOption("Panes cuadrados","Panes cuadrados",area);
      ensureOption("Camión","Camión",material);
      ensureOption("Bolsa","Bolsa",material);
      ensureOption("Por dm³","Por dm³",material);

      const litersLabel=row.querySelector(".v-liters-label-text");
      if(litersLabel)litersLabel.textContent=material?"Volumen por unidad (dm³)":"Litros";

      const heightWrap=row.querySelector(".v-height-wrap");
      if(heightWrap)heightWrap.hidden=material;
      row.querySelector(".v-height-label-text").textContent=area?"Dimensiones":"Altura";
      row.querySelector(".v-height").placeholder=area?"Ej.: 40x40 cm":"Ej.: 1,80 m";

      row.querySelector(".variant-closure-grid").hidden=area||material;
      syncVariantPresentation(row);
    });
    const priorityBox=$("productPrioritizeHeight").closest(".selector-priority-box");
    if(priorityBox){
      priorityBox.hidden=area||material;
      if(area||material)$("productPrioritizeHeight").checked=false;
    }
  }

  function addVariantRow(v={}){
    const div=document.createElement("div");
    div.className="variant-row";
    div.dataset.variantId=v.id||"";
    const area=isAreaProductSelection();
    const material=isOtherProductSelection();
    const presentation=normalizePresentationLabel(v.label);
    const litersNumber=v.liters==null?null:Number(v.liters);
    const standardLiters=litersNumber!=null&&STANDARD_LITERS.includes(litersNumber);
    const litersChoice=presentation==="Maceta soplada"?(standardLiters?String(litersNumber):(litersNumber!=null?"other":"")):"";
    div.innerHTML=`
      <div class="variant-main-grid">
        <label>Tipo de presentación
          <select class="v-label">
            <option value="" ${!presentation?"selected":""}>Elegir presentación</option>
            <option value="Plantín" ${presentation==="Plantín"?"selected":""}>Plantín</option>
            <option value="Maceta soplada" ${presentation==="Maceta soplada"?"selected":""}>Maceta soplada</option>
            <option value="Terrón" ${presentation==="Terrón"?"selected":""}>Terrón</option>
            ${area?`<option value="Panes cuadrados" ${presentation==="Panes cuadrados"?"selected":""}>Panes cuadrados</option>`:""}
            ${material?`<option value="Camión" ${presentation==="Camión"?"selected":""}>Camión</option><option value="Bolsa" ${presentation==="Bolsa"?"selected":""}>Bolsa</option><option value="Por dm³" ${presentation==="Por dm³"?"selected":""}>Por dm³</option>`:""}
          </select>
        </label>
        <label><span class="v-liters-label-text">${material?"Volumen por unidad (dm³)":"Litros"}</span> <span class="optional-tag">opcional</span>
          <select class="v-liters-select" ${material?"hidden disabled":presentation!=="Maceta soplada"?"disabled":""}>
            <option value="" ${!litersChoice?"selected":""}>Elegir litros</option>
            ${STANDARD_LITERS.map(l=>`<option value="${l}" ${litersChoice===String(l)?"selected":""}>${l} Lts</option>`).join("")}
            <option value="other" ${litersChoice==="other"?"selected":""}>Otros envases</option>
          </select>
          <input class="v-liters-manual" type="number" min="0.1" step="0.1" value="${material&&litersNumber!=null?litersNumber:litersChoice==="other"&&litersNumber!=null?litersNumber:""}" placeholder="${material?"Ej.: 8000 para 8 m³":"Ingresar litros"}" ${material||litersChoice==="other"?"":"hidden disabled"}>
        </label>
        <label class="v-height-wrap" ${material?"hidden":""}><span class="v-height-label-text">${area?"Dimensiones":"Altura"}</span> <span class="optional-tag">opcional</span><input class="v-height" value="${esc(v.height||"")}" placeholder="${area?"Ej.: 40x40 cm":"Ej.: 1,80 m"}"></label>
        <label>Precio venta<input class="v-price" type="number" min="0" step="0.01" value="${v.price??0}"></label>
        <label>Costo<input class="v-cost" type="number" min="0" step="0.01" value="${v.cost??0}"></label>
        <label>Estado<select class="v-availability"><option value="in_stock" ${v.availability!=="consult"?"selected":""}>🟢 En stock</option><option value="consult" ${v.availability==="consult"?"selected":""}>Consultar</option></select></label>
        <button type="button" class="variant-remove">✕</button>
      </div>
      <div class="variant-closure-grid" ${area?"hidden":""}>
        <div class="variant-closure-title">Tiempo estimado de cierre (meses), solo si aplica</div>
        <label><span class="closure-label-1">Para distancia 1</span><input class="v-close-1" type="number" min="1" step="1" value="${v.closure_months_1??""}" placeholder="Meses"></label>
        <label><span class="closure-label-2">Para distancia 2</span><input class="v-close-2" type="number" min="1" step="1" value="${v.closure_months_2??""}" placeholder="Meses"></label>
        <label><span class="closure-label-3">Para distancia 3</span><input class="v-close-3" type="number" min="1" step="1" value="${v.closure_months_3??""}" placeholder="Meses"></label>
      </div>`;
    div.querySelector(".variant-remove").addEventListener("click",()=>{
      if($("variantRows").children.length>1)div.remove();
      else toast("La planta debe tener al menos una opción de venta.");
    });
    div.querySelector(".v-label").addEventListener("change",()=>syncVariantPresentation(div));
    div.querySelector(".v-liters-select").addEventListener("change",()=>syncVariantPresentation(div));
    div.querySelector(".v-liters-manual").addEventListener("input",()=>updateClosureLabels(div));
    div.querySelector(".v-height").addEventListener("input",()=>updateClosureLabels(div));
    $("variantRows").appendChild(div);
    syncVariantPresentation(div);
  }
  $("addVariantBtn").addEventListener("click",()=>{
    const rows=[...$("variantRows").children],last=rows.at(-1);
    addVariantRow({label:last?.querySelector(".v-label")?.value||""});
  });
  $("productCategoryChoices").addEventListener("change",e=>{
    if(e.target.matches(".pc-check"))refreshVariantAreaMode();
  });

  const IMAGE_SLOTS=[
    {file:"productImageMain",current:"currentMainImage",state:"mainImageState",remove:"removeMainImage",type:"main"},
    {file:"productImageIntegrated",current:"currentIntegratedImage",state:"integratedImageState",remove:"removeIntegratedImage",type:"integrated"},
    {file:"productImageInfo",current:"currentInfoImage",state:"infoImageState",remove:"removeInfoImage",type:"info"}
  ];
  function storagePathFromPublicUrl(url){
    const marker="/storage/v1/object/public/product-images/";
    const pos=String(url||"").indexOf(marker);
    if(pos<0)return null;
    return decodeURIComponent(String(url).slice(pos+marker.length).split("?")[0]);
  }
  async function removeStoredImage(url){
    const path=storagePathFromPublicUrl(url);
    if(!path)return;
    const {error}=await db.storage.from("product-images").remove([path]);
    if(error)console.warn("No se pudo limpiar la imagen anterior:",error.message);
  }
  function setImageSlot(slot,url=""){
    const current=$(slot.current),state=$(slot.state),remove=$(slot.remove),file=$(slot.file);
    current.value=url||"";
    current.dataset.originalUrl=url||"";
    current.dataset.removeRequested="0";
    file.value="";
    state.textContent=url?(slot.type==="info"?"Ficha actual cargada":"Foto actual cargada"):"";
    remove.hidden=!url;
  }
  function clearImageSlots(){
    IMAGE_SLOTS.forEach(slot=>setImageSlot(slot,""));
  }
  function markImageForRemoval(slot){
    const current=$(slot.current);
    current.value="";
    current.dataset.removeRequested="1";
    $(slot.file).value="";
    $(slot.state).textContent="Se quitará al guardar los cambios";
    $(slot.remove).hidden=true;
  }
  IMAGE_SLOTS.forEach(slot=>{
    $(slot.remove).addEventListener("click",()=>markImageForRemoval(slot));
    $(slot.file).addEventListener("change",()=>{
      const hasNew=Boolean($(slot.file).files?.[0]);
      if(hasNew){
        $(slot.state).textContent="Nueva foto seleccionada";
        $(slot.remove).hidden=true;
      }else{
        const current=$(slot.current).value;
        $(slot.state).textContent=current?(slot.type==="info"?"Ficha actual cargada":"Foto actual cargada"):"";
        $(slot.remove).hidden=!current;
      }
    });
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
      label:row.querySelector(".v-label").value,
      liters:variantLitersValue(row),
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
  let quickProductSaveRequested=false;

  function hasProductImage(){
    return ["productImageMain","productImageIntegrated","productImageInfo"].some(id=>$(id).files?.[0]) ||
      ["currentMainImage","currentIntegratedImage","currentInfoImage"].some(id=>Boolean($(id).value));
  }

  function validateProductStep(step){
    msg("productMessage","");
    if(step===0){
      if(!$("productName").value.trim()){
        msg("productMessage","Ingresá el nombre de la planta.","error");
        $("productName").focus();
        return false;
      }
    }
    if(step===1 && !hasProductImage()){
      msg("productMessage","Subí al menos una foto de la planta para continuar.","error");
      return false;
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
      if(isAreaProductSelection()&&vrows.some(v=>v.label==="Panes cuadrados"&&!validPaneDimensions(v.height))){
        msg("productMessage","En Panes cuadrados ingresá las dimensiones, por ejemplo 40x40 cm.","error");
        return false;
      }
      if(isOtherProductSelection()&&vrows.some(v=>!v.liters||v.liters<=0)){
        msg("productMessage","En productos de Otros cargá el volumen por unidad en dm³ para poder calcular la cantidad.","error");
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
    const vrows=gatherVariants();
    const variantsHtml=vrows.map((v,i)=>{
      const details=[v.liters?`${Number(v.liters).toLocaleString("es-AR")} ${isOtherProductSelection()?"dm³ por unidad":"L"}`:"",v.height||""].filter(Boolean).join(" · ");
      const closures=[1,2,3].map(n=>{
        const months=v[`closure_months_${n}`],spacing=$("productSpacing"+n).value.trim();
        return months?`Distancia ${n}${spacing?` (${spacing} cm)`:""}: ${months} meses`:"";
      }).filter(Boolean);
      const statusHtml=v.availability==="in_stock"
        ?'<span class="summary-stock in-stock"><i aria-hidden="true"></i>En stock</span>'
        :'<span class="summary-stock consult">A consultar</span>';
      return `<div class="summary-sale-option">
        <div class="summary-sale-head"><strong>${i+1}. ${esc(v.label)}</strong>${statusHtml}</div>
        <span class="summary-sale-details">${esc(details||"Sin litros/altura")}</span>
        <div class="summary-sale-values">
          <div><span>Precio de venta</span><strong>${money(v.price)}</strong></div>
          <div><span>Costo</span><strong>${money(v.cost)}</strong></div>
        </div>
        ${closures.length?`<small>${esc(closures.join(" · "))}</small>`:""}
      </div>`;
    }).join("");

    $("productSummary").innerHTML=`
      <article><span>Datos principales</span><strong>${esc($("productName").value.trim())}</strong><p>Posición: ${Number($("productOrder").value||0)}</p><p>${esc($("productDescription").value.trim()||"Sin descripción")}</p></article>
      <article><span>Categorías</span><strong>${esc(selectedCategories.join(", ")||"Sin categorías")}</strong></article>
      <article><span>Datos destacados</span><p>${esc(highlights.join(" · ")||"Omitidos")}</p></article>
      <article><span>Distancias recomendadas</span><strong>${esc(distances.join(" · ")||"Sin distancias configuradas")}</strong></article>
      <article class="summary-wide"><span>Opciones de compra</span><div class="summary-sale-list">${variantsHtml}</div><p>Selector: ${$("productPrioritizeHeight").checked?"priorizar altura":"priorizar litros"} · ${$("productFeatured").checked?"Destacada":"No destacada"} · ${$("productActive").checked?"Visible":"Oculta"}</p></article>`;
  }

  function showProductStep(step,scroll=false){
    productWizardStep=Math.max(0,Math.min(PRODUCT_SUMMARY_STEP,step));
    document.querySelectorAll(".product-wizard-step").forEach(el=>{
      el.hidden=Number(el.dataset.productStep)!==productWizardStep;
    });
    $("productListPanel").hidden=productWizardStep!==0;
    $("productBackBtn").hidden=productWizardStep===0;
    $("productOmitBtn").hidden=productWizardStep!==3;
    $("productQuickSaveBtn").hidden=!$("productId").value||productWizardStep===PRODUCT_SUMMARY_STEP;
    $("productNextBtn").hidden=productWizardStep===PRODUCT_SUMMARY_STEP;
    $("productFinishBtn").hidden=productWizardStep!==PRODUCT_SUMMARY_STEP;
    if(productWizardStep===5)updateAllClosureLabels();
    if(productWizardStep===PRODUCT_SUMMARY_STEP)renderProductSummary();
    msg("productMessage","");
    if(scroll)requestAnimationFrame(()=>$("productForm").scrollIntoView({behavior:"smooth",block:"start"}));
  }

  function advanceProductStep(){
    if(!validateProductStep(productWizardStep))return;
    showProductStep(productWizardStep+1);
  }

  $("productNextBtn").addEventListener("click",advanceProductStep);
  $("productBackBtn").addEventListener("click",()=>showProductStep(productWizardStep-1));
  $("productOmitBtn").addEventListener("click",()=>showProductStep(productWizardStep+1));
  $("productQuickSaveBtn").addEventListener("click",()=>{
    quickProductSaveRequested=true;
    $("productForm").requestSubmit();
  });

  $("productForm").addEventListener("submit",async e=>{
    e.preventDefault();
    if(productWizardStep!==PRODUCT_SUMMARY_STEP&&!quickProductSaveRequested){advanceProductStep();return;}
    quickProductSaveRequested=false;
    msg("productMessage","Guardando...");
    try{
      const wasEditing=Boolean($("productId").value);
      const name=$("productName").value.trim(),slug=slugify(name),catMap=gatherCategoryMap(),vrows=gatherVariants();
      if(!name||!slug)throw new Error("Ingresá un nombre válido.");
      if(!hasProductImage())throw new Error("Subí al menos una foto de la planta.");
      if(!catMap.length)throw new Error("Elegí al menos una categoría.");
      if(!vrows.length)throw new Error("Agregá al menos una presentación.");
      if(isAreaProductSelection()&&vrows.some(v=>v.label==="Panes cuadrados"&&!validPaneDimensions(v.height)))throw new Error("En Panes cuadrados ingresá las dimensiones, por ejemplo 40x40 cm.");
      if(isOtherProductSelection()&&vrows.some(v=>!v.liters||v.liters<=0))throw new Error("En productos de Otros cargá el volumen por unidad en dm³.");
      if($("productPrioritizeHeight").checked && vrows.some(v=>!v.height))throw new Error("Si activás ‘Priorizar altura’, cargá una altura en cada opción de venta.");
      const optionKeys=vrows.map(v=>`${v.label.trim().toLowerCase()}|${v.liters??""}|${(v.height||"").trim().toLowerCase()}`);
      if(new Set(optionKeys).size!==optionKeys.length)throw new Error("Hay dos opciones iguales. Diferencialas por litros o por altura antes de guardar.");
      const oldImageUrls={
        main:$("currentMainImage").dataset.originalUrl||"",
        integrated:$("currentIntegratedImage").dataset.originalUrl||"",
        info:$("currentInfoImage").dataset.originalUrl||""
      };
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
      const newImageUrls={main:main||"",integrated:integrated||"",info:info||""};
      await Promise.allSettled(Object.keys(oldImageUrls).map(type=>{
        const oldUrl=oldImageUrls[type],newUrl=newImageUrls[type];
        return oldUrl&&oldUrl!==newUrl?removeStoredImage(oldUrl):Promise.resolve();
      }));
      resetProductForm();await loadAll();toast(wasEditing?"Cambios guardados":"Planta guardada");
    }catch(err){console.error(err);msg("productMessage",err.message||"No se pudo guardar.","error")}
  });

  function resetProductForm(){
    $("productForm").reset();$("productId").value="";clearImageSlots();
    $("productOrder").value=0;$("productActive").checked=true;$("productFeatured").checked=false;
    $("productMaxHeight").value="";$("productMaturityTime").value="";$("productPruningPerYear").value="";$("productPrioritizeHeight").checked=false;
    $("productSpacing1").value="";$("productSpacing2").value="";$("productSpacing3").value="";
    $("productFormTitle").textContent="Agregar planta";
    $("variantRows").innerHTML="";addVariantRow();renderCategoryChoices();refreshVariantAreaMode();msg("productMessage","");
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
      setImageSlot(IMAGE_SLOTS[0],p.image_url||"");
      setImageSlot(IMAGE_SLOTS[1],p.integrated_image_url||"");
      setImageSlot(IMAGE_SLOTS[2],p.info_image_url||"");
      const pa=assocs.filter(a=>a.product_id===p.id),selected={},sp={};pa.forEach(a=>{selected[a.category_id]=true;sp[a.category_id]=a.recommended_spacing_cm});
      renderCategoryChoices(selected);$("variantRows").innerHTML="";variants.filter(v=>v.product_id===p.id).forEach(addVariantRow);if(!$("variantRows").children.length)addVariantRow();refreshVariantAreaMode();
      $("productFormTitle").textContent=`Editar: ${p.name}`;showProductStep(0,true);
    }
    if(toggle){const p=products.find(x=>x.id===toggle);const {error}=await db.from("products").update({active:!p.active,updated_at:new Date().toISOString()}).eq("id",p.id);if(error)return toast(error.message);await loadAll()}
    if(del){const p=products.find(x=>x.id===del);if(!confirm(`¿Eliminar "${p.name}"?`))return;const {error}=await db.from("products").delete().eq("id",p.id);if(error)return toast(error.message);await loadAll();toast("Planta eliminada")}
  });
  $("newProductBtn").addEventListener("click",()=>{resetProductForm();$("productName").focus()});
  $("cancelProductEdit").addEventListener("click",resetProductForm);

  function renderCategoryOrderOptions(selected=null){
    const editing=Boolean($("categoryId").value);
    const max=Math.max(1,categories.length+(editing?0:1));
    const fallback=editing?Number(categories.find(c=>c.id===$("categoryId").value)?.sort_order||1):max;
    const value=Math.min(max,Math.max(1,Number(selected??fallback)||1));
    $("categoryOrder").innerHTML=Array.from({length:max},(_,i)=>`<option value="${i+1}">${i+1}°</option>`).join("");
    $("categoryOrder").value=String(value);
  }
  async function persistCategorySequence(ids){
    for(let i=0;i<ids.length;i++){
      const {error}=await db.from("categories").update({sort_order:i+1,updated_at:new Date().toISOString()}).eq("id",ids[i]);
      if(error)throw error;
    }
  }
  async function reorderCategory(categoryId,position){
    const ids=categories
      .filter(c=>c.id!==categoryId)
      .sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)||a.name.localeCompare(b.name,"es"))
      .map(c=>c.id);
    const target=Math.max(0,Math.min(ids.length,Number(position||1)-1));
    ids.splice(target,0,categoryId);
    await persistCategorySequence(ids);
  }

  function resetHoleRecommendationForm(){
    $("holeRecommendationForm").reset();
    $("holeRecommendationId").value="";
    $("cancelHoleRecommendationEdit").hidden=true;
    msg("holeRecommendationMessage","");
  }
  function renderHoleRecommendations(){
    const list=$("holeRecommendationList");
    if(!list)return;
    list.innerHTML=holeRecommendations.length?holeRecommendations.map(r=>`
      <div class="item-row">
        <div>
          <div class="item-title">${Number(r.liters).toLocaleString("es-AR")} L</div>
          <div class="item-meta">Pozo recomendado: ${Number(r.width_cm).toLocaleString("es-AR")} × ${Number(r.width_cm).toLocaleString("es-AR")} cm · profundidad ${Number(r.depth_cm).toLocaleString("es-AR")} cm</div>
        </div>
        <div class="item-actions">
          <button class="small-btn" type="button" data-edit-hole="${r.id}">Editar</button>
          <button class="small-btn danger" type="button" data-delete-hole="${r.id}">Eliminar</button>
        </div>
      </div>`).join(""):`<p class="form-message">Todavía no cargaste recomendaciones por litros.</p>`;
  }
  $("holeRecommendationForm").addEventListener("submit",async e=>{
    e.preventDefault();msg("holeRecommendationMessage","Guardando...");
    try{
      const payload={
        liters:Number($("holeRecommendationLiters").value),
        width_cm:Number($("holeRecommendationWidth").value),
        depth_cm:Number($("holeRecommendationDepth").value),
        sort_order:Number($("holeRecommendationLiters").value),
        active:true,
        updated_at:new Date().toISOString()
      };
      if(!(payload.liters>0&&payload.width_cm>0&&payload.depth_cm>0))throw new Error("Completá litros, ancho y profundidad con valores mayores a cero.");
      const id=$("holeRecommendationId").value;
      if(id){
        const {error}=await db.from("hole_recommendations").update(payload).eq("id",id);if(error)throw error;
      }else{
        const {error}=await db.from("hole_recommendations").insert(payload);if(error){
          if(String(error.message||"").toLowerCase().includes("duplicate"))throw new Error("Ya existe una recomendación para esos litros. Editala en la lista.");
          throw error;
        }
      }
      await loadAll();resetHoleRecommendationForm();toast("Recomendación guardada");
    }catch(err){msg("holeRecommendationMessage",err.message||"No se pudo guardar.","error")}
  });
  $("holeRecommendationList").addEventListener("click",async e=>{
    const edit=e.target.dataset.editHole,del=e.target.dataset.deleteHole;
    if(edit){
      const r=holeRecommendations.find(x=>x.id===edit);if(!r)return;
      $("holeRecommendationId").value=r.id;
      $("holeRecommendationLiters").value=r.liters;
      $("holeRecommendationWidth").value=r.width_cm;
      $("holeRecommendationDepth").value=r.depth_cm;
      $("cancelHoleRecommendationEdit").hidden=false;
      msg("holeRecommendationMessage","");
      $("holeRecommendationForm").scrollIntoView({behavior:"smooth",block:"center"});
    }
    if(del){
      if(!confirm("¿Eliminar esta recomendación de pozo?"))return;
      const {error}=await db.from("hole_recommendations").delete().eq("id",del);
      if(error)return toast(error.message);
      await loadAll();resetHoleRecommendationForm();toast("Recomendación eliminada");
    }
  });
  $("cancelHoleRecommendationEdit").addEventListener("click",resetHoleRecommendationForm);

  $("categoryForm").addEventListener("submit",async e=>{
    e.preventDefault();msg("categoryMessage","Guardando...");
    try{
      const requestedPosition=Number($("categoryOrder").value||1);
      const payload={name:$("categoryName").value.trim(),slug:slugify($("categoryName").value),description:$("categoryDescription").value.trim(),sort_order:requestedPosition,calculation_mode:$("categoryMode").value,active:$("categoryActive").checked,updated_at:new Date().toISOString()};
      let saved;
      if($("categoryId").value){
        const {data,error}=await db.from("categories").update(payload).eq("id",$("categoryId").value).select().single();
        if(error)throw error;saved=data;
      }else{
        const {data,error}=await db.from("categories").insert(payload).select().single();
        if(error)throw error;saved=data;
      }
      await reorderCategory(saved.id,requestedPosition);
      await loadAll();
      resetCategoryForm();
      toast("Categoría guardada");
    }catch(err){
      msg("categoryMessage",err.message||"No se pudo guardar la categoría.","error");
    }
  });
  function resetCategoryForm(){
    $("categoryForm").reset();$("categoryId").value="";$("categoryMode").value="unit";$("categoryActive").checked=true;
    $("categoryFormTitle").textContent="Agregar categoría";$("cancelCategoryEdit").hidden=true;msg("categoryMessage","");
    renderCategoryOrderOptions(categories.length+1);
  }
  function renderCategories(){
    $("categoryList").innerHTML=categories.map(c=>`<div class="item-row"><div><div class="item-title">${esc(c.name)} ${c.active?"":"· Oculta"}</div><div class="item-meta">${c.calculation_mode==="linear"?"Metros lineales":c.calculation_mode==="area"?"Por m²":"Por unidades"} · orden ${c.sort_order}</div></div><div class="item-actions"><button class="small-btn" data-edit-category="${c.id}">Editar</button><button class="small-btn danger" data-delete-category="${c.id}">Eliminar</button></div></div>`).join("");
  }
  $("categoryList").addEventListener("click",async e=>{
    const edit=e.target.dataset.editCategory,del=e.target.dataset.deleteCategory;
    if(edit){
      const c=categories.find(x=>x.id===edit);
      $("categoryId").value=c.id;$("categoryName").value=c.name;$("categoryDescription").value=c.description||"";
      $("categoryMode").value=c.calculation_mode;$("categoryActive").checked=c.active;
      $("categoryFormTitle").textContent=`Editar: ${c.name}`;$("cancelCategoryEdit").hidden=false;
      renderCategoryOrderOptions(c.sort_order);
      scrollTo({top:220,behavior:"smooth"});
    }
    if(del){
      if(assocs.some(a=>a.category_id===del))return toast("Quitá primero las plantas de esta categoría.");
      if(!confirm("¿Eliminar categoría?"))return;
      const {error}=await db.from("categories").delete().eq("id",del);if(error)return toast(error.message);
      const remaining=categories.filter(c=>c.id!==del).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)||a.name.localeCompare(b.name,"es")).map(c=>c.id);
      try{await persistCategorySequence(remaining)}catch(err){return toast(err.message)}
      await loadAll();resetCategoryForm();
    }
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
  function orderItemCalcMeta(item){
    if(item.material_volume_dm3){
      const volume=Number(item.material_volume_dm3).toLocaleString("es-AR",{maximumFractionDigits:1});
      if(item.hole_count){
        return `Cálculo: ${item.hole_count} pozos · ${Number(item.hole_width_cm||0).toLocaleString("es-AR")}×${Number(item.hole_width_cm||0).toLocaleString("es-AR")}×${Number(item.hole_depth_cm||0).toLocaleString("es-AR")} cm · ${volume} dm³`;
      }
      if(item.coverage_area_m2){
        return `Cálculo: ${Number(item.coverage_area_m2).toLocaleString("es-AR")} m² · ${Number(item.fill_depth_cm||0).toLocaleString("es-AR")} cm de profundidad · ${volume} dm³`;
      }
    }
    if(item.length_m)return `Cálculo: ${Number(item.length_m).toLocaleString("es-AR")} m lineales · distancia ${Number(item.spacing_cm||0).toLocaleString("es-AR")} cm`;
    return "";
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
          <div class="order-items">${items.map(i=>`<div class="order-item-row" data-item="${i.id}"><label>Ítem<input class="oi-name" value="${esc(i.item_name+(i.variant_label?` · ${i.variant_label}`:""))}">${orderItemCalcMeta(i)?`<small>${esc(orderItemCalcMeta(i))}</small>`:""}</label><label>Cant.<input class="oi-qty" type="number" min="1" value="${i.quantity}"></label><label>Precio u.<input class="oi-price" type="number" min="0" step="0.01" value="${i.unit_price}"></label><label>Costo u.<input class="oi-cost" type="number" min="0" step="0.01" value="${i.unit_cost}"></label><button class="small-btn danger" data-delete-item="${i.id}">Quitar</button></div>`).join("")}</div>
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
