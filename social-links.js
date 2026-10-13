(() => {
  try {
    const cfg=window.VIVERO_CONFIG;
    const footer=document.querySelector(".footer");
    const featuredSection=document.querySelector("#destacadas");
    if(!cfg||!window.supabase||(!footer&&!featuredSection))return;

    const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
    const safeUrl=value=>{
      try{
        const u=new URL(String(value||"").trim());
        return /^https?:$/.test(u.protocol)?u.href:"";
      }catch{return ""}
    };
    const instagramSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>';
    const facebookSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4.3c-.52-.07-2.3-.23-4.42-.23C8.4 4.07 7 6.56 7 9.7V13H4v4h3v7h4v-7h3.35l.65-4H11V10.1C11 8.94 11.32 8 14 8Z" fill="currentColor"/></svg>';
    const makeGroup=(instagram,facebook,isFeatured)=>{
      const wrap=document.createElement("nav");
      wrap.className=isFeatured?"featured-socials":"footer-socials";
      wrap.setAttribute("aria-label","Redes sociales del vivero");
      const append=(url,label,svg)=>{
        if(!url)return;
        const a=document.createElement("a");
        a.href=url;
        a.target="_blank";
        a.rel="noopener noreferrer";
        a.className=isFeatured?"featured-social-link":"footer-social-link";
        a.setAttribute("aria-label",label);
        a.title=label;
        a.innerHTML=svg;
        wrap.appendChild(a);
      };
      append(instagram,"Instagram",instagramSvg);
      append(facebook,"Facebook",facebookSvg);
      return wrap;
    };

    db.from("site_settings").select("instagram_url,facebook_url").eq("id",1).maybeSingle()
      .then(({data,error})=>{
        if(error||!data)return;
        const instagram=safeUrl(data.instagram_url);
        const facebook=safeUrl(data.facebook_url);
        if(!instagram&&!facebook)return;
        if(footer)footer.appendChild(makeGroup(instagram,facebook,false));
        // Dentro de la sección blanca "Plantas destacadas": permanecen
        // junto a su encabezado al desplazarse y nunca flotan sobre la pantalla.
        if(featuredSection&&!featuredSection.querySelector(".featured-socials")){
          featuredSection.appendChild(makeGroup(instagram,facebook,true));
        }
      })
      .catch(()=>{});
  } catch {}
})();
