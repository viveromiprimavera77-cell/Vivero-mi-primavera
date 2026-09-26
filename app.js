(() => {
  const cfg = window.VIVERO_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  const el = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n||0));
  const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

  function waLink(number, message){
    const digits=String(number||"").replace(/\D/g,"");
    return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : "";
  }
  function closeMenu(){
    el("sidebar").classList.remove("open");
    el("menuBackdrop").classList.remove("show");
    el("mobileMenuBtn").setAttribute("aria-expanded","false");
  }
  function setupDrag(node){
    if(!node || node.dataset.dragReady) return;
    node.dataset.dragReady="1";
    let down=false,startX=0,startLeft=0;
    node.addEventListener("pointerdown",e=>{
      if(e.pointerType==="touch") return;
      down=true;startX=e.clientX;startLeft=node.scrollLeft;node.classList.add("dragging");node.setPointerCapture?.(e.pointerId);
    });
    node.addEventListener("pointermove",e=>{if(down) node.scrollLeft=startLeft-(e.clientX-startX)});
    ["pointerup","pointercancel","pointerleave"].forEach(ev=>node.addEventListener(ev,()=>{down=false;node.classList.remove("dragging")}));
  }
  function imagesFor(p){
    return [
      {url:p.image_url,label:"Planta",cls:""},
      {url:p.integrated_image_url,label:"Integrada",cls:""},
      {url:p.info_image_url,label:"Ficha",cls:"info-slide"}
    ];
  }
  function photoCarousel(p){
    const slides=imagesFor(p).map(x=>`
      <div class="photo-slide ${x.cls}">
        ${x.url ? `<img src="${esc(x.url)}" alt="${esc(p.name)} - ${x.label}" loading="lazy">` : `<div class="plant-placeholder">Imagen ${x.label.toLowerCase()} pendiente</div>`}
        <span class="slide-label">${x.label}</span>
      </div>`).join("");
    return `<div class="photo-carousel"><div class="photo-track drag-scroll">${slides}</div><div class="photo-dots"><span></span><span></span><span></span></div></div>`;
  }
  function card(p, assoc, variants){
    const available=variants.filter(v=>v.product_id===p.id && v.active && v.availability==="in_stock");
    const all=variants.filter(v=>v.product_id===p.id && v.active);
    const cheapest=available.length ? Math.min(...available.map(v=>Number(v.price))) : Number(p.price||0);
    const priceLabel=available.length>1 ? `Desde ${money(cheapest)}` : money(cheapest);
    const status=available.length ? `<span class="status status-stock">En stock</span>` : `<span class="status">Consultar disponibilidad</span>`;
    const chips=all.slice(0,5).map(v=>`<span class="meta-chip">${esc(v.label)}</span>`).join("");
    return `<article class="plant-card" id="planta-${esc(p.slug)}">
      ${photoCarousel(p)}
      <div class="plant-body">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description||"")}</p>
        ${chips?`<div class="meta-row">${chips}</div>`:""}
        <div class="card-bottom"><span class="price">${priceLabel}</span>${status}</div>
      </div>
      <a class="calc-open-link" href="calculadora.html?category=${encodeURIComponent(assoc.category_id)}&product=${encodeURIComponent(p.id)}">
        <span>Calculadora de cantidad y costos</span><span>›</span>
      </a>
    </article>`;
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
      [cr,pr,ar,vr].forEach(r=>{if(r.error) throw r.error});
      const cats=cr.data||[], products=pr.data||[], assocs=ar.data||[], variants=vr.data||[], settings=sr.data||{};

      if(settings.tagline) el("heroTitle").textContent=settings.tagline;
      if(settings.shipping_title) el("shippingTitle").textContent=settings.shipping_title;
      if(settings.shipping_text) el("shippingText").textContent=settings.shipping_text;
      if(settings.about_title) el("aboutTitle").textContent=settings.about_title;
      el("aboutText").textContent=settings.about_text||"En Mi Primavera seleccionamos plantas para cercos, jardines y espacios verdes, con atención personalizada.";

      if(settings.hero_video_url){
        el("heroVideo").src=settings.hero_video_url;el("heroVideo").style.display="block";el("heroFallback").style.display="none";
        el("heroVideo").addEventListener("error",()=>{el("heroVideo").style.display="none";el("heroFallback").style.display="grid"},{once:true});
      }
      const wa=waLink(settings.whatsapp,"Hola Mi Primavera, quisiera hacer una consulta.");
      ["heroWhatsapp","shippingWhatsapp","whatsappFloat"].forEach(id=>{if(wa){el(id).href=wa;el(id).hidden=false}});

      const featured=products.filter(p=>p.featured);
      el("featured").innerHTML=featured.length?featured.map(p=>{
        const firstAssoc=assocs.find(a=>a.product_id===p.id);
        const href=firstAssoc?`calculadora.html?category=${firstAssoc.category_id}&product=${p.id}`:"#catalogo";
        return `<a class="featured-card" href="${href}">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`:`<div class="featured-placeholder">Mi Primavera</div>`}<div class="featured-body"><strong>${esc(p.name)}</strong><span>Ver planta y calcular pedido</span></div></a>`;
      }).join(""):`<div class="empty-state">Todavía no hay plantas destacadas.</div>`;

      el("categoryNav").innerHTML=cats.length?cats.map(c=>{
        const pids=assocs.filter(a=>a.category_id===c.id).map(a=>a.product_id);
        const ps=products.filter(p=>pids.includes(p.id));
        return `<a class="category-link" href="#cat-${esc(c.slug)}">${esc(c.name)}</a>${ps.map(p=>`<a class="plant-link" href="#planta-${esc(p.slug)}">↳ ${esc(p.name)}</a>`).join("")}`;
      }).join(""):`<span class="nav-loading">Sin categorías</span>`;

      el("categories").innerHTML=cats.length?cats.map(c=>{
        const ca=assocs.filter(a=>a.category_id===c.id);
        const rows=ca.map(a=>({a,p:products.find(p=>p.id===a.product_id)})).filter(x=>x.p).sort((x,y)=>Number(x.p.sort_order)-Number(y.p.sort_order)||x.p.name.localeCompare(y.p.name));
        return `<section class="category-section" id="cat-${esc(c.slug)}">
          <div class="category-header"><h2>${esc(c.name)}</h2><p class="category-description">${esc(c.description||"")}</p></div>
          <div class="plant-grid">${rows.length?rows.map(x=>card(x.p,x.a,variants)).join(""):`<div class="empty-state">Próximamente sumaremos plantas a esta categoría.</div>`}</div>
        </section>`;
      }).join(""):`<div class="empty-state">El catálogo está listo para empezar a cargar plantas.</div>`;

      document.querySelectorAll(".drag-scroll").forEach(setupDrag);
    }catch(err){console.error(err);el("categories").innerHTML=`<div class="empty-state">No pudimos cargar el catálogo en este momento.</div>`}
  }

  document.addEventListener("click",e=>{
    const a=e.target.closest('a[href^="#"]');
    if(!a) return;
    const target=document.querySelector(a.getAttribute("href"));
    if(!target) return;
    e.preventDefault();target.scrollIntoView({behavior:"smooth",block:"start"});if(innerWidth<=900)closeMenu();
  });
  el("mobileMenuBtn").addEventListener("click",()=>{
    const open=el("sidebar").classList.toggle("open");el("menuBackdrop").classList.toggle("show",open);el("mobileMenuBtn").setAttribute("aria-expanded",String(open));
  });
  el("menuBackdrop").addEventListener("click",closeMenu);
  setupDrag(el("featured"));
  load();
})();
