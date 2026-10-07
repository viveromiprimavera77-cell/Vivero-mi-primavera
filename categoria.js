(() => {
  const cfg=window.VIVERO_CONFIG;
  if(!cfg||!window.supabase)return;

  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n||0));
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  let categories=[],products=[],assocs=[],variants=[],currentCategory=null;

  function waLink(number,message){
    const digits=String(number||"").replace(/\D/g,"");
    return digits?`https://wa.me/${digits}?text=${encodeURIComponent(message)}`:"";
  }

  function closeMenu(){
    el("sidebar").classList.remove("open");
    el("menuBackdrop").classList.remove("show");
    el("mobileMenuBtn").setAttribute("aria-expanded","false");
  }

  function firstProductImage(p){
    return p.image_url||p.integrated_image_url||"";
  }

  function setupDrag(node){
    if(!node||node.dataset.dragReady)return;
    node.dataset.dragReady="1";
    let down=false,startX=0,startLeft=0;
    node.addEventListener("pointerdown",e=>{
      if(e.pointerType==="touch")return;
      down=true;startX=e.clientX;startLeft=node.scrollLeft;
      node.classList.add("dragging");
      node.setPointerCapture?.(e.pointerId);
    });
    node.addEventListener("pointermove",e=>{if(down)node.scrollLeft=startLeft-(e.clientX-startX)});
    ["pointerup","pointercancel","pointerleave"].forEach(ev=>node.addEventListener(ev,()=>{
      down=false;node.classList.remove("dragging");
    }));
  }

  function setupPhotoCarousel(carousel){
    if(!carousel||carousel.dataset.carouselReady)return;
    carousel.dataset.carouselReady="1";
    const track=carousel.querySelector(".photo-track");
    const originals=[...track.querySelectorAll(".photo-slide")];
    const dots=[...carousel.querySelectorAll(".photo-dots span")];
    if(!originals.length)return;

    let index=0,settleTimer=null,wrapping=false;
    const count=originals.length;
    const setDots=()=>dots.forEach((dot,i)=>dot.classList.toggle("active",i===index));

    const measureFixedHeight=()=>{
      requestAnimationFrame(()=>{
        originals.forEach(slide=>slide.style.height="auto");
        const imageBase=Math.ceil((carousel.clientWidth||1)*3/4);
        const contentHeights=originals.map(slide=>Math.ceil(slide.scrollHeight||0));
        const fixed=Math.max(imageBase,...contentHeights);
        if(fixed>0){
          track.style.height=`${fixed}px`;
          [...track.querySelectorAll(".photo-slide")].forEach(slide=>slide.style.height=`${fixed}px`);
        }
      });
    };

    if(count===1){
      setDots();measureFixedHeight();
      originals[0].querySelectorAll("img").forEach(img=>img.addEventListener("load",measureFixedHeight,{once:true}));
      return;
    }

    const firstClone=originals[0].cloneNode(true);
    const lastClone=originals[count-1].cloneNode(true);
    firstClone.classList.add("carousel-clone");
    lastClone.classList.add("carousel-clone");
    firstClone.setAttribute("aria-hidden","true");
    lastClone.setAttribute("aria-hidden","true");
    track.prepend(lastClone);
    track.append(firstClone);

    const jumpToRaw=raw=>{
      wrapping=true;
      track.style.scrollBehavior="auto";
      track.scrollLeft=raw*(carousel.clientWidth||1);
      requestAnimationFrame(()=>{track.style.scrollBehavior="";wrapping=false});
    };
    const syncFromScroll=()=>{
      if(wrapping)return;
      const width=carousel.clientWidth||1;
      const raw=Math.round(track.scrollLeft/width);
      if(raw<=0)index=count-1;
      else if(raw>=count+1)index=0;
      else index=raw-1;
      setDots();
    };
    const settle=()=>{
      if(wrapping)return;
      const width=carousel.clientWidth||1;
      const raw=Math.round(track.scrollLeft/width);
      if(raw===0){index=count-1;setDots();jumpToRaw(count)}
      else if(raw===count+1){index=0;setDots();jumpToRaw(1)}
      else{index=Math.max(0,Math.min(count-1,raw-1));setDots()}
    };

    track.addEventListener("scroll",()=>{
      syncFromScroll();
      clearTimeout(settleTimer);
      settleTimer=setTimeout(settle,120);
    },{passive:true});
    setupDrag(track);
    [...track.querySelectorAll("img")].forEach(img=>{
      if(!img.complete)img.addEventListener("load",measureFixedHeight,{once:true});
    });
    requestAnimationFrame(()=>{measureFixedHeight();jumpToRaw(1);setDots()});
  }

  function plantInfoSlide(p){
    if(!p.scientific_name)return "";
    const facts=[
      ["Uso",p.use_summary],["Follaje",p.foliage_type],["Luz",p.sun_exposure],
      ["Resistencia",p.climate_tolerance],["Altura máxima",p.max_height],
      ["Desarrollo",p.maturity_time],["Crecimiento",p.growth_rate],
      ["Floración",p.flowering_info],["Riego",p.water_needs]
    ].filter(([,value])=>Boolean(value));
    return `<div class="photo-slide info-slide plant-info-slide">
      <span class="slide-label">Ficha</span>
      <div class="plant-info-content">
        <div class="plant-info-head"><strong>${esc(p.name)}</strong><em>${esc(p.scientific_name)}</em></div>
        <div class="plant-info-facts">${facts.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>
        ${p.care_note?`<p class="plant-info-note"><strong>Dato útil:</strong> ${esc(p.care_note)}</p>`:""}
      </div>
    </div>`;
  }

  function photoCarousel(p){
    const imageSlides=[
      p.image_url?{url:p.image_url,label:"Planta"}:null,
      p.integrated_image_url?{url:p.integrated_image_url,label:"En jardín"}:null
    ].filter(Boolean);
    const slides=[
      ...imageSlides.map(x=>`<div class="photo-slide photo-image-slide"><img src="${esc(x.url)}" alt="${esc(p.name)} - ${x.label}"><span class="slide-label">${x.label}</span></div>`),
      plantInfoSlide(p)
    ].filter(Boolean);
    if(!slides.length)return `<div class="category-modal-placeholder">Mi Primavera</div>`;
    return `<div class="photo-carousel" data-photo-carousel>
      <div class="photo-track">${slides.join("")}</div>
      ${slides.length>1?`<div class="photo-dots">${slides.map(()=>"<span></span>").join("")}</div>`:""}
    </div>`;
  }

  function highlights(p){
    const rows=[
      p.max_height?`<div><span>Altura máxima</span><strong>${esc(p.max_height)}</strong></div>`:"",
      p.maturity_time?`<div><span>Desarrollo máximo</span><strong>${esc(p.maturity_time)}</strong></div>`:"",
      p.pruning_per_year?`<div><span>Podas anuales</span><strong>${esc(p.pruning_per_year)}</strong></div>`:""
    ].filter(Boolean);
    return rows.length?`<div class="plant-highlights">${rows.join("")}</div>`:"";
  }

  function numericFromText(value){
    const m=String(value||"").replace(",",".").match(/\d+(?:\.\d+)?/);
    return m?Number(m[0]):999999;
  }

  function sortedVariants(list,prioritizeHeight=false){
    return [...list].sort((a,b)=>{
      if(prioritizeHeight){
        const h=numericFromText(a.height)-numericFromText(b.height);
        if(h!==0)return h;
      }else{
        const l=Number(a.liters??999999)-Number(b.liters??999999);
        if(l!==0)return l;
      }
      return String(a.label).localeCompare(String(b.label),"es");
    });
  }

  function isAreaCategoryId(categoryId){
    const cat=categories.find(c=>c.id===categoryId);
    return cat?.calculation_mode==="area"||cat?.slug==="grama";
  }

  function presentationText(v,categoryId=null){
    if(!v)return "—";
    const area=isAreaCategoryId(categoryId);
    const size=area&&v.height?` · ${v.height}`:v.liters?` · ${Number(v.liters).toLocaleString("es-AR")} L`:"";
    return `${v.label}${size}`;
  }

  function selectorHtml(p,pvars,categoryId){
    const rawAvailable=pvars.filter(v=>v.active&&v.availability==="in_stock");
    const area=isAreaCategoryId(categoryId);
    const autoHeight=!area&&rawAvailable.length>0&&rawAvailable.every(v=>!v.liters)&&rawAvailable.some(v=>v.height);
    const priority=area||!!p.prioritize_height||autoHeight;
    const available=sortedVariants(rawAvailable,priority);
    if(!available.length)return `<div class="variant-selector empty-variants">Consultar disponibilidad de presentaciones.</div>`;

    const keyOf=v=>priority?String(v.height||"").trim().toLowerCase():String(v.liters??"none");
    const counts={};available.forEach(v=>{const k=keyOf(v);counts[k]=(counts[k]||0)+1});
    const title=area?"Elegí las dimensiones":priority?"Elegí la altura":"Seleccioná los litros";
    const buttons=available.map((v,i)=>{
      let main=priority?(v.height||(area?"Sin dimensiones":"Sin altura")):(v.liters?`${Number(v.liters).toLocaleString("es-AR")} L`:"Única");
      if(counts[keyOf(v)]>1)main+=` · ${presentationText(v,categoryId)}`;
      return `<button type="button" class="option-chip liter-chip ${i===0?"active":""}" data-variant="${v.id}">${esc(main)}</button>`;
    }).join("");
    return `<div class="variant-selector" data-product="${p.id}" data-category="${categoryId}">
      <div class="selector-title">${title}</div>
      <div class="liters-options">${buttons}</div>
      <div class="selected-presentation-line"><span>Presentación</span><strong class="selected-presentation">${esc(presentationText(available[0],categoryId))}</strong></div>
    </div>`;
  }

  function fullPlantCard(p,categoryId){
    const pvars=sortedVariants(variants.filter(v=>v.product_id===p.id&&v.active),!!p.prioritize_height);
    const available=pvars.filter(v=>v.availability==="in_stock");
    const initial=available[0]||pvars[0]||null;
    return `<article class="plant-card category-modal-plant-card" data-product-card="${p.id}">
      ${photoCarousel(p)}
      <div class="plant-body">
        <h3 id="categoryPlantModalTitle">${esc(p.name)}</h3>
        <p>${esc(p.description||"")}</p>
        ${highlights(p)}
        ${selectorHtml(p,pvars,categoryId)}
        <div class="card-bottom">
          <span class="price dynamic-price">${initial?money(initial.price):"Consultar"}</span>
          <span class="status ${initial?.availability==="in_stock"?"status-stock":""}">${initial?.availability==="in_stock"?"En stock":"Consultar disponibilidad"}</span>
        </div>
      </div>
      <a class="calc-open-link" href="calculadora.html?category=${categoryId}&product=${p.id}${initial?`&variant=${initial.id}`:""}"><span>Calculadora de cantidad y costos</span><span>›</span></a>
    </article>`;
  }

  function setupVariantSelector(card){
    const box=card.querySelector(".variant-selector[data-product]");
    if(!box)return;
    const pid=box.dataset.product,cid=box.dataset.category;
    const all=variants.filter(v=>v.product_id===pid&&v.active);
    const price=card.querySelector(".dynamic-price"),status=card.querySelector(".status"),pres=box.querySelector(".selected-presentation"),calc=card.querySelector(".calc-open-link");
    box.addEventListener("click",e=>{
      const b=e.target.closest(".liter-chip");if(!b)return;
      const v=all.find(x=>x.id===b.dataset.variant);if(!v)return;
      box.querySelectorAll(".liter-chip").forEach(x=>x.classList.toggle("active",x===b));
      pres.textContent=presentationText(v,cid);
      price.textContent=money(v.price);
      status.textContent=v.availability==="in_stock"?"En stock":"Consultar disponibilidad";
      status.classList.toggle("status-stock",v.availability==="in_stock");
      calc.href=`calculadora.html?category=${cid}&product=${pid}&variant=${v.id}`;
    });
  }

  function categoryCard(p,categoryId){
    const pvars=sortedVariants(variants.filter(v=>v.product_id===p.id&&v.active),!!p.prioritize_height);
    const available=pvars.filter(v=>v.availability==="in_stock");
    const initial=available[0]||pvars[0]||null;
    const image=firstProductImage(p);
    return `<button type="button" class="category-product-card" data-open-product="${p.id}">
      <div class="category-product-image">
        ${image?`<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">`:`<div class="category-product-placeholder">Mi Primavera</div>`}
        <span>Ver planta</span>
      </div>
      <div class="category-product-copy">
        <h3>${esc(p.name)}</h3>
        ${p.scientific_name?`<em>${esc(p.scientific_name)}</em>`:""}
        <p>${esc(p.description||"")}</p>
        <div class="category-product-bottom">
          <strong>${initial?money(initial.price):"Consultar"}</strong>
          <small>${initial?.availability==="in_stock"?"En stock":"Consultar disponibilidad"}</small>
        </div>
      </div>
    </button>`;
  }

  function openPlant(productId,pushUrl=true){
    const p=products.find(x=>x.id===productId);
    if(!p||!currentCategory)return;
    const modal=el("categoryPlantModal");
    el("categoryPlantModalContent").innerHTML=fullPlantCard(p,currentCategory.id);
    modal.hidden=false;
    document.body.classList.add("category-modal-open");
    const card=el("categoryPlantModalContent").querySelector(".plant-card");
    card.querySelectorAll("[data-photo-carousel]").forEach(setupPhotoCarousel);
    setupVariantSelector(card);
    if(pushUrl){
      const url=new URL(location.href);
      url.searchParams.set("planta",p.slug);
      history.replaceState(null,"",url);
    }
    requestAnimationFrame(()=>el("categoryPlantModal").querySelector(".category-plant-close")?.focus());
  }

  function closePlant(){
    el("categoryPlantModal").hidden=true;
    document.body.classList.remove("category-modal-open");
    el("categoryPlantModalContent").innerHTML="";
    const url=new URL(location.href);
    url.searchParams.delete("planta");
    history.replaceState(null,"",url);
  }

  function renderNavigation(){
    el("categoryNav").innerHTML=categories.length?categories.map(c=>{
      const ids=assocs.filter(a=>a.category_id===c.id).map(a=>a.product_id);
      const ps=products.filter(p=>ids.includes(p.id));
      const categoryUrl=`categoria.html?categoria=${encodeURIComponent(c.slug)}`;
      return `<a class="category-link ${currentCategory?.id===c.id?"active":""}" href="${categoryUrl}">${esc(c.name)}</a>
        ${ps.map(p=>`<a class="plant-link" href="${categoryUrl}&planta=${encodeURIComponent(p.slug)}">↳ ${esc(p.name)}</a>`).join("")}`;
    }).join(""):`<span class="nav-loading">Sin categorías</span>`;

    el("categoryPageSelect").innerHTML=categories.map(c=>`<option value="${esc(c.slug)}" ${currentCategory?.id===c.id?"selected":""}>${esc(c.name)}</option>`).join("");
  }

  function renderCategory(){
    document.title=`${currentCategory.name} | Mi Primavera`;
    el("categoryPageTitle").textContent=currentCategory.name;
    el("categoryPageDescription").textContent=currentCategory.description||"Explorá las plantas y presentaciones disponibles en esta categoría.";
    el("categoryProductsTitle").textContent=`Plantas de ${currentCategory.name}`;

    const ids=assocs.filter(a=>a.category_id===currentCategory.id).map(a=>a.product_id);
    const list=products.filter(p=>ids.includes(p.id));
    el("categoryProductCount").textContent=`${list.length} ${list.length===1?"opción":"opciones"}`;
    el("categoryProductGrid").innerHTML=list.length
      ?list.map(p=>categoryCard(p,currentCategory.id)).join("")
      :`<div class="empty-state category-grid-empty">Todavía no hay plantas cargadas en esta categoría.</div>`;

    const requestedPlant=new URLSearchParams(location.search).get("planta");
    if(requestedPlant){
      const p=list.find(x=>x.slug===requestedPlant||x.id===requestedPlant);
      if(p)setTimeout(()=>openPlant(p.id,false),0);
    }
  }

  async function load(){
    try{
      const [cr,pr,ar,vr,sr]=await Promise.all([
        db.from("categories").select("*").eq("active",true).order("sort_order").order("name"),
        db.from("products").select("*").eq("active",true).order("sort_order").order("name"),
        db.from("product_categories").select("*").order("sort_order"),
        db.from("product_variants").select("*").eq("active",true).order("sort_order"),
        db.from("site_settings").select("*").eq("id",1).maybeSingle()
      ]);
      [cr,pr,ar,vr].forEach(r=>{if(r.error)throw r.error});
      categories=cr.data||[];
      products=pr.data||[];
      assocs=ar.data||[];
      variants=vr.data||[];
      const settings=sr.data||{};

      const requested=new URLSearchParams(location.search).get("categoria");
      currentCategory=categories.find(c=>c.slug===requested||c.id===requested)||categories[0]||null;
      if(!currentCategory){
        el("categoryProductGrid").innerHTML='<div class="empty-state">Todavía no hay categorías disponibles.</div>';
        return;
      }

      renderNavigation();
      renderCategory();

      const wa=waLink(settings.whatsapp,"Hola Mi Primavera, quisiera hacer una consulta.");
      if(wa){el("whatsappFloat").href=wa;el("whatsappFloat").hidden=false}
    }catch(err){
      console.error(err);
      el("categoryProductGrid").innerHTML='<div class="empty-state">No pudimos cargar esta categoría. Probá nuevamente.</div>';
    }
  }

  el("mobileMenuBtn").addEventListener("click",()=>{
    const open=el("sidebar").classList.toggle("open");
    el("menuBackdrop").classList.toggle("show",open);
    el("mobileMenuBtn").setAttribute("aria-expanded",String(open));
  });
  el("menuBackdrop").addEventListener("click",closeMenu);
  el("categoryNav").addEventListener("click",()=>{if(innerWidth<=900)closeMenu()});

  el("categoryPageSelect").addEventListener("change",e=>{
    if(!e.target.value)return;
    location.href=`categoria.html?categoria=${encodeURIComponent(e.target.value)}`;
  });

  el("categoryProductGrid").addEventListener("click",e=>{
    const card=e.target.closest("[data-open-product]");
    if(card)openPlant(card.dataset.openProduct);
  });

  el("categoryPlantModal").addEventListener("click",e=>{
    if(e.target.hasAttribute("data-close-plant"))closePlant();
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&!el("categoryPlantModal").hidden)closePlant();
  });

  const topBtn=el("backToTop");
  window.addEventListener("scroll",()=>topBtn.classList.toggle("show",window.scrollY>500),{passive:true});
  topBtn.addEventListener("click",()=>scrollTo({top:0,behavior:"smooth"}));

  load();
})();