// === CONFIG & REFS ===
const CATALOG_URL = "data/catalog.json"; // generado por el bot
const GRID  = document.getElementById("grid");
const COUNT = document.getElementById("count");
const LAST  = document.getElementById("lastSync");

const Q     = document.getElementById("q");
const CAT   = document.getElementById("category");
const PMIN  = document.getElementById("pmin");
const PMAX  = document.getElementById("pmax");
const SORT  = document.getElementById("sort");
const CLEAR = document.getElementById("clear");

let ALL = [];
let VIEW = [];
let PAGE = 0;
const PAGE_SIZE = 12; // menos por bloque largo

// === UTILS ===
const peso = v => (v == null ? "Sin precio" :
  new Intl.NumberFormat("es-CO", {style:"currency", currency:"COP", maximumFractionDigits:0}).format(v));

function bySort(a,b){
  const mode = SORT ? SORT.value : "newest";
  if(mode === "price-asc")  return (a.price ?? 9e18) - (b.price ?? 9e18);
  if(mode === "price-desc") return (b.price ?? -1) - (a.price ?? -1);
  if(mode === "alpha")      return (a.title||"").localeCompare(b.title||"");
  const ta = new Date(a.created_at||0).getTime();
  const tb = new Date(b.created_at||0).getTime();
  return tb - ta; // más nuevos primero
}

function matches(p){
  const q = (Q?.value||"").trim().toLowerCase();
  const cat = CAT?.value;
  const pmin = PMIN?.value ? Number(PMIN.value) : null;
  const pmax = PMAX?.value ? Number(PMAX.value) : null;

  if(cat && p.category !== cat) return false;
  if(pmin != null && (p.price ?? 0) < pmin) return false;
  if(pmax != null && (p.price ?? 0) > pmax) return false;

  if(!q) return true;
  const hay = `${p.title||""} ${p.sku||""} ${p.description||""}`.toLowerCase();
  return hay.includes(q);
}

// === CARD (sin modal): todas las fotos + descripción al final ===
function card(p){
  const el = document.createElement("article");
  el.className = "card long"; // clase para estilos de bloque

  // Galería vertical
  const gallery = document.createElement("div");
  gallery.className = "gallery-vertical";
  const imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
  imgs.forEach(src=>{
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = src;
    img.alt = p.title || "Producto";
    img.className = "photo-big";
    gallery.appendChild(img);
  });

  // Cuerpo (meta + descripción)
  const body = document.createElement("div");
  body.className = "body";

  const h3 = document.createElement("h3");
  h3.textContent = p.title || "Producto";

  const meta = document.createElement("div");
  meta.className = "meta";
  const price = document.createElement("span");
  price.className = "price";
  price.textContent = peso(p.price);
  const sku = document.createElement("span");
  sku.className = "sku";
  sku.textContent = p.sku ? `SKU ${p.sku}` : "";
  const cat = document.createElement("div");
  cat.className = "cat";
  cat.textContent = `#${p.category || "General"}`;
  meta.append(price, sku);

  const desc = document.createElement("p");
  desc.className = "desc";
  desc.textContent = p.description || "";

  const actions = document.createElement("div");
  actions.className = "actions";
  const wa = document.createElement("a");
  wa.className = "btn primary";
  wa.target = "_blank";
  wa.rel = "noopener";
  const txt = `Hola, me interesa: ${p.title || "Producto"}${p.sku ? " (SKU "+p.sku+")" : ""}`;
  wa.href = "https://wa.me/573127112369?text=" + encodeURIComponent(txt);
  wa.textContent = "WhatsApp";
  actions.appendChild(wa);

  body.append(h3, meta, cat, desc, actions);
  el.append(gallery, body);
  return el;
}

// === RENDER & PAGING ===
function apply(){
  VIEW = ALL.filter(matches).sort(bySort);
  if (COUNT) COUNT.textContent = `${VIEW.length} ítems`;
  if (GRID) GRID.innerHTML = "";
  PAGE = 0;
  appendPage();
}

function appendPage(){
  if (!GRID) return;
  const start = PAGE * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, VIEW.length);
  for(let i=start; i<end; i++){
    GRID.appendChild( card(VIEW[i]) );
  }
  PAGE++;
}

const sentinel = document.getElementById("sentinel");
if (sentinel) {
  const io = new IntersectionObserver((entries)=>{
    if(entries.some(e=>e.isIntersecting)){
      if(PAGE * PAGE_SIZE < VIEW.length) appendPage();
    }
  });
  io.observe(sentinel);
}

// === EVENTS ===
[Q,CAT,PMIN,PMAX,SORT].forEach(el=>{ if (el) el.addEventListener("input", apply); });
if (CLEAR){
  CLEAR.addEventListener("click", ()=>{
    if (Q) Q.value = "";
    if (CAT) CAT.value = "";
    if (PMIN) PMIN.value = "";
    if (PMAX) PMAX.value = "";
    if (SORT) SORT.value = "newest";
    apply();
  });
}

// === BOOT ===
async function boot(){
  try{
    const url = `${CATALOG_URL}?t=${Date.now()}`;
    const res = await fetch(url, {cache:"no-store"});
    const data = await res.json();

    ALL = (data.products || []).map(p => ({
      ...p,
      title: p.title || "Producto",
      category: p.category || "General",
      images: Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []),
      image: p.image || (Array.isArray(p.images) && p.images[0]) || null
    }));

    const cats = Array.from(new Set(ALL.map(p=>p.category||"General"))).sort((a,b)=>a.localeCompare(b));
    if (CAT) CAT.innerHTML = `<option value="">Todas las categorías</option>` + cats.map(c=>`<option>${c}</option>`).join("");

    const newest = ALL.find(p=>p.created_at);
    if (newest && LAST) LAST.textContent = new Date(newest.created_at).toLocaleString("es-CO");

    apply();
  }catch(err){
    console.error("Error cargando catálogo:", err);
    if (GRID) GRID.innerHTML = `<p style="color:#f87171">No se pudo cargar el catálogo.</p>`;
  }
}
boot();

// === Toggle filtros en móvil (si existe) ===
const toggle = document.getElementById("filtersToggle");
const toolbar = document.getElementById("toolbar");
if (toggle && toolbar) {
  toggle.addEventListener("click", () => {
    const hidden = toolbar.hasAttribute("hidden");
    if (hidden) toolbar.removeAttribute("hidden");
    else toolbar.setAttribute("hidden", "");
    toggle.setAttribute("aria-expanded", String(hidden));
  });
}
