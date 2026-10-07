(() => {
  const cfg=window.VIVERO_CONFIG;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  let plants=[];

  function setMessage(text="",type=""){
    $("designMessage").textContent=text;
    $("designMessage").className=`design-message ${type}`.trim();
  }
  function selectedIds(){
    return [...document.querySelectorAll(".design-plant-check:checked")].map(x=>x.value);
  }
  function renderPlants(){
    const term=$("designPlantSearch").value.trim().toLowerCase();
    const list=plants.filter(p=>!term||p.name.toLowerCase().includes(term)||String(p.scientific_name||"").toLowerCase().includes(term));
    $("designPlantList").innerHTML=list.length?list.map(p=>{
      const image=p.image_url||p.integrated_image_url||"";
      return `<label class="design-plant-option">
        <input class="design-plant-check" type="checkbox" value="${p.id}">
        ${image?`<img src="${esc(image)}" alt="">`:`<span class="design-plant-noimage">🌿</span>`}
        <span><strong>${esc(p.name)}</strong><small>${esc(p.scientific_name||"")}</small></span>
      </label>`;
    }).join(""):'<p>No encontramos plantas con esa búsqueda.</p>';
  }
  async function loadPlants(){
    const {data,error}=await db.from("products")
      .select("id,name,scientific_name,image_url,integrated_image_url,availability,active")
      .eq("active",true).not("scientific_name","is",null).order("name");
    if(error){$("designPlantList").innerHTML="<p>No pudimos cargar las plantas.</p>";return}
    plants=data||[];renderPlants();
  }

  document.querySelectorAll('input[name="designMode"]').forEach(radio=>radio.addEventListener("change",()=>{
    document.querySelectorAll(".design-mode").forEach(x=>x.classList.toggle("active",x.querySelector("input").checked));
    $("designPlantPicker").hidden=document.querySelector('input[name="designMode"]:checked').value!=="selected";
  }));
  $("designPlantSearch").addEventListener("input",renderPlants);
  $("designPhoto").addEventListener("change",()=>{
    const file=$("designPhoto").files?.[0];
    if(!file){$("designPhotoPreview").hidden=true;return}
    if(file.size>8*1024*1024){setMessage("La foto supera 8 MB.","error");$("designPhoto").value="";return}
    $("designPhotoPreview").src=URL.createObjectURL(file);
    $("designPhotoPreview").hidden=false;
    setMessage("");
  });

  $("gardenDesignForm").addEventListener("submit",async e=>{
    e.preventDefault();setMessage("");
    const phone=$("designPhone").value.replace(/\D/g,"");
    const mode=document.querySelector('input[name="designMode"]:checked').value;
    const ids=selectedIds();
    if(phone.length!==10)return setMessage("Ingresá un WhatsApp de 10 dígitos, sin 0 ni 15.","error");
    if(mode==="selected"&&!ids.length)return setMessage("Elegí al menos una planta o seleccioná “Quiero una sugerencia”.","error");
    const photo=$("designPhoto").files?.[0];
    if(!photo)return setMessage("Subí una foto del espacio.","error");

    const body=new FormData();
    body.append("customer_name",$("designName").value.trim());
    body.append("phone",phone);
    body.append("photo",photo);
    body.append("width_m",$("designWidth").value);
    body.append("length_m",$("designLength").value);
    body.append("sunlight",$("designSunlight").value);
    body.append("goal",$("designGoal").value);
    body.append("design_mode",mode);
    body.append("budget",$("designBudget").value);
    body.append("notes",$("designNotes").value.trim());
    body.append("consent",$("designConsent").checked?"true":"false");
    body.append("selected_products",JSON.stringify(ids));
    body.append("website","");

    $("designSubmit").disabled=true;$("designSubmit").textContent="Enviando solicitud...";
    const {data,error}=await db.functions.invoke("submit-garden-design",{body});
    $("designSubmit").disabled=false;$("designSubmit").textContent="Enviar solicitud de diseño";
    if(error||!data?.ok)return setMessage(data?.error||"No pudimos enviar la solicitud. Probá nuevamente.","error");

    $("gardenDesignForm").hidden=true;
    $("designSuccessCode").textContent=data.request_code||"";
    $("designSuccess").hidden=false;
    window.scrollTo({top:0,behavior:"smooth"});
  });

  loadPlants();
})();