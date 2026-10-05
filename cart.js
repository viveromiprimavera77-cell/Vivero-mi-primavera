(() => {
  const KEY = "mi_primavera_cart_v2";
  const money = n => new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0
  }).format(Number(n || 0));

  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    render();
    window.dispatchEvent(new CustomEvent("viverocartchange", { detail: items }));
  }

  function makeId() {
    return (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  function get() { return load(); }

  function add(item) {
    const items = load();
    const match = items.find(x =>
      x.product_id === item.product_id &&
      x.variant_id === item.variant_id &&
      x.category_id === item.category_id &&
      Number(x.spacing_cm || 0) === Number(item.spacing_cm || 0) &&
      String(x.material_mode || "") === String(item.material_mode || "")
    );

    if (match) {
      match.quantity = Number(match.quantity || 0) + Number(item.quantity || 0);
      if (item.length_m) match.length_m = Number(match.length_m || 0) + Number(item.length_m || 0);
      if (item.area_m2) match.area_m2 = Number(match.area_m2 || 0) + Number(item.area_m2 || 0);
      if (item.material_volume_dm3) match.material_volume_dm3 = Number(match.material_volume_dm3 || 0) + Number(item.material_volume_dm3 || 0);
      if (item.coverage_area_m2) match.coverage_area_m2 = Number(match.coverage_area_m2 || 0) + Number(item.coverage_area_m2 || 0);
      if (item.hole_count) match.hole_count = Number(match.hole_count || 0) + Number(item.hole_count || 0);
    } else {
      items.push({ id: makeId(), ...item });
    }
    save(items);
    return items;
  }

  function updateQty(id, quantity) {
    const items = load();
    const item = items.find(x => x.id === id);
    if (item) item.quantity = Math.max(1, Math.floor(Number(quantity || 1)));
    save(items);
  }

  function update(id, patch) {
    const items = load();
    const item = items.find(x => x.id === id);
    if (item) Object.assign(item, patch || {});
    save(items);
  }

  function remove(id) {
    save(load().filter(x => x.id !== id));
  }

  function clear() { save([]); }

  function total() {
    return load().reduce((s, x) => s + Number(x.unit_price || 0) * Number(x.quantity || 0), 0);
  }

  function count() {
    return load().reduce((s, x) => s + Number(x.quantity || 0), 0);
  }

  function ensureUI() {
    if (document.getElementById("cartButton")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <button class="cart-button" id="cartButton" type="button" aria-label="Abrir carrito">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M3 5h3l2.4 13.2a3 3 0 0 0 3 2.5h10.7a3 3 0 0 0 2.9-2.2L28 9H8" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="26" r="1.8" fill="currentColor"/><circle cx="23" cy="26" r="1.8" fill="currentColor"/>
        </svg>
        <span class="cart-badge" id="cartBadge">0</span>
      </button>
      <div class="cart-backdrop" id="cartBackdrop"></div>
      <aside class="cart-drawer" id="cartDrawer" aria-label="Carrito">
        <div class="cart-drawer-head">
          <div><span class="cart-eyebrow">MI PRIMAVERA</span><h2>Tu pedido</h2></div>
          <button class="cart-close" id="cartClose" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="cart-drawer-items" id="cartDrawerItems"></div>
        <div class="cart-drawer-bottom">
          <div class="cart-drawer-total"><span>Total estimado</span><strong id="cartDrawerTotal">$0</strong></div>
          <button class="cart-primary" id="cartCheckout" type="button">Confirmar mi pedido</button>
          <button class="cart-secondary" id="cartContinue" type="button">Seguir comprando</button>
        </div>
      </aside>
    `);

    document.getElementById("cartButton").addEventListener("click", open);
    document.getElementById("cartClose").addEventListener("click", close);
    document.getElementById("cartBackdrop").addEventListener("click", close);
    document.getElementById("cartContinue").addEventListener("click", close);
    document.getElementById("cartCheckout").addEventListener("click", () => {
      if (!load().length) return;
      location.href = "calculadora.html?checkout=1";
    });
    document.getElementById("cartDrawerItems").addEventListener("click", e => {
      const id = e.target.dataset.removeCart;
      if (id) remove(id);
    });
  }

  function open() {
    ensureUI();
    document.getElementById("cartDrawer").classList.add("open");
    document.getElementById("cartBackdrop").classList.add("show");
    document.body.classList.add("cart-open");
  }

  function close() {
    document.getElementById("cartDrawer")?.classList.remove("open");
    document.getElementById("cartBackdrop")?.classList.remove("show");
    document.body.classList.remove("cart-open");
  }

  function render() {
    ensureUI();
    const items = load();
    const badge = document.getElementById("cartBadge");
    badge.textContent = count();
    badge.hidden = !items.length;

    const wrap = document.getElementById("cartDrawerItems");
    wrap.innerHTML = items.length ? items.map(x => `
      <div class="cart-mini-item">
        ${x.image_url ? `<img src="${x.image_url}" alt="">` : `<div class="cart-mini-placeholder">MP</div>`}
        <div class="cart-mini-copy">
          <strong>${x.product_name}</strong>
          <span>${x.variant_label}${x.material_mode&&x.liters ? ` · ${Number(x.liters)>=1000?(Number(x.liters)/1000).toLocaleString("es-AR")+" m³":Number(x.liters).toLocaleString("es-AR")+" dm³"}` : x.liters ? ` · ${x.liters} L` : ""}${x.height ? ` · ${x.area_mode?"Dim.":"Alt."} ${x.height}` : ""}</span>
          ${x.area_m2 ? `<span>${x.area_m2} m² a cubrir</span>` : ""}
          ${x.material_mode==="terrain" ? `<span>${x.coverage_area_m2} m² · ${x.fill_depth_cm} cm de profundidad</span>` : ""}
          ${x.material_mode==="holes" ? `<span>${x.hole_count} pozos · ${x.hole_width_cm}×${x.hole_width_cm}×${x.hole_depth_cm} cm</span>` : ""}
          <span>${x.quantity} × ${money(x.unit_price)}</span>
        </div>
        <button type="button" class="cart-mini-remove" data-remove-cart="${x.id}" aria-label="Quitar">×</button>
      </div>
    `).join("") : `<div class="cart-empty">Todavía no agregaste productos.</div>`;

    document.getElementById("cartDrawerTotal").textContent = money(total());
    document.getElementById("cartCheckout").disabled = !items.length;
  }

  window.ViveroCart = { get, add, updateQty, update, remove, clear, total, count, open, close, render };
  document.addEventListener("DOMContentLoaded", render);
})();
