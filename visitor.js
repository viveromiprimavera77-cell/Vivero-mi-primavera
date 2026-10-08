(() => {
  try {
    const cfg=window.VIVERO_CONFIG;
    if(!cfg||!window.supabase)return;
    const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
    const path=location.pathname+location.search;
    db.functions.invoke("record-visit",{body:{path}}).catch(()=>{});
  } catch {}
})();