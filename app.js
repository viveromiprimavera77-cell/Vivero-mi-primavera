(() => {
  const cfg=window.VIVERO_CONFIG;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n||0));
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const normalize=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  let catalogProducts=[],catalogCategories=[],catalogAssocs=[],catalogVariants=[];

  function waLink(number,message){const digits=String(number||"").replace(/\D/g,"");return digits?`https://wa.me/${digits}?text=${encodeURIComponent(message)}`:""}
  function setupDrag(node){
    if(!node||node.dataset.dragReady)return;node.dataset.dragReady="1";let down=false,startX=0,startLeft=0;
    node.addEventListener("pointerdown",e=>{if(e.pointerType==="touch")return;down=true;startX=e.clientX;startLeft=node.scrollLeft;node.classList.add("dragging");node.setPointerCapture?.(e.pointerId)});
    node.addEventListener("pointermove",e=>{if(down)node.scrollLeft=startLeft-(e.clientX-startX)});
    ["pointerup","pointercancel","pointerleave"].forEach(ev=>node.addEventListener(ev,()=>{down=false;node.classList.remove("dragging")}));
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

    const setDots=()=>{
      dots.forEach((dot,i)=>dot.classList.toggle("active",i===index));
    };

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
      index=0;
      setDots();
      measureFixedHeight();
      originals[0].querySelectorAll("img").forEach(img=>img.addEventListener("load",measureFixedHeight,{once:true}));
      window.addEventListener("resize",measureFixedHeight,{passive:true});
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
      requestAnimationFrame(()=>{
        track.style.scrollBehavior="";
        wrapping=false;
      });
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
      if(raw===0){
        index=count-1;
        setDots();
        jumpToRaw(count);
      }else if(raw===count+1){
        index=0;
        setDots();
        jumpToRaw(1);
      }else{
        index=Math.max(0,Math.min(count-1,raw-1));
        setDots();
      }
    };

    track.addEventListener("scroll",()=>{
      syncFromScroll();
      clearTimeout(settleTimer);
      settleTimer=setTimeout(settle,120);
    },{passive:true});

    if("onscrollend" in window)track.addEventListener("scrollend",settle,{passive:true});
    setupDrag(track);

    [...track.querySelectorAll("img")].forEach(img=>{
      if(img.complete)return;
      img.addEventListener("load",measureFixedHeight,{once:true});
    });

    const resize=()=>{
      measureFixedHeight();
      jumpToRaw(index+1);
    };
    window.addEventListener("resize",resize,{passive:true});

    requestAnimationFrame(()=>{
      measureFixedHeight();
      jumpToRaw(1);
      setDots();
    });
  }

  function closeMenu(){el("sidebar").classList.remove("open");el("menuBackdrop").classList.remove("show");el("mobileMenuBtn").setAttribute("aria-expanded","false")}
  const WELCOME_SESSION_KEY="miPrimaveraWelcomeShown";
  function openWelcome(tagline){
    if(sessionStorage.getItem(WELCOME_SESSION_KEY)==="1")return;
    el("welcomeSlogan").textContent=tagline||"Naturaleza que transforma tu espacio";
    el("welcomeModal").hidden=false;
    document.body.classList.add("welcome-open");
    sessionStorage.setItem(WELCOME_SESSION_KEY,"1");
  }
  function closeWelcome(){
    el("welcomeModal").hidden=true;
    document.body.classList.remove("welcome-open");
  }

  function firstProductImage(p){
    return p.image_url||p.integrated_image_url||"";
  }
  function plantInfoSlide(p){
    if(!p.scientific_name)return "";
    const facts=[
      ["Uso",p.use_summary],
      ["Follaje",p.foliage_type],
      ["Luz",p.sun_exposure],
      ["Resistencia",p.climate_tolerance],
      ["Altura máxima",p.max_height],
      ["Desarrollo",p.maturity_time],
      ["Crecimiento",p.growth_rate],
      ["Floración",p.flowering_info],
      ["Riego",p.water_needs]
    ].filter(([,value])=>Boolean(value));
    return `<div class="photo-slide info-slide plant-info-slide">
      <span class="slide-label">Ficha</span>
      <div class="plant-info-content">
        <div class="plant-info-head">
          <strong>${esc(p.name)}</strong>
          <em>${esc(p.scientific_name)}</em>
        </div>
        <div class="plant-info-facts">
          ${facts.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}
        </div>
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
      ...imageSlides.map(x=>`<div class="photo-slide photo-image-slide"><img src="${esc(x.url)}" alt="${esc(p.name)} - ${x.label}" loading="lazy"><span class="slide-label">${x.label}</span></div>`),
      plantInfoSlide(p)
    ].filter(Boolean);
    if(!slides.length)return "";
    return `<div class="photo-carousel" data-photo-carousel>
      <div class="photo-track">${slides.join("")}</div>
      ${slides.length>1?`<div class="photo-dots">${slides.map(()=>"<span></span>").join("")}</div>`:""}
    </div>`;
  }
  function highlights(p){
    const rows=[p.max_height?`<div><span>Altura máxima</span><strong>${esc(p.max_height)}</strong></div>`:"",p.maturity_time?`<div><span>Desarrollo máximo</span><strong>${esc(p.maturity_time)}</strong></div>`:"",p.pruning_per_year?`<div><span>Podas anuales</span><strong>${esc(p.pruning_per_year)}</strong></div>`:""].filter(Boolean);
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
    const cat=catalogCategories.find(c=>c.id===categoryId);
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
    const autoHeight=!area&&rawAvailable.length>0 && rawAvailable.every(v=>!v.liters) && rawAvailable.some(v=>v.height);
    const priority=area||!!p.prioritize_height||autoHeight;
    const available=sortedVariants(rawAvailable,priority);
    if(!available.length)return `<div class="variant-selector empty-variants">Consultar disponibilidad de presentaciones.</div>`;
    const keyOf=v=>priority?String(v.height||"").trim().toLowerCase():String(v.liters??"none");
    const counts={};available.forEach(v=>{const k=keyOf(v);counts[k]=(counts[k]||0)+1});
    const title=area?"Elegí las dimensiones":priority?"Elegí la altura":"Seleccioná los litros";
    const buttons=available.map((v,i)=>{
      let main=priority?(v.height||(area?"Sin dimensiones":"Sin altura")):(v.liters?`${Number(v.liters).toLocaleString("es-AR")} L`:"Única");
      const duplicate=counts[keyOf(v)]>1;
      if(duplicate)main+=` · ${presentationText(v,categoryId)}`;
      return `<button type="button" class="option-chip liter-chip ${i===0?"active":""}" data-variant="${v.id}">${esc(main)}</button>`;
    }).join("");
    return `<div class="variant-selector" data-product="${p.id}" data-category="${categoryId}" data-priority="${area?"dimensions":priority?"height":"liters"}">
      <div class="selector-title">${title}</div>
      <div class="liters-options">${buttons}</div>
      <div class="selected-presentation-line"><span>Presentación</span><strong class="selected-presentation">${esc(presentationText(available[0],categoryId))}</strong></div>
    </div>`;
  }
  function card(p,assoc,variants){
    const pvars=sortedVariants(variants.filter(v=>v.product_id===p.id&&v.active),!!p.prioritize_height),available=pvars.filter(v=>v.availability==="in_stock"),initial=available[0]||pvars[0]||null;
    const searchText=normalize([p.name,p.description,p.max_height,p.maturity_time,p.pruning_per_year].filter(Boolean).join(" "));
    return `<article class="plant-card" id="planta-${esc(p.slug)}" data-product-card="${p.id}" data-search="${esc(searchText)}">
      ${photoCarousel(p)}<div class="plant-body"><h3>${esc(p.name)}</h3><p>${esc(p.description||"")}</p>${highlights(p)}${selectorHtml(p,pvars,assoc.category_id)}
      <div class="card-bottom"><span class="price dynamic-price">${initial?money(initial.price):"Consultar"}</span><span class="status ${initial?.availability==="in_stock"?"status-stock":""}">${initial?.availability==="in_stock"?"En stock":"Consultar disponibilidad"}</span></div></div>
      <a class="calc-open-link" href="calculadora.html?category=${assoc.category_id}&product=${p.id}${initial?`&variant=${initial.id}`:""}"><span>Calculadora de cantidad y costos</span><span>›</span></a>
    </article>`;
  }
  function setupVariantSelectors(variants){
    document.querySelectorAll(".variant-selector[data-product]").forEach(box=>{
      const pid=box.dataset.product,cid=box.dataset.category,all=variants.filter(v=>v.product_id===pid&&v.active),card=box.closest(".plant-card"),price=card.querySelector(".dynamic-price"),status=card.querySelector(".status"),pres=box.querySelector(".selected-presentation"),calc=card.querySelector(".calc-open-link");
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
    });
  }
  function matchingProducts(q){
    if(!q)return [];
    return catalogProducts.filter(p=>normalize([p.name,p.description,p.max_height,p.maturity_time,p.pruning_per_year].filter(Boolean).join(" ")).includes(q));
  }
  function renderSearchResults(q){
    const box=el("searchResults");
    if(!q){box.hidden=true;box.innerHTML="";return []}
    const matches=matchingProducts(q);
    box.innerHTML=matches.length?matches.slice(0,8).map(p=>{
      const cats=catalogAssocs.filter(a=>a.product_id===p.id).map(a=>catalogCategories.find(c=>c.id===a.category_id)?.name).filter(Boolean);
      return `<button type="button" class="hero-search-result" data-search-product="${p.id}"><span><strong>${esc(p.name)}</strong><small>${esc([...new Set(cats)].join(" · ")||"Producto")}</small></span><b>Ver →</b></button>`;
    }).join(""):`<div class="hero-search-no-result">No encontramos plantas o productos con esa búsqueda.</div>`;
    box.hidden=false;
    return matches;
  }
  function goToSearchProduct(productId){
    const product=catalogProducts.find(p=>p.id===productId);if(!product)return;
    const target=document.querySelector(`#planta-${CSS.escape(product.slug)}`);
    if(target){target.scrollIntoView({behavior:"smooth",block:"start"});setTimeout(()=>target.classList.add("search-hit"),250);setTimeout(()=>target.classList.remove("search-hit"),1900)}
    el("searchResults").hidden=true;
  }
  function applySearch(){
    const q=normalize(el("plantSearch")?.value||"").trim();let shown=0;
    document.querySelectorAll(".category-section").forEach(section=>{
      let sectionShown=0;section.querySelectorAll(".plant-card").forEach(card=>{const match=!q||card.dataset.search.includes(q);card.hidden=!match;if(match){shown++;sectionShown++}});section.hidden=sectionShown===0;
    });
    const matches=renderSearchResults(q);
    el("catalogEmptySearch").hidden=shown>0||!q;
    el("clearPlantSearch").hidden=!q;
    el("searchStatus").textContent=q?(matches.length===1?"1 producto encontrado":`${matches.length} productos encontrados`):"Escribí para filtrar el catálogo automáticamente.";
    return matches;
  }

  async function load(){
    try{
      const [cr,pr,ar,vr,sr]=await Promise.all([db.from("categories").select("*").eq("active",true).order("sort_order").order("name"),db.from("products").select("*").eq("active",true).order("sort_order").order("name"),db.from("product_categories").select("*").order("sort_order"),db.from("product_variants").select("*").eq("active",true).order("sort_order"),db.from("site_settings").select("*").eq("id",1).maybeSingle()]);
      [cr,pr,ar,vr].forEach(r=>{if(r.error)throw r.error});
      const cats=cr.data||[],products=pr.data||[],assocs=ar.data||[],variants=vr.data||[],settings=sr.data||{};
      catalogCategories=cats;catalogProducts=products;catalogAssocs=assocs;catalogVariants=variants;
      if(settings.tagline)el("heroTitle").textContent=settings.tagline;el("shippingTitle").textContent=settings.shipping_title||"Envíos";el("shippingText").textContent=settings.shipping_text||"Realizamos entregas coordinadas. Consultanos por cobertura, costo y tiempos.";el("aboutTitle").textContent=settings.about_title||"Acerca de nosotros";el("aboutText").textContent=settings.about_text||"En Mi Primavera seleccionamos plantas para cercos, jardines y espacios verdes.";openWelcome(settings.tagline);
      if(settings.hero_video_url){el("heroVideo").src=settings.hero_video_url;el("heroVideo").style.display="block";el("heroFallback").style.display="none";el("heroVideo").addEventListener("error",()=>{el("heroVideo").style.display="none";el("heroFallback").style.display="grid"},{once:true})}
      const wa=waLink(settings.whatsapp,"Hola Mi Primavera, quisiera hacer una consulta.");["shippingWhatsapp","whatsappFloat"].forEach(id=>{if(wa){el(id).href=wa;el(id).hidden=false}});
      const featured=products.filter(p=>p.featured);el("featured").innerHTML=featured.length?featured.map(p=>{const a=assocs.find(x=>x.product_id===p.id);return `<a class="featured-card" href="${a?`#planta-${esc(p.slug)}`:"#catalogo"}">${firstProductImage(p)?`<img src="${esc(firstProductImage(p))}" alt="${esc(p.name)}">`:`<div class="featured-placeholder">Mi Primavera</div>`}<div class="featured-body"><strong>${esc(p.name)}</strong><span>Ver presentaciones y precios</span></div></a>`}).join(""):`<div class="empty-state">Todavía no hay plantas destacadas.</div>`;
      el("categoryNav").innerHTML=cats.length?cats.map(c=>{const ids=assocs.filter(a=>a.category_id===c.id).map(a=>a.product_id),ps=products.filter(p=>ids.includes(p.id));const categoryUrl=`categoria.html?categoria=${encodeURIComponent(c.slug)}`;return `<a class="category-link" href="${categoryUrl}">${esc(c.name)}</a>${ps.map(p=>`<a class="plant-link" href="${categoryUrl}&planta=${encodeURIComponent(p.slug)}">↳ ${esc(p.name)}</a>`).join("")}`}).join(""):`<span class="nav-loading">Sin categorías</span>`;
      el("categoryJump").innerHTML=`<option value="">Todas las categorías</option>${cats.map(c=>`<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join("")}`;
      el("categories").innerHTML=cats.length?cats.map(c=>{const rows=assocs.filter(a=>a.category_id===c.id).map(a=>({a,p:products.find(p=>p.id===a.product_id)})).filter(x=>x.p);return `<section class="category-section" id="cat-${esc(c.slug)}"><div class="category-header"><h2>${esc(c.name)}</h2><p class="category-description">${esc(c.description||"")}</p></div><div class="plant-grid">${rows.length?rows.map(x=>card(x.p,x.a,variants)).join(""):`<div class="empty-state">Próximamente sumaremos plantas a esta categoría.</div>`}</div></section>`}).join(""):`<div class="empty-state">El catálogo está listo para empezar a cargar plantas.</div>`;
      document.querySelectorAll(".featured-strip.drag-scroll").forEach(setupDrag);
      document.querySelectorAll("[data-photo-carousel]").forEach(setupPhotoCarousel);
      setupVariantSelectors(variants);
    }catch(err){console.error(err);el("categories").innerHTML=`<div class="empty-state">No pudimos cargar el catálogo.</div>`}
  }

  document.addEventListener("click",e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const target=document.querySelector(a.getAttribute("href"));if(!target)return;e.preventDefault();target.scrollIntoView({behavior:"smooth",block:"start"});if(innerWidth<=900)closeMenu()});
  el("mobileMenuBtn").addEventListener("click",()=>{const open=el("sidebar").classList.toggle("open");el("menuBackdrop").classList.toggle("show",open);el("mobileMenuBtn").setAttribute("aria-expanded",String(open))});el("menuBackdrop").addEventListener("click",closeMenu);
  el("plantSearch").addEventListener("input",applySearch);
  el("plantSearch").addEventListener("keydown",e=>{if(e.key!=="Enter")return;e.preventDefault();const matches=applySearch();if(matches.length)goToSearchProduct(matches[0].id)});
  el("searchResults").addEventListener("click",e=>{const btn=e.target.closest("[data-search-product]");if(btn)goToSearchProduct(btn.dataset.searchProduct)});
  el("clearPlantSearch").addEventListener("click",()=>{el("plantSearch").value="";applySearch();el("plantSearch").focus()});
  el("categoryJump").addEventListener("change",e=>{if(!e.target.value)return;location.href=`categoria.html?categoria=${encodeURIComponent(e.target.value)}`});
  el("welcomeClose").addEventListener("click",closeWelcome);
  el("welcomeStart").addEventListener("click",closeWelcome);
  el("welcomeModal").addEventListener("click",e=>{if(e.target===el("welcomeModal"))closeWelcome()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!el("welcomeModal").hidden)closeWelcome()});
  const topBtn=el("backToTop");window.addEventListener("scroll",()=>topBtn.classList.toggle("show",window.scrollY>500),{passive:true});topBtn.addEventListener("click",()=>scrollTo({top:0,behavior:"smooth"}));
  load();
})();
