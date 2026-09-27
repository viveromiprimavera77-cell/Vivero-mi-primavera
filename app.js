(() => {
  const cfg=window.VIVERO_CONFIG;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function waLink(number,message){
    const digits=String(number||'').replace(/\D/g,'');
    return digits?`https://wa.me/${digits}?text=${encodeURIComponent(message)}`:'';
  }
  function setupDrag(node){
    if(!node||node.dataset.dragReady)return;
    node.dataset.dragReady='1';
    let down=false,startX=0,startLeft=0;
    node.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;down=true;startX=e.clientX;startLeft=node.scrollLeft;node.classList.add('dragging');node.setPointerCapture?.(e.pointerId)});
    node.addEventListener('pointermove',e=>{if(down)node.scrollLeft=startLeft-(e.clientX-startX)});
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>node.addEventListener(ev,()=>{down=false;node.classList.remove('dragging')}));
  }
  function closeMenu(){
    el('sidebar').classList.remove('open');el('menuBackdrop').classList.remove('show');el('mobileMenuBtn').setAttribute('aria-expanded','false');
  }

  function photoCarousel(p){
    const slides=[
      {url:p.image_url,label:'Planta',info:false},
      {url:p.integrated_image_url,label:'Integrada',info:false},
      {url:p.info_image_url,label:'Ficha',info:true}
    ];
    return `<div class="photo-carousel"><div class="photo-track drag-scroll">
      ${slides.map(x=>`<div class="photo-slide ${x.info?'info-slide':''}">${x.url?`<img src="${esc(x.url)}" alt="${esc(p.name)} - ${x.label}" loading="lazy">`:`<div class="plant-placeholder">Imagen ${x.label.toLowerCase()} pendiente</div>`}<span class="slide-label">${x.label}</span></div>`).join('')}
    </div><div class="photo-dots"><span></span><span></span><span></span></div></div>`;
  }

  function highlights(p){
    const rows=[
      p.max_height?`<div><span>Altura máxima</span><strong>${esc(p.max_height)}</strong></div>`:'',
      p.maturity_time?`<div><span>Desarrollo máximo</span><strong>${esc(p.maturity_time)}</strong></div>`:'',
      p.pruning_per_year?`<div><span>Podas anuales</span><strong>${esc(p.pruning_per_year)}</strong></div>`:''
    ].filter(Boolean);
    return rows.length?`<div class="plant-highlights">${rows.join('')}</div>`:'';
  }

  function sortedVariants(list){
    return [...list].sort((a,b)=>{
      const la=Number(a.liters??999999),lb=Number(b.liters??999999);
      if(la!==lb)return la-lb;
      return String(a.label).localeCompare(String(b.label),'es');
    });
  }

  function selectorHtml(p,pvars,categoryId){
    const available=sortedVariants(pvars.filter(v=>v.active&&v.availability==='in_stock'));
    if(!available.length)return `<div class="variant-selector empty-variants">Consultar disponibilidad de presentaciones.</div>`;
    const literCounts={};
    available.forEach(v=>{const k=String(v.liters??'none');literCounts[k]=(literCounts[k]||0)+1});
    return `<div class="variant-selector" data-product="${p.id}" data-category="${categoryId}">
      <div class="selected-presentation-line"><span>Presentación</span><strong class="selected-presentation">${esc(available[0].label)}</strong></div>
      <div class="option-row"><span class="option-label">Litros</span><div class="liters-options">
        ${available.map((v,i)=>{
          const liters=v.liters?`${Number(v.liters).toLocaleString('es-AR')} L`:'Única';
          const duplicate=literCounts[String(v.liters??'none')]>1;
          return `<button type="button" class="option-chip liter-chip ${i===0?'active':''}" data-variant="${v.id}">${liters}${duplicate?` · ${esc(v.label)}`:''}</button>`;
        }).join('')}
      </div></div>
    </div>`;
  }

  function card(p,assoc,variants){
    const pvars=sortedVariants(variants.filter(v=>v.product_id===p.id&&v.active));
    const available=pvars.filter(v=>v.availability==='in_stock');
    const initial=available[0]||pvars[0]||null;
    return `<article class="plant-card" id="planta-${esc(p.slug)}" data-product-card="${p.id}">
      ${photoCarousel(p)}
      <div class="plant-body">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description||'')}</p>
        ${highlights(p)}
        ${selectorHtml(p,pvars,assoc.category_id)}
        <div class="card-bottom">
          <span class="price dynamic-price">${initial?money(initial.price):'Consultar'}</span>
          <span class="status ${initial?.availability==='in_stock'?'status-stock':''}">${initial?.availability==='in_stock'?'En stock':'Consultar disponibilidad'}</span>
        </div>
      </div>
      <a class="calc-open-link" href="calculadora.html?category=${assoc.category_id}&product=${p.id}${initial?`&variant=${initial.id}`:''}"><span>Calculadora de cantidad y costos</span><span>›</span></a>
    </article>`;
  }

  function setupVariantSelectors(variants){
    document.querySelectorAll('.variant-selector[data-product]').forEach(box=>{
      const pid=box.dataset.product,cid=box.dataset.category;
      const all=variants.filter(v=>v.product_id===pid&&v.active);
      const card=box.closest('.plant-card');
      const price=card.querySelector('.dynamic-price'),status=card.querySelector('.status'),pres=box.querySelector('.selected-presentation'),calc=card.querySelector('.calc-open-link');
      function choose(v){
        if(!v)return;
        box.querySelectorAll('.liter-chip').forEach(b=>b.classList.toggle('active',b.dataset.variant===v.id));
        pres.textContent=v.label;
        price.textContent=money(v.price);
        status.textContent=v.availability==='in_stock'?'En stock':'Consultar disponibilidad';
        status.classList.toggle('status-stock',v.availability==='in_stock');
        calc.href=`calculadora.html?category=${cid}&product=${pid}&variant=${v.id}`;
      }
      box.addEventListener('click',e=>{
        const b=e.target.closest('.liter-chip');if(!b)return;
        choose(all.find(v=>v.id===b.dataset.variant));
      });
    });
  }

  async function load(){
    try{
      const [cr,pr,ar,vr,sr]=await Promise.all([
        db.from('categories').select('*').eq('active',true).order('sort_order').order('name'),
        db.from('products').select('*').eq('active',true).order('sort_order').order('name'),
        db.from('product_categories').select('*').order('sort_order'),
        db.from('product_variants').select('*').eq('active',true).order('sort_order'),
        db.from('site_settings').select('*').eq('id',1).maybeSingle()
      ]);
      [cr,pr,ar,vr].forEach(r=>{if(r.error)throw r.error});
      const cats=cr.data||[],products=pr.data||[],assocs=ar.data||[],variants=vr.data||[],settings=sr.data||{};
      if(settings.tagline)el('heroTitle').textContent=settings.tagline;
      el('shippingTitle').textContent=settings.shipping_title||'Envíos';
      el('shippingText').textContent=settings.shipping_text||'Realizamos entregas coordinadas. Consultanos por cobertura, costo y tiempos.';
      el('aboutTitle').textContent=settings.about_title||'Acerca de nosotros';
      el('aboutText').textContent=settings.about_text||'En Mi Primavera seleccionamos plantas para cercos, jardines y espacios verdes.';
      if(settings.hero_video_url){
        el('heroVideo').src=settings.hero_video_url;el('heroVideo').style.display='block';el('heroFallback').style.display='none';
        el('heroVideo').addEventListener('error',()=>{el('heroVideo').style.display='none';el('heroFallback').style.display='grid'},{once:true});
      }
      const wa=waLink(settings.whatsapp,'Hola Mi Primavera, quisiera hacer una consulta.');
      ['shippingWhatsapp','whatsappFloat'].forEach(id=>{if(wa){el(id).href=wa;el(id).hidden=false}});

      const featured=products.filter(p=>p.featured);
      el('featured').innerHTML=featured.length?featured.map(p=>{
        const a=assocs.find(x=>x.product_id===p.id);
        return `<a class="featured-card" href="${a?`#planta-${esc(p.slug)}`:'#catalogo'}">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}">`:`<div class="featured-placeholder">Mi Primavera</div>`}<div class="featured-body"><strong>${esc(p.name)}</strong><span>Ver presentaciones y precios</span></div></a>`;
      }).join(''):`<div class="empty-state">Todavía no hay plantas destacadas.</div>`;

      el('categoryNav').innerHTML=cats.length?cats.map(c=>{
        const ids=assocs.filter(a=>a.category_id===c.id).map(a=>a.product_id),ps=products.filter(p=>ids.includes(p.id));
        return `<a class="category-link" href="#cat-${esc(c.slug)}">${esc(c.name)}</a>${ps.map(p=>`<a class="plant-link" href="#planta-${esc(p.slug)}">↳ ${esc(p.name)}</a>`).join('')}`;
      }).join(''):`<span class="nav-loading">Sin categorías</span>`;

      el('categories').innerHTML=cats.length?cats.map(c=>{
        const rows=assocs.filter(a=>a.category_id===c.id).map(a=>({a,p:products.find(p=>p.id===a.product_id)})).filter(x=>x.p);
        return `<section class="category-section" id="cat-${esc(c.slug)}"><div class="category-header"><h2>${esc(c.name)}</h2><p class="category-description">${esc(c.description||'')}</p></div><div class="plant-grid">${rows.length?rows.map(x=>card(x.p,x.a,variants)).join(''):`<div class="empty-state">Próximamente sumaremos plantas a esta categoría.</div>`}</div></section>`;
      }).join(''):`<div class="empty-state">El catálogo está listo para empezar a cargar plantas.</div>`;

      document.querySelectorAll('.drag-scroll').forEach(setupDrag);
      setupVariantSelectors(variants);
    }catch(err){console.error(err);el('categories').innerHTML=`<div class="empty-state">No pudimos cargar el catálogo.</div>`}
  }

  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href^="#"]');if(!a)return;
    const target=document.querySelector(a.getAttribute('href'));if(!target)return;
    e.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});if(innerWidth<=900)closeMenu();
  });
  el('mobileMenuBtn').addEventListener('click',()=>{const open=el('sidebar').classList.toggle('open');el('menuBackdrop').classList.toggle('show',open);el('mobileMenuBtn').setAttribute('aria-expanded',String(open))});
  el('menuBackdrop').addEventListener('click',closeMenu);
  load();
})();
