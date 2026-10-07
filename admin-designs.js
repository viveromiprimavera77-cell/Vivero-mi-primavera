(() => {
  const cfg=window.VIVERO_CONFIG;
  if(!cfg||!window.supabase)return;
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
  const el=id=>document.getElementById(id);
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n||0));
  const statusText={pending:"Pendiente",in_design:"En diseño",ready:"Diseño listo",sent:"Enviado",converted:"Convertido",cancelled:"Cancelado"};
  const sunText={full_sun:"Mucho sol",partial_shade:"Sol y media sombra",shade:"Mayormente sombra",unknown:"No informado"};
  const goalText={general:"Renovar / mejorar",privacy:"Privacidad / cerco",ornamental:"Jardín ornamental",low_maintenance:"Bajo mantenimiento",border:"Borduras y canteros",tropical:"Aspecto tropical"};
  let requests=[],selected=[],items=[],products=[],variants=[],signed={};

  function phoneText(phone){
    const d=String(phone||"").replace(/\D/g,"");
    return d.startsWith("549")&&d.length===13?"+54 9 "+d.slice(3):d;
  }
  function total(id){
    return items.filter(x=>x.request_id===id).reduce((s,x)=>s+Number(x.quantity||0)*Number(x.unit_price||0),0);
  }
  async function sign(path){
    if(!path)return "";
    if(signed[path])return signed[path];
    const res=await db.storage.from("garden-designs").createSignedUrl(path,3600);
    if(res.error)return "";
    signed[path]=res.data?.signedUrl||"";
    return signed[path];
  }
  function pickedNames(id){
    const ids=selected.filter(x=>x.request_id===id).map(x=>x.product_id);
    return ids.map(pid=>products.find(p=>p.id===pid)?.name).filter(Boolean);
  }
  function variantOptions(){
    let html='<option value="">Ítem personalizado</option>';
    products.forEach(p=>{
      variants.filter(v=>v.product_id===p.id).forEach(v=>{
        html+='<option value="'+v.id+'">'+esc(p.name)+' — '+esc(v.label)+' — '+money(v.price)+'</option>';
      });
    });
    return html;
  }
  async function load(){
    const s=await db.auth.getSession();
    if(!s.data?.session)return;
    const all=await Promise.all([
      db.from("garden_design_requests").select("*").order("created_at",{ascending:false}),
      db.from("garden_design_selected_products").select("*"),
      db.from("garden_design_proposal_items").select("*").order("sort_order"),
      db.from("products").select("id,name,active").order("name"),
      db.from("product_variants").select("*").eq("active",true).order("sort_order")
    ]);
    if(all.some(r=>r.error))return;
    requests=all[0].data||[];selected=all[1].data||[];items=all[2].data||[];products=all[3].data||[];variants=all[4].data||[];
    if(el("statDesignPending"))el("statDesignPending").textContent=requests.filter(r=>["pending","in_design"].includes(r.status)).length;
    await render();
  }
  async function render(){
    const root=el("designRequestList"); if(!root)return;
    const filter=el("designStatusFilter")?.value||"";
    const list=requests.filter(r=>!filter||r.status===filter);
    const urls={};
    for(const r of list){
      if(r.photo_path)urls[r.photo_path]=await sign(r.photo_path);
      if(r.result_image_path)urls[r.result_image_path]=await sign(r.result_image_path);
    }
    let html="";
    for(const r of list){
      const picks=pickedNames(r.id);
      const rows=items.filter(x=>x.request_id===r.id);
      const original=urls[r.photo_path]||"";
      const result=r.result_image_path?(urls[r.result_image_path]||""):"";
      html+='<details class="design-admin-card" data-design-id="'+r.id+'">';
      html+='<summary class="design-admin-summary"><div><strong>'+esc(r.request_code)+'</strong><span>'+esc(r.customer_name)+' · '+new Date(r.created_at).toLocaleString("es-AR")+'</span></div>';
      html+='<div><span class="design-status '+esc(r.status)+'">'+esc(statusText[r.status]||r.status)+'</span><strong>'+money(total(r.id))+'</strong></div></summary>';
      html+='<div class="design-admin-body">';
      html+='<div class="design-admin-media"><div><span>Foto del cliente</span>';
      html+=original?'<img src="'+original+'" alt=""><a class="small-btn" href="'+original+'" target="_blank" download>Descargar foto</a>':'<p>No disponible</p>';
      html+='</div><div><span>Propuesta final</span>';
      html+=result?'<img src="'+result+'" alt=""><a class="small-btn" href="'+result+'" target="_blank" download>Descargar propuesta</a>':'<div class="design-result-empty">Todavía no cargaste la simulación.</div>';
      html+='<label class="small-btn design-upload-label">Subir imagen final<input class="design-result-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden></label></div></div>';
      html+='<div class="design-customer-grid">';
      html+='<div><span>Cliente</span><strong>'+esc(r.customer_name)+'</strong></div>';
      html+='<div><span>WhatsApp</span><strong>'+esc(phoneText(r.phone))+'</strong></div>';
      html+='<div><span>Medidas</span><strong>'+esc(r.width_m||"?")+' × '+esc(r.length_m||"?")+' m</strong></div>';
      html+='<div><span>Luz</span><strong>'+esc(sunText[r.sunlight]||r.sunlight)+'</strong></div>';
      html+='<div><span>Objetivo</span><strong>'+esc(goalText[r.goal]||r.goal)+'</strong></div>';
      html+='<div><span>Presupuesto cliente</span><strong>'+(r.budget?money(r.budget):"No indicó")+'</strong></div></div>';
      html+='<p><strong>Modo:</strong> '+(r.design_mode==="selected"?"El cliente eligió plantas":"Sugerencia de Mi Primavera")+'</p>';
      html+='<p><strong>Plantas elegidas:</strong> '+(picks.length?esc(picks.join(", ")):"—")+'</p>';
      if(r.notes)html+='<p><strong>Comentarios:</strong> '+esc(r.notes)+'</p>';
      html+='<div class="design-admin-actions"><button class="small-btn" data-copy-brief>Copiar info para ChatGPT</button>';
      html+='<select class="design-status-select">';
      Object.entries(statusText).forEach(pair=>{html+='<option value="'+pair[0]+'" '+(r.status===pair[0]?"selected":"")+'>'+pair[1]+'</option>';});
      html+='</select><button class="small-btn" data-save-status>Guardar estado</button></div>';
      html+='<div class="design-proposal-box"><h3>Lista de compra</h3><div class="design-proposal-items">';
      if(rows.length){
        rows.forEach(x=>{
          html+='<div class="design-proposal-row" data-proposal-item="'+x.id+'">';
          html+='<label>Ítem<input class="dpi-name" value="'+esc(x.item_name)+'"></label>';
          html+='<label>Cant.<input class="dpi-qty" type="number" min="1" value="'+x.quantity+'"></label>';
          html+='<label>Precio u.<input class="dpi-price" type="number" min="0" step="0.01" value="'+x.unit_price+'"></label>';
          html+='<label>Nota<input class="dpi-note" value="'+esc(x.notes||"")+'"></label>';
          html+='<button class="small-btn danger" data-remove-proposal>Quitar</button></div>';
        });
      }else html+='<p class="form-message">Todavía no cargaste productos.</p>';
      html+='</div><div class="design-add-product"><select class="design-add-variant">'+variantOptions()+'</select>';
      html+='<input class="design-add-custom" placeholder="Nombre personalizado" hidden><input class="design-add-qty" type="number" min="1" value="1">';
      html+='<button class="small-btn" data-add-proposal>Agregar</button></div>';
      html+='<label>Notas de la propuesta<textarea class="design-proposal-notes" rows="3">'+esc(r.proposal_notes||"")+'</textarea></label>';
      html+='<div class="design-budget-total"><span>Presupuesto</span><strong>'+money(total(r.id))+'</strong></div>';
      html+='<div class="design-admin-actions"><button class="small-btn" data-save-proposal>Guardar lista y presupuesto</button>';
      if(result)html+='<button class="status-btn confirm" data-send-whatsapp>Abrir WhatsApp con propuesta</button>';
      html+='<button class="small-btn" data-convert-order>Marcar convertido en pedido</button></div></div></div></details>';
    }
    root.innerHTML=html||'<p class="form-message">No hay solicitudes en este estado.</p>';
    root.querySelectorAll(".design-add-variant").forEach(sel=>sel.addEventListener("change",()=>{
      const card=sel.closest(".design-admin-card");card.querySelector(".design-add-custom").hidden=!!sel.value;
    }));
  }
  async function copyBrief(r){
    const picks=pickedNames(r.id);
    const txt=[
      "Solicitud "+r.request_code+" — Mi Primavera",
      "Cliente: "+r.customer_name,
      "Medidas: "+(r.width_m||"no indicó")+" × "+(r.length_m||"no indicó")+" m",
      "Luz: "+(sunText[r.sunlight]||r.sunlight),
      "Objetivo: "+(goalText[r.goal]||r.goal),
      "Presupuesto orientativo: "+(r.budget?money(r.budget):"no indicó"),
      "Modo: "+(r.design_mode==="selected"?"usar plantas elegidas":"hacer sugerencia"),
      "Plantas elegidas: "+(picks.join(", ")||"ninguna; sugerir del catálogo"),
      "Comentarios: "+(r.notes||"sin comentarios"),
      "Generá una simulación realista y una lista de compra con cantidades sugeridas."
    ].join("\\n");
    await navigator.clipboard.writeText(txt);
    alert("Información copiada. Descargá la foto y adjuntala en ChatGPT.");
  }
  async function uploadResult(r,file){
    if(!file)return;
    if(file.size>8*1024*1024)return alert("La imagen supera 8 MB.");
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path="results/"+r.id+"/"+Date.now()+"."+ext;
    const up=await db.storage.from("garden-designs").upload(path,file,{upsert:false,contentType:file.type});
    if(up.error)return alert(up.error.message);
    const res=await db.from("garden_design_requests").update({result_image_path:path,status:"ready",updated_at:new Date().toISOString()}).eq("id",r.id);
    if(res.error)return alert(res.error.message);
    signed={};await load();
  }
  async function saveProposal(card,r){
    for(const row of card.querySelectorAll(".design-proposal-row")){
      const payload={item_name:row.querySelector(".dpi-name").value.trim(),quantity:Number(row.querySelector(".dpi-qty").value||1),unit_price:Number(row.querySelector(".dpi-price").value||0),notes:row.querySelector(".dpi-note").value.trim(),updated_at:new Date().toISOString()};
      const res=await db.from("garden_design_proposal_items").update(payload).eq("id",row.dataset.proposalItem);
      if(res.error)throw res.error;
    }
    const sum=[...card.querySelectorAll(".design-proposal-row")].reduce((s,row)=>s+Number(row.querySelector(".dpi-qty").value||0)*Number(row.querySelector(".dpi-price").value||0),0);
    const res=await db.from("garden_design_requests").update({proposal_notes:card.querySelector(".design-proposal-notes").value.trim(),quoted_total:sum,updated_at:new Date().toISOString()}).eq("id",r.id);
    if(res.error)throw res.error;
  }
  async function addProposal(card,r){
    const sel=card.querySelector(".design-add-variant"),qty=Number(card.querySelector(".design-add-qty").value||1);
    const v=variants.find(x=>x.id===sel.value),p=v?products.find(x=>x.id===v.product_id):null;
    const name=p?.name||card.querySelector(".design-add-custom").value.trim();
    if(!name)return alert("Elegí un producto o escribí un nombre.");
    const res=await db.from("garden_design_proposal_items").insert({request_id:r.id,product_id:p?.id||null,variant_id:v?.id||null,item_name:name,variant_label:v?.label||null,quantity:qty,unit_price:Number(v?.price||0),sort_order:items.filter(x=>x.request_id===r.id).length});
    if(res.error)return alert(res.error.message);await load();
  }
  async function sendWhatsapp(card,r){
    await saveProposal(card,r);
    const current=[...card.querySelectorAll(".design-proposal-row")].map(row=>({name:row.querySelector(".dpi-name").value.trim(),qty:Number(row.querySelector(".dpi-qty").value||1),price:Number(row.querySelector(".dpi-price").value||0)}));
    const sum=current.reduce((s,x)=>s+x.qty*x.price,0);
    const lines=current.map(x=>"• "+x.name+" × "+x.qty+" — "+money(x.qty*x.price));
    let msg="¡Hola "+r.customer_name+"! 🌿 Tu sugerencia de jardín de Mi Primavera está lista.\\n\\nLista de compra sugerida:\\n"+lines.join("\\n")+"\\n\\nPresupuesto estimado: "+money(sum);
    if(r.proposal_notes)msg+="\\n\\n"+r.proposal_notes;
    msg+="\\n\\nSi querés avanzar con el pedido, respondeme por acá y coordinamos.";
    await db.from("garden_design_requests").update({status:"sent",sent_at:new Date().toISOString(),quoted_total:sum,updated_at:new Date().toISOString()}).eq("id",r.id);
    const phone=String(r.phone||"").replace(/\D/g,"");
    window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(msg),"_blank");
    await load();
  }

  el("designStatusFilter")?.addEventListener("change",render);
  el("designRequestList")?.addEventListener("change",async e=>{
    if(!e.target.classList.contains("design-result-file"))return;
    const card=e.target.closest(".design-admin-card"),r=requests.find(x=>x.id===card.dataset.designId);
    await uploadResult(r,e.target.files?.[0]);
  });
  el("designRequestList")?.addEventListener("click",async e=>{
    const card=e.target.closest(".design-admin-card");if(!card)return;
    const r=requests.find(x=>x.id===card.dataset.designId);if(!r)return;
    try{
      if(e.target.hasAttribute("data-copy-brief"))return await copyBrief(r);
      if(e.target.hasAttribute("data-save-status")){
        const status=card.querySelector(".design-status-select").value,patch={status,updated_at:new Date().toISOString()};
        if(status==="sent")patch.sent_at=new Date().toISOString();if(status==="converted")patch.converted_at=new Date().toISOString();
        const res=await db.from("garden_design_requests").update(patch).eq("id",r.id);if(res.error)throw res.error;return await load();
      }
      if(e.target.hasAttribute("data-remove-proposal")){
        const id=e.target.closest(".design-proposal-row").dataset.proposalItem;const res=await db.from("garden_design_proposal_items").delete().eq("id",id);if(res.error)throw res.error;return await load();
      }
      if(e.target.hasAttribute("data-add-proposal"))return await addProposal(card,r);
      if(e.target.hasAttribute("data-save-proposal")){await saveProposal(card,r);return await load();}
      if(e.target.hasAttribute("data-send-whatsapp"))return await sendWhatsapp(card,r);
      if(e.target.hasAttribute("data-convert-order")){
        const res=await db.from("garden_design_requests").update({status:"converted",converted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",r.id);if(res.error)throw res.error;return await load();
      }
    }catch(err){alert(err.message||"No se pudo completar la acción.");}
  });
  db.auth.onAuthStateChange((_e,session)=>{if(session)setTimeout(load,0);});
  load().catch(console.error);
})();