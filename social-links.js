(() => {
  try {
    const cfg=window.VIVERO_CONFIG;
    const footer=document.querySelector(".footer");
    if(!cfg||!window.supabase||!footer)return;

    const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
    const safeUrl=value=>{
      try{
        const u=new URL(String(value||"").trim());
        return /^https?:$/.test(u.protocol)?u.href:"";
      }catch{return ""}
    };

    const instagramSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>';
    const facebookSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4.3c-.52-.07-2.3-.23-4.42-.23C8.4 4.07 7 6.56 7 9.7V13H4v4h3v7h4v-7h3.35l.65-4H11V10.1C11 8.94 11.32 8 14 8Z" fill="currentColor"/></svg>';

    db.from("site_settings").select("instagram_url,facebook_url").eq("id",1).maybeSingle()
      .then(({data,error})=>{
        if(error||!data)return;
        const instagram=safeUrl(data.instagram_url);
        const facebook=safeUrl(data.facebook_url);
        if(!instagram&&!facebook)return;

        const wrap=document.createElement("div");
        wrap.className="footer-socials";
        wrap.setAttribute("aria-label","Redes sociales");

        if(instagram){
          const a=document.createElement("a");
          a.href=instagram;a.target="_blank";a.rel="noopener noreferrer";
          a.className="footer-social-link";
          a.setAttribute("aria-label","Instagram");
          a.title="Instagram";
          a.innerHTML=instagramSvg;
          wrap.appendChild(a);
        }
        if(facebook){
          const a=document.createElement("a");
          a.href=facebook;a.target="_blank";a.rel="noopener noreferrer";
          a.className="footer-social-link";
          a.setAttribute("aria-label","Facebook");
          a.title="Facebook";
          a.innerHTML=facebookSvg;
          wrap.appendChild(a);
        }
        if(wrap.children.length)footer.appendChild(wrap);
      })
      .catch(()=>{});
  } catch {}
})();