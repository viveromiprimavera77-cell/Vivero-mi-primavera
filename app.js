(() => {
  const cfg = window.VIVERO_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  const el = (id) => document.getElementById(id);
  const money = (value) => new Intl.NumberFormat("es-AR", {style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(value || 0));

  function escapeHtml(value = "") {
    return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function plantCard(p) {
    const status = p.availability === "in_stock"
      ? `<span class="status status-stock">En stock</span>`
      : `<span class="status">Consultar disponibilidad</span>`;
    const meta = [
      p.pot_size ? `<span class="meta-chip">${escapeHtml(p.pot_size)}</span>` : "",
      p.height ? `<span class="meta-chip">${escapeHtml(p.height)}</span>` : ""
    ].join("");
    const image = p.image_url
      ? `<img class="plant-image" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy">`
      : `<div class="plant-placeholder"><span>Mi Primavera</span></div>`;
    return `<article class="plant-card" id="planta-${escapeHtml(p.slug)}"><div class="plant-image-wrap">${image}</div><div class="plant-body"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description || "")}</p>${meta ? `<div class="meta-row">${meta}</div>` : ""}<div class="card-bottom"><span class="price">${money(p.price)}</span>${status}</div></div></article>`;
  }

  function makeWhatsAppLink(number, message) {
    const digits = String(number || "").replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : "";
  }

  function showToast(message) {
    const toast = el("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function closeMobileMenu() {
    el("sidebar").classList.remove("open");
    el("menuBackdrop").classList.remove("show");
    el("mobileMenuBtn").setAttribute("aria-expanded", "false");
  }

  function bindScrollLinks(scope = document) {
    scope.querySelectorAll('a[href^="#"]').forEach(link => {
      if (link.dataset.boundScroll === "1") return;
      link.dataset.boundScroll = "1";
      link.addEventListener("click", (event) => {
        const hash = link.getAttribute("href");
        if (!hash || hash === "#") return;
        const target = document.querySelector(hash);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({behavior:"smooth",block:"start"});
        history.replaceState(null, "", hash);
        if (window.innerWidth <= 900) closeMobileMenu();
      });
    });
  }

  function setupDragScroll(node) {
    if (!node || node.dataset.dragReady === "1") return;
    node.dataset.dragReady = "1";
    let down = false, startX = 0, startLeft = 0;
    node.addEventListener("pointerdown", e => {
      if (e.pointerType === "touch") return;
      down = true;
      node.classList.add("dragging");
      startX = e.clientX;
      startLeft = node.scrollLeft;
      node.setPointerCapture?.(e.pointerId);
    });
    node.addEventListener("pointermove", e => {
      if (down) node.scrollLeft = startLeft - (e.clientX - startX);
    });
    const end = () => { down = false; node.classList.remove("dragging"); };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    node.addEventListener("pointerleave", end);
  }

  function setupActiveNavigation() {
    const links = [...document.querySelectorAll('.side-nav a[href^="#"]')];
    const targets = links.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === `#${visible.target.id}`));
    }, {rootMargin:"-18% 0px -68% 0px",threshold:[0,.2,.6]});
    targets.forEach(t => observer.observe(t));
  }

  async function loadSite() {
    try {
      const [catsRes, productsRes, settingsRes] = await Promise.all([
        db.from("categories").select("*").eq("active", true).order("sort_order").order("name"),
        db.from("products").select("*").eq("active", true).order("sort_order").order("name"),
        db.from("site_settings").select("*").eq("id", 1).maybeSingle()
      ]);
      if (catsRes.error) throw catsRes.error;
      if (productsRes.error) throw productsRes.error;

      const cats = catsRes.data || [], products = productsRes.data || [], settings = settingsRes.data || {};
      if (settings.tagline) el("heroTitle").textContent = settings.tagline;
      if (settings.shipping_title) el("shippingTitle").textContent = settings.shipping_title;
      if (settings.shipping_text) el("shippingText").textContent = settings.shipping_text;
      if (settings.about_title) el("aboutTitle").textContent = settings.about_title;
      if (settings.about_text) el("aboutText").textContent = settings.about_text;

      const video = el("heroVideo"), fallback = el("heroFallback");
      if (settings.hero_video_url) {
        video.src = settings.hero_video_url;
        video.style.display = "block";
        fallback.style.display = "none";
        video.addEventListener("error", () => { video.style.display="none"; fallback.style.display="grid"; }, {once:true});
      }

      const waLink = makeWhatsAppLink(settings.whatsapp, "Hola Mi Primavera, quisiera hacer una consulta.");
      ["whatsappFloat","heroWhatsapp","shippingWhatsapp"].forEach(id => {
        const node = el(id);
        if (waLink) { node.href = waLink; node.hidden = false; }
      });

      const featured = products.filter(p => p.featured);
      el("featured").innerHTML = featured.length ? featured.map(plantCard).join("") : `<div class="empty-state">Todavía no hay plantas destacadas. Podés marcarlas desde el panel administrador.</div>`;

      el("categoryNav").innerHTML = `<a class="category-link" href="#catalogo">Ver todas</a>${cats.map(c => {
        const plants = products.filter(p => p.category_id === c.id);
        return `<a class="category-link" href="#cat-${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>${plants.map(p => `<a class="plant-link" href="#planta-${escapeHtml(p.slug)}">↳ ${escapeHtml(p.name)}</a>`).join("")}`;
      }).join("")}`;

      el("categories").innerHTML = cats.length ? cats.map(c => {
        const plants = products.filter(p => p.category_id === c.id);
        return `<section class="category-section" id="cat-${escapeHtml(c.slug)}"><div class="category-header"><h2>${escapeHtml(c.name)}</h2><p class="category-description">${escapeHtml(c.description || "")}</p></div><div class="plant-grid">${plants.length ? plants.map(plantCard).join("") : `<div class="empty-state">Próximamente vamos a sumar plantas a esta categoría.</div>`}</div></section>`;
      }).join("") : `<div class="empty-state">El catálogo está listo para empezar a cargar plantas desde el panel administrador.</div>`;

      bindScrollLinks(el("sidebar"));
      setupActiveNavigation();
      setupDragScroll(el("featured"));
    } catch (err) {
      console.error(err);
      el("categories").innerHTML = `<div class="empty-state">No pudimos cargar el catálogo en este momento.</div>`;
      showToast("No se pudo conectar con el catálogo.");
    }
  }

  const mobileBtn = el("mobileMenuBtn");
  mobileBtn.addEventListener("click", () => {
    const open = el("sidebar").classList.toggle("open");
    el("menuBackdrop").classList.toggle("show", open);
    mobileBtn.setAttribute("aria-expanded", String(open));
  });
  el("menuBackdrop").addEventListener("click", closeMobileMenu);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeMobileMenu(); });

  bindScrollLinks(document);
  setupDragScroll(el("featured"));
  loadSite();
})();
