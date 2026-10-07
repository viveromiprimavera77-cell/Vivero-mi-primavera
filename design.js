(() => {
  const cfg = window.VIVERO_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const TOTAL_STEPS = 4;
  let currentStep = 0;
  let plants = [];

  const sunlightLabels = {
    unknown: "No estoy seguro/a",
    full_sun: "Mucho sol",
    partial_shade: "Sol y media sombra",
    shade: "Mayormente sombra"
  };
  const goalLabels = {
    general: "Renovar / mejorar el jardín",
    privacy: "Privacidad / cerco",
    ornamental: "Jardín ornamental",
    low_maintenance: "Bajo mantenimiento",
    border: "Borduras y canteros",
    tropical: "Aspecto tropical"
  };

  function setMessage(text="", type=""){
    $("designMessage").textContent = text;
    $("designMessage").className = ("design-message " + type).trim();
  }

  function selectedIds(){
    return [...document.querySelectorAll(".design-plant-check:checked")].map(x => x.value);
  }

  function selectedPlantNames(){
    const ids = new Set(selectedIds());
    return plants.filter(p => ids.has(String(p.id))).map(p => p.name);
  }

  function renderPlants(){
    const term = $("designPlantSearch").value.trim().toLowerCase();
    const selected = new Set(selectedIds());
    const list = plants.filter(p => !term || p.name.toLowerCase().includes(term) || String(p.scientific_name || "").toLowerCase().includes(term));
    $("designPlantList").innerHTML = list.length ? list.map(function(p){
      const image = p.image_url || p.integrated_image_url || "";
      const checked = selected.has(String(p.id)) ? " checked" : "";
      return '<label class="design-plant-option">' +
        '<input class="design-plant-check" type="checkbox" value="' + esc(p.id) + '"' + checked + '>' +
        (image ? '<img src="' + esc(image) + '" alt="">' : '<span class="design-plant-noimage">🌿</span>') +
        '<span><strong>' + esc(p.name) + '</strong><small>' + esc(p.scientific_name || "") + '</small></span>' +
      '</label>';
    }).join("") : '<p>No encontramos plantas con esa búsqueda.</p>';
  }

  async function loadPlants(){
    const {data,error} = await db.from("products")
      .select("id,name,scientific_name,image_url,integrated_image_url,availability,active")
      .eq("active",true).not("scientific_name","is",null).order("name");
    if(error){
      $("designPlantList").innerHTML = "<p>No pudimos cargar las plantas.</p>";
      return;
    }
    plants = data || [];
    renderPlants();
  }

  function updateProgress(){
    document.querySelectorAll(".design-wizard-step").forEach(function(el){
      el.hidden = Number(el.dataset.designStep) !== currentStep;
    });
    document.querySelectorAll(".design-progress-item").forEach(function(el){
      const step = Number(el.dataset.progressStep);
      el.classList.toggle("active", step === currentStep);
      el.classList.toggle("done", step < currentStep);
    });
    document.querySelectorAll(".design-progress-line").forEach(function(el, index){
      el.classList.toggle("done", index < currentStep);
    });
    $("designBackBtn").hidden = currentStep === 0;
    $("designNextBtn").hidden = currentStep === TOTAL_STEPS - 1;
    $("designSubmit").hidden = currentStep !== TOTAL_STEPS - 1;
    $("designStepCounter").textContent = "Paso " + (currentStep + 1) + " de " + TOTAL_STEPS;
    if(currentStep === TOTAL_STEPS - 1) renderSummary();
    setMessage("");
  }

  function showStep(step, scroll=true){
    currentStep = Math.max(0, Math.min(TOTAL_STEPS - 1, step));
    updateProgress();
    if(scroll) requestAnimationFrame(function(){
      $("gardenDesignForm").scrollIntoView({behavior:"smooth", block:"start"});
    });
  }

  function validateStep(step){
    setMessage("");
    if(step === 0){
      const photo = $("designPhoto").files?.[0];
      if(!photo){
        setMessage("Subí una foto del espacio para continuar.", "error");
        return false;
      }
      if(photo.size > 8 * 1024 * 1024){
        setMessage("La foto supera 8 MB.", "error");
        return false;
      }
    }

    if(step === 1){
      const mode = document.querySelector('input[name="designMode"]:checked').value;
      if(mode === "selected" && !selectedIds().length){
        setMessage("Elegí al menos una planta o seleccioná “Quiero una sugerencia”.", "error");
        return false;
      }
      const width = Number($("designWidth").value || 0);
      const length = Number($("designLength").value || 0);
      if($("designWidth").value && width <= 0){
        setMessage("Revisá el ancho aproximado.", "error");
        return false;
      }
      if($("designLength").value && length <= 0){
        setMessage("Revisá el largo aproximado.", "error");
        return false;
      }
    }

    if(step === 2){
      const name = $("designName").value.trim();
      const phone = $("designPhone").value.replace(/\D/g, "");
      if(!name){
        setMessage("Ingresá tu nombre para continuar.", "error");
        $("designName").focus();
        return false;
      }
      if(phone.length !== 10){
        setMessage("Ingresá un WhatsApp de 10 dígitos, sin 0 ni 15.", "error");
        $("designPhone").focus();
        return false;
      }
    }

    if(step === 3 && !$("designConsent").checked){
      setMessage("Necesitamos tu autorización para usar la foto y preparar la propuesta.", "error");
      return false;
    }
    return true;
  }

  function formatBudget(value){
    const amount = Number(value || 0);
    return amount > 0 ? amount.toLocaleString("es-AR", {style:"currency", currency:"ARS", maximumFractionDigits:0}) : "Sin presupuesto indicado";
  }

  function summaryRow(label, value){
    return '<div class="design-summary-row"><span>' + esc(label) + '</span><strong>' + esc(value || "No indicado") + '</strong></div>';
  }

  function renderSummary(){
    const mode = document.querySelector('input[name="designMode"]:checked').value;
    const names = selectedPlantNames();
    const width = $("designWidth").value;
    const length = $("designLength").value;
    const sizeText = width && length ? width + " × " + length + " m" : (width ? "Ancho " + width + " m" : (length ? "Largo " + length + " m" : "Sin medidas indicadas"));
    const photoSrc = $("designPhotoPreview").src || "";
    const notes = $("designNotes").value.trim();

    $("designSummary").innerHTML =
      '<div class="design-summary-photo">' +
        (photoSrc ? '<img src="' + esc(photoSrc) + '" alt="Foto del espacio">' : '') +
      '</div>' +
      '<div class="design-summary-content">' +
        '<section><h3>Tu espacio</h3>' +
          summaryRow("Medidas", sizeText) +
          summaryRow("Luz", sunlightLabels[$("designSunlight").value] || $("designSunlight").value) +
          summaryRow("Objetivo", goalLabels[$("designGoal").value] || $("designGoal").value) +
          summaryRow("Presupuesto", formatBudget($("designBudget").value)) +
        '</section>' +
        '<section><h3>Diseño</h3>' +
          summaryRow("Modalidad", mode === "selected" ? "Usar plantas elegidas" : "Quiero una sugerencia") +
          (mode === "selected" ? summaryRow("Plantas", names.join(", ") || "Sin plantas") : "") +
          (notes ? summaryRow("Comentarios", notes) : "") +
        '</section>' +
        '<section><h3>Datos personales</h3>' +
          summaryRow("Nombre", $("designName").value.trim()) +
          summaryRow("WhatsApp", "+54 9 " + $("designPhone").value.replace(/\D/g, "")) +
        '</section>' +
      '</div>';
  }

  document.querySelectorAll('input[name="designMode"]').forEach(function(radio){
    radio.addEventListener("change", function(){
      document.querySelectorAll(".design-mode").forEach(function(x){
        x.classList.toggle("active", x.querySelector("input").checked);
      });
      $("designPlantPicker").hidden = document.querySelector('input[name="designMode"]:checked').value !== "selected";
    });
  });

  $("designPlantSearch").addEventListener("input", renderPlants);

  $("designPhoto").addEventListener("change", function(){
    const file = $("designPhoto").files?.[0];
    if(!file){
      $("designPhotoPreview").hidden = true;
      $("designPhotoTitle").textContent = "Subí una foto del espacio";
      return;
    }
    if(file.size > 8 * 1024 * 1024){
      setMessage("La foto supera 8 MB.", "error");
      $("designPhoto").value = "";
      $("designPhotoPreview").hidden = true;
      return;
    }
    $("designPhotoPreview").src = URL.createObjectURL(file);
    $("designPhotoPreview").hidden = false;
    $("designPhotoTitle").textContent = file.name;
    setMessage("");
  });

  $("designNextBtn").addEventListener("click", function(){
    if(validateStep(currentStep)) showStep(currentStep + 1);
  });

  $("designBackBtn").addEventListener("click", function(){
    showStep(currentStep - 1);
  });

  $("gardenDesignForm").addEventListener("submit", async function(e){
    e.preventDefault();
    setMessage("");

    if(currentStep < TOTAL_STEPS - 1){
      if(validateStep(currentStep)) showStep(currentStep + 1);
      return;
    }
    if(!validateStep(3)) return;

    const phone = $("designPhone").value.replace(/\D/g, "");
    const mode = document.querySelector('input[name="designMode"]:checked').value;
    const ids = selectedIds();
    const photo = $("designPhoto").files?.[0];

    const body = new FormData();
    body.append("customer_name", $("designName").value.trim());
    body.append("phone", phone);
    body.append("photo", photo);
    body.append("width_m", $("designWidth").value);
    body.append("length_m", $("designLength").value);
    body.append("sunlight", $("designSunlight").value);
    body.append("goal", $("designGoal").value);
    body.append("design_mode", mode);
    body.append("budget", $("designBudget").value);
    body.append("notes", $("designNotes").value.trim());
    body.append("consent", $("designConsent").checked ? "true" : "false");
    body.append("selected_products", JSON.stringify(ids));
    body.append("website", "");

    $("designSubmit").disabled = true;
    $("designSubmit").textContent = "Enviando solicitud...";
    const {data,error} = await db.functions.invoke("submit-garden-design", {body});
    $("designSubmit").disabled = false;
    $("designSubmit").textContent = "Enviar solicitud de diseño";

    if(error || !data?.ok){
      return setMessage(data?.error || "No pudimos enviar la solicitud. Probá nuevamente.", "error");
    }

    $("gardenDesignForm").hidden = true;
    $("designSuccessCode").textContent = data.request_code || "";
    $("designSuccess").hidden = false;
    window.scrollTo({top:0, behavior:"smooth"});
  });

  updateProgress();
  loadPlants();
})();