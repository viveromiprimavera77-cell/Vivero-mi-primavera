(() => {
  const cfg = window.VIVERO_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  const $ = (id) => document.getElementById(id);
  const money = (value) => new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

  const slugify = (value = "") =>
    value.toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  let products = [];
  let categories = [];
  let settings = null;
  let currentUser = null;
  let pendingRemoveVideo = false;

  function toast(message) {
    $("adminToast").textContent = message;
    $("adminToast").classList.add("show");
    setTimeout(() => $("adminToast").classList.remove("show"), 2500);
  }

  function setMessage(id, message = "", type = "") {
    const node = $(id);
    node.textContent = message;
    node.className = `form-message ${type}`.trim();
  }

  async function isCurrentUserAdmin(userId) {
    const { data, error } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return false;
    }
    return !!data;
  }

  async function refreshAuth() {
    const { data: { session } } = await db.auth.getSession();
    currentUser = session?.user || null;

    if (!currentUser) {
      $("loginView").hidden = false;
      $("dashboard").hidden = true;
      $("logoutBtn").hidden = true;
      return;
    }

    const admin = await isCurrentUserAdmin(currentUser.id);
    if (!admin) {
      $("loginView").hidden = false;
      $("dashboard").hidden = true;
      $("logoutBtn").hidden = false;
      setMessage("loginMessage", "Este usuario existe, pero todavía no está autorizado como administrador.", "error");
      return;
    }

    $("loginView").hidden = true;
    $("dashboard").hidden = false;
    $("logoutBtn").hidden = false;
    await loadAll();
  }

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("loginMessage", "Ingresando...");
    const { error } = await db.auth.signInWithPassword({
      email: $("loginEmail").value.trim(),
      password: $("loginPassword").value
    });
    if (error) {
      setMessage("loginMessage", error.message, "error");
      return;
    }
    setMessage("loginMessage", "");
    await refreshAuth();
  });

  $("logoutBtn").addEventListener("click", async () => {
    await db.auth.signOut();
    location.reload();
  });

  async function loadAll() {
    const [p, c, s] = await Promise.all([
      db.from("products").select("*").order("sort_order").order("name"),
      db.from("categories").select("*").order("sort_order").order("name"),
      db.from("site_settings").select("*").eq("id", 1).maybeSingle()
    ]);

    if (p.error) throw p.error;
    if (c.error) throw c.error;

    products = p.data || [];
    categories = c.data || [];
    settings = s.data || {};

    renderCategorySelect();
    renderStats();
    renderProducts();
    renderCategories();
    fillSettings();
  }

  function renderCategorySelect() {
    $("productCategory").innerHTML = categories.length
      ? categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")
      : `<option value="">Primero creá una categoría</option>`;
  }

  function renderStats() {
    const active = products.filter(p => p.active);
    $("statProducts").textContent = active.length;
    $("statCategories").textContent = categories.filter(c => c.active).length;
    $("statConsult").textContent = active.filter(p => p.availability === "consult").length;

    const margins = active
      .filter(p => Number(p.price) > 0)
      .map(p => ((Number(p.price) - Number(p.cost)) / Number(p.price)) * 100);

    const avg = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
    $("statMargin").textContent = `${avg.toFixed(1)}%`;
  }

  function renderProducts() {
    const term = $("productSearch").value.trim().toLowerCase();
    const filtered = products.filter(p =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      (p.description || "").toLowerCase().includes(term)
    );

    $("productList").innerHTML = filtered.length
      ? filtered.map(p => {
          const category = categories.find(c => c.id === p.category_id);
          const status = p.availability === "in_stock" ? "🟢 En stock" : "Consultar disponibilidad";
          return `
            <div class="item-row">
              <div>
                <div class="item-title">${escapeHtml(p.name)} ${p.active ? "" : "· Oculta"}</div>
                <div class="item-meta">${escapeHtml(category?.name || "Sin categoría")} · ${money(p.price)} · ${status}${p.featured ? " · Destacada" : ""}</div>
              </div>
              <div class="item-actions">
                <button class="small-btn" data-edit-product="${p.id}">Editar</button>
                <button class="small-btn" data-toggle-product="${p.id}">${p.active ? "Ocultar" : "Mostrar"}</button>
                <button class="small-btn danger" data-delete-product="${p.id}">Eliminar</button>
              </div>
            </div>`;
        }).join("")
      : `<p class="form-message">No hay plantas para mostrar.</p>`;
  }

  function renderCategories() {
    $("categoryList").innerHTML = categories.length
      ? categories.map(c => {
          const count = products.filter(p => p.category_id === c.id).length;
          return `
            <div class="item-row">
              <div>
                <div class="item-title">${escapeHtml(c.name)} ${c.active ? "" : "· Oculta"}</div>
                <div class="item-meta">${count} planta${count === 1 ? "" : "s"} · orden ${c.sort_order}</div>
              </div>
              <div class="item-actions">
                <button class="small-btn" data-edit-category="${c.id}">Editar</button>
                <button class="small-btn danger" data-delete-category="${c.id}">Eliminar</button>
              </div>
            </div>`;
        }).join("")
      : `<p class="form-message">Todavía no hay categorías.</p>`;
  }

  function resetProductForm() {
    $("productForm").reset();
    $("productId").value = "";
    $("productOrder").value = 0;
    $("productActive").checked = true;
    $("productFeatured").checked = false;
    $("productFormTitle").textContent = "Agregar planta";
    $("cancelProductEdit").hidden = true;
    setMessage("productMessage", "");
  }

  function resetCategoryForm() {
    $("categoryForm").reset();
    $("categoryId").value = "";
    $("categoryOrder").value = 0;
    $("categoryActive").checked = true;
    $("categoryFormTitle").textContent = "Agregar categoría";
    $("cancelCategoryEdit").hidden = true;
    setMessage("categoryMessage", "");
  }

  async function uploadProductImage(file, productSlug) {
    if (!file) return null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${productSlug}/${Date.now()}.${ext}`;

    const { error } = await db.storage.from("product-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });
    if (error) throw error;

    const { data } = db.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  }

  $("productForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!categories.length) {
      setMessage("productMessage", "Primero tenés que crear una categoría.", "error");
      return;
    }

    setMessage("productMessage", "Guardando...");
    const id = $("productId").value;
    const name = $("productName").value.trim();
    let slug = slugify(name);

    if (!slug) {
      setMessage("productMessage", "El nombre no genera un identificador válido.", "error");
      return;
    }

    const imageFile = $("productImage").files[0];
    let imageUrl = id ? products.find(p => p.id === id)?.image_url || null : null;

    try {
      if (imageFile) imageUrl = await uploadProductImage(imageFile, slug);

      const payload = {
        name,
        slug,
        category_id: $("productCategory").value,
        description: $("productDescription").value.trim(),
        price: Number($("productPrice").value || 0),
        cost: Number($("productCost").value || 0),
        availability: $("productAvailability").value,
        pot_size: $("productPot").value.trim() || null,
        height: $("productHeight").value.trim() || null,
        image_url: imageUrl,
        featured: $("productFeatured").checked,
        active: $("productActive").checked,
        sort_order: Number($("productOrder").value || 0),
        updated_at: new Date().toISOString()
      };

      const query = id
        ? db.from("products").update(payload).eq("id", id)
        : db.from("products").insert(payload);

      const { error } = await query;
      if (error) throw error;

      resetProductForm();
      await loadAll();
      toast("Planta guardada");
    } catch (err) {
      console.error(err);
      setMessage("productMessage", err.message || "No se pudo guardar.", "error");
    }
  });

  $("productList").addEventListener("click", async (event) => {
    const editId = event.target.dataset.editProduct;
    const toggleId = event.target.dataset.toggleProduct;
    const deleteId = event.target.dataset.deleteProduct;

    if (editId) {
      const p = products.find(x => x.id === editId);
      if (!p) return;
      $("productId").value = p.id;
      $("productName").value = p.name;
      $("productCategory").value = p.category_id;
      $("productPrice").value = p.price;
      $("productCost").value = p.cost;
      $("productAvailability").value = p.availability;
      $("productOrder").value = p.sort_order;
      $("productPot").value = p.pot_size || "";
      $("productHeight").value = p.height || "";
      $("productDescription").value = p.description || "";
      $("productFeatured").checked = p.featured;
      $("productActive").checked = p.active;
      $("productFormTitle").textContent = `Editar: ${p.name}`;
      $("cancelProductEdit").hidden = false;
      window.scrollTo({ top: 250, behavior: "smooth" });
    }

    if (toggleId) {
      const p = products.find(x => x.id === toggleId);
      if (!p) return;
      const { error } = await db.from("products").update({
        active: !p.active,
        updated_at: new Date().toISOString()
      }).eq("id", p.id);
      if (error) return toast(error.message);
      await loadAll();
    }

    if (deleteId) {
      const p = products.find(x => x.id === deleteId);
      if (!p) return;
      if (!confirm(`¿Eliminar "${p.name}"?`)) return;
      const { error } = await db.from("products").delete().eq("id", p.id);
      if (error) return toast(error.message);
      await loadAll();
      toast("Planta eliminada");
    }
  });

  $("newProductBtn").addEventListener("click", resetProductForm);
  $("cancelProductEdit").addEventListener("click", resetProductForm);
  $("productSearch").addEventListener("input", renderProducts);

  $("categoryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("categoryMessage", "Guardando...");

    const id = $("categoryId").value;
    const name = $("categoryName").value.trim();
    const payload = {
      name,
      slug: slugify(name),
      description: $("categoryDescription").value.trim(),
      sort_order: Number($("categoryOrder").value || 0),
      active: $("categoryActive").checked,
      updated_at: new Date().toISOString()
    };

    const query = id
      ? db.from("categories").update(payload).eq("id", id)
      : db.from("categories").insert(payload);

    const { error } = await query;
    if (error) {
      setMessage("categoryMessage", error.message, "error");
      return;
    }

    resetCategoryForm();
    await loadAll();
    toast("Categoría guardada");
  });

  $("categoryList").addEventListener("click", async (event) => {
    const editId = event.target.dataset.editCategory;
    const deleteId = event.target.dataset.deleteCategory;

    if (editId) {
      const c = categories.find(x => x.id === editId);
      if (!c) return;
      $("categoryId").value = c.id;
      $("categoryName").value = c.name;
      $("categoryDescription").value = c.description || "";
      $("categoryOrder").value = c.sort_order;
      $("categoryActive").checked = c.active;
      $("categoryFormTitle").textContent = `Editar: ${c.name}`;
      $("cancelCategoryEdit").hidden = false;
      window.scrollTo({ top: 250, behavior: "smooth" });
    }

    if (deleteId) {
      const c = categories.find(x => x.id === deleteId);
      if (!c) return;
      const used = products.some(p => p.category_id === c.id);
      if (used) {
        toast("No podés eliminar una categoría que todavía tiene plantas.");
        return;
      }
      if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return;
      const { error } = await db.from("categories").delete().eq("id", c.id);
      if (error) return toast(error.message);
      await loadAll();
      toast("Categoría eliminada");
    }
  });

  $("newCategoryBtn").addEventListener("click", resetCategoryForm);
  $("cancelCategoryEdit").addEventListener("click", resetCategoryForm);

  function fillSettings() {
    $("settingName").value = settings?.nursery_name || "Mi Primavera";
    $("settingTagline").value = settings?.tagline || "Naturaleza que transforma tu espacio";
    $("settingWhatsapp").value = settings?.whatsapp || "";
    $("settingShippingTitle").value = settings?.shipping_title || "Envíos";
    $("settingShippingText").value = settings?.shipping_text || "";
    $("settingInstagram").value = settings?.instagram_url || "";
    $("settingFacebook").value = settings?.facebook_url || "";
    $("settingAboutTitle").value = settings?.about_title || "Acerca de nosotros";
    $("settingAboutText").value = settings?.about_text || "";

    const hasVideo = !!settings?.hero_video_url;
    $("currentVideoWrap").hidden = !hasVideo;
    if (hasVideo) {
      $("currentVideoLink").href = settings.hero_video_url;
    }
    pendingRemoveVideo = false;
  }

  async function uploadHeroVideo(file) {
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `hero/${Date.now()}.${ext}`;
    const { error } = await db.storage.from("site-media").upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });
    if (error) throw error;
    const { data } = db.storage.from("site-media").getPublicUrl(path);
    return data.publicUrl;
  }

  $("removeVideoBtn").addEventListener("click", () => {
    pendingRemoveVideo = true;
    $("currentVideoWrap").hidden = true;
    $("heroVideoFile").value = "";
    toast("El video se quitará al guardar");
  });

  $("settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("settingsMessage", "Guardando...");

    try {
      let heroUrl = pendingRemoveVideo ? "" : (settings?.hero_video_url || "");
      const file = $("heroVideoFile").files[0];
      if (file) heroUrl = await uploadHeroVideo(file);

      const payload = {
        nursery_name: $("settingName").value.trim() || "Mi Primavera",
        tagline: $("settingTagline").value.trim() || "Naturaleza que transforma tu espacio",
        whatsapp: $("settingWhatsapp").value.trim(),
        hero_video_url: heroUrl,
        shipping_title: $("settingShippingTitle").value.trim() || "Envíos",
        shipping_text: $("settingShippingText").value.trim(),
        about_title: $("settingAboutTitle").value.trim() || "Acerca de nosotros",
        about_text: $("settingAboutText").value.trim(),
        instagram_url: $("settingInstagram").value.trim(),
        facebook_url: $("settingFacebook").value.trim(),
        updated_at: new Date().toISOString()
      };

      const { error } = await db.from("site_settings").update(payload).eq("id", 1);
      if (error) throw error;

      const { data } = await db.from("site_settings").select("*").eq("id", 1).single();
      settings = data;
      fillSettings();
      setMessage("settingsMessage", "Configuración guardada.", "success");
      toast("Sitio actualizado");
    } catch (err) {
      console.error(err);
      setMessage("settingsMessage", err.message || "No se pudo guardar.", "error");
    }
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.tab).classList.add("active");
    });
  });

  function updateCalculator() {
    const base =
      num("calcPlant") +
      num("calcInputs") +
      num("calcSupplierTransport") +
      num("calcDelivery") +
      num("calcOther");

    const sale = num("calcSale");
    const feeRate = num("calcFee") / 100;
    const targetMargin = num("calcTargetMargin") / 100;

    const commission = sale * feeRate;
    const profit = sale - base - commission;
    const margin = sale > 0 ? (profit / sale) * 100 : 0;
    const markup = base > 0 ? (profit / base) * 100 : 0;

    const denominator = 1 - feeRate - targetMargin;
    const suggested = denominator > 0 ? base / denominator : 0;

    $("calcBaseResult").textContent = money(base);
    $("calcFeeResult").textContent = money(commission);
    $("calcProfitResult").textContent = money(profit);
    $("calcMarginResult").textContent = `${margin.toFixed(1)}%`;
    $("calcMarkupResult").textContent = `${markup.toFixed(1)}%`;
    $("calcSuggestedResult").textContent = denominator > 0 ? money(suggested) : "Revisar %";
  }

  function num(id) {
    return Number($(id).value || 0);
  }

  document.querySelectorAll(".calc-input").forEach(input => {
    input.addEventListener("input", updateCalculator);
  });

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  db.auth.onAuthStateChange(() => setTimeout(refreshAuth, 0));
  updateCalculator();
  refreshAuth();
})();
