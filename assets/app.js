console.log("✅ app.js cargado correctamente");


// ===== CONFIG =====
const REFRESH_MS = 15000;
const CATALOG_URL = "./data/catalog.json";
const PLACEHOLDER = "./assets/placeholder.jpg";
const SLIDE_MS = 3500;
const SWIPE_THRESHOLD = 30;


// ===== ELEMENTOS =====
const GRID = document.getElementById('grid');
const STATS = document.getElementById('stats');
const PAG = document.getElementById('pagination');
const STATUS = document.getElementById('status');


const SEARCH = document.getElementById('searchInput');
const CATEGORY = document.getElementById('categorySelect');
const MAXPRICE = document.getElementById('maxPriceInput');
const SORT = document.getElementById('sortSelect');
const PERPAGE = document.getElementById('perPageSelect');
const CLEAR = document.getElementById('clearFilters');
const REFRESH = document.getElementById('refreshBtn');


// ===== ESTADO =====
const STATE = {
raw: [],
products: [],
filtered: [],
categories: new Set(),
page: 1,
perPage: 12,
jsonHash: null
};

// // ===== UTILIDAD: Asignar categoría automáticamente =====
// function assignCategory(p) {
//   const text = `${p.title} ${p.description || ''}`.toLowerCase();
//   if (text.includes('blusa')) return 'Blusa';
//   if (text.includes('camiseta') || text.includes('camisa')) return 'Camiseta';
//   if (text.includes('vestido')) return 'Vestido';
//   if (text.includes('pantalon') || text.includes('pantalone')) return 'Pantalone';
//   if (text.includes('jean')) return 'Jean';
//   if (text.includes('falda')) return 'Falda';
//   if (text.includes('short')) return 'Short';
//   if (text.includes('conjunto')) return 'Conjunto';
//   if (text.includes('pijama') || text.includes('dormir')) return 'Ropa de dormir / pijama';
//   if (text.includes('chaqueta') || text.includes('abrigo')) return 'Chaqueta / abrigo';
//   if (text.includes('set')) return 'Set';
//   return 'General';
// }


// ===== CARRUSEL GLOBAL (para tarjetas) =====
const CAROUSELS = new Set();   // carruseles en tarjetas (en sincronía)
let tickId = null;
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const c = entry.target._carousel;
    if (c) c.visible = entry.isIntersecting;
  });
}, { root: null, threshold: 0.4 });

function startGlobalTick() {
  if (tickId) return;
  tickId = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    CAROUSELS.forEach(c => { if (c.visible && !c.paused) c.next(); });
  }, SLIDE_MS);
}

function stopGlobalTick() {
  if (tickId) { clearInterval(tickId); tickId = null; }
}

// ===== UTILIDADES =====
function formatCOP(n) {
  if (n == null || isNaN(Number(n))) return '';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}
function hashString(str) {
  let h = 0, i, chr;
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    h = ((h << 5) - h) + chr;
    h |= 0;
  }
  return h;
}
function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Extrae precio real (≥ 10.000) desde texto, evitando refs cortas. */
function parsePriceFromText(text=''){
  const t = String(text);
  // $ / COP / "precio" + (5+ dígitos) o con separador de miles
  const rxSymbol = /(?:\$|cop\b|precio[:\s-]*)\s*([1-9][0-9]{4,}|[0-9]{1,3}(?:[.,][0-9]{3})+)/gi;
  let m;
  while ((m = rxSymbol.exec(t)) !== null){
    const num = Number(m[1].replace(/[^\d]/g,''));
    if(num >= 10000) return num;
  }
  // 84.000 / 129,900
  const rxThousands = /([1-9][0-9]{0,2}(?:[.,][0-9]{3})+)/g;
  let k;
  while ((k = rxThousands.exec(t)) !== null){
    const num = Number(k[1].replace(/[^\d]/g,''));
    if(num >= 10000) return num;
  }
  // "84 mil"
  const rxMil = /([1-9][0-9]{1,3})\s*mil\b/gi;
  let z;
  while ((z = rxMil.exec(t)) !== null){
    const num = Number(z[1]) * 1000;
    if(num >= 10000) return num;
  }
  return null;
}
/** Precio inteligente (usa JSON si ≥10.000; si no, lo infiere del texto). */
function smartPrice(p){
  const raw = p.price!=null ? Number(String(p.price).replace(/[^\d]/g,'')) : null;
  if (raw != null && raw >= 10000) return raw;
  const fromText = parsePriceFromText(p.description || '');
  return fromText != null ? fromText : null;
}

// ===== ASIGNAR CATEGORÍA AUTOMÁTICAMENTE =====
function assignCategory(data){
const arr = Array.isArray(data) ? data : (data.products || []);
return arr.map(p=>{
const imgs = (p.images && p.images.length ? p.images : (p.image ? [p.image] : [])) || [];
const created = p.created_at || p.date || '1970-01-01T00:00:00Z';
const rawNum = p.price!=null ? Number(String(p.price).replace(/[^\d]/g,'')) : null;


const text = `${p.title} ${p.description || ''}`.toLowerCase();
let category = 'General';
if (text.includes('blusa')) category = 'Blusa';
else if (text.includes('camiseta') || text.includes('camisa')) category = 'Camiseta';
else if (text.includes('vestido')) category = 'Vestido';
else if (text.includes('pantalon') || text.includes('pantalone')) category = 'Pantalone';
else if (text.includes('jean')) category = 'Jean';
else if (text.includes('falda')) category = 'Falda';
else if (text.includes('short')) category = 'Short';
else if (text.includes('conjunto')) category = 'Conjunto';
else if (text.includes('pijama') || text.includes('dormir')) category = 'Ropa de dormir / pijama';
else if (text.includes('chaqueta') || text.includes('abrigo')) category = 'Chaqueta / abrigo';
else if (text.includes('set')) category = 'Set';


return {
id: p.id || (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)),
title: p.title || p.caption || 'Producto',
price: rawNum,
sku: p.sku || p.code || null,
category: (() => {
  const text = `${p.title} ${p.description || ''}`.toLowerCase();
  if (text.includes('blusa')) return 'Blusa';
  if (text.includes('camiseta') || text.includes('camisa')) return 'Camiseta';
  if (text.includes('vestido')) return 'Vestido';
  if (text.includes('pantalon') || text.includes('pantalone')) return 'Pantalone';
  if (text.includes('jean')) return 'Jean';
  if (text.includes('falda')) return 'Falda';
  if (text.includes('short')) return 'Short';
  if (text.includes('conjunto')) return 'Conjunto';
  if (text.includes('pijama') || text.includes('dormir')) return 'Ropa de dormir / pijama';
  if (text.includes('chaqueta') || text.includes('abrigo')) return 'Chaqueta / abrigo';
  if (text.includes('set')) return 'Set';
  return 'General';
})(),

images: imgs.length ? imgs : [PLACEHOLDER],
image: imgs[0] || PLACEHOLDER,
description: p.description || p.text || '',
created_at: created
};
});
}

// ===== CARRUSEL (tarjeta o modal) =====
class Carousel {
  constructor(root, images, {register=true, showDots=true, allowSwipe=true}={}){
    this.root = root;
    this.images = images || [];
    this.index = 0;
    this.paused = false;
    this.visible = true;

    this.root.innerHTML = '';
    this.root.style.position = 'relative';
    this.root.style.overflow = 'hidden';

    const track = document.createElement('div');
    track.style.cssText = `
      position:absolute; inset:0;
      display:flex; width:100%; height:100%;
      transition: transform 400ms ease;
      will-change: transform;
    `;
    this.track = track;

    this.images.forEach(src=>{
      const slide = document.createElement('div');
      slide.style.cssText = 'flex:0 0 100%; width:100%; height:100%; position:relative; background:#0f1015;';
      const img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.alt = 'Imagen de producto';
      img.style.cssText = 'width:100%; height:100%; object-fit:cover; object-position:center;';
      img.onerror = ()=>{ img.src = PLACEHOLDER; };
      slide.appendChild(img);
      track.appendChild(slide);
    });

    this.root.appendChild(track);

    // Dots
    this.dotsWrap = null;
    if(showDots && this.images.length > 1){
      const dots = document.createElement('div');
      dots.style.cssText = `
        position:absolute; left:50%; bottom:8px; transform:translateX(-50%);
        display:flex; gap:6px; z-index:2;
      `;
      this.images.forEach((_,i)=>{
        const d = document.createElement('button');
        d.type = 'button';
        d.ariaLabel = `Ir a imagen ${i+1}`;
        d.style.cssText = `
          width:8px; height:8px; border-radius:999px; border:none;
          background: rgba(229,231,235,.45); cursor:pointer; padding:0;
        `;
        d.addEventListener('click', ()=> this.show(i));
        dots.appendChild(d);
      });
      this.dotsWrap = dots;
      this.root.appendChild(dots);
    }

    // Swipe / hover
    if(allowSwipe) this._bindSwipe();
    this.root.addEventListener('mouseenter', ()=> this.paused = true);
    this.root.addEventListener('mouseleave', ()=> this.paused = false);

    // IO para visibilidad (solo para tarjetas registradas)
    if(register){
      this.root._carousel = this;
      try{ io.observe(this.root); }catch{}
      CAROUSELS.add(this);
      startGlobalTick();
    }

    this.show(0, false);
  }

  _bindSwipe(){
    let startX = null;
    const onDown = (e)=>{ const p = e.touches ? e.touches[0] : e; startX = p.clientX; };
    const onUp = (e)=>{
      if(startX==null) return;
      const p = e.changedTouches ? e.changedTouches[0] : e;
      const dx = p.clientX - startX;
      if(Math.abs(dx) > SWIPE_THRESHOLD){ dx < 0 ? this.next() : this.prev(); }
      startX = null;
    };
    this.root.addEventListener('pointerdown', onDown);
    this.root.addEventListener('pointerup', onUp);
    this.root.addEventListener('touchstart', onDown, {passive:true});
    this.root.addEventListener('touchend', onUp);
  }

  show(i, animate=true){
    if(!this.images.length) return;
    this.index = (i + this.images.length) % this.images.length;
    if(!animate) this.track.style.transition = 'none';
    this.track.style.transform = `translateX(-${this.index*100}%)`;
    if(!animate){ void this.track.offsetWidth; this.track.style.transition = 'transform 400ms ease'; }
    if(this.dotsWrap){
      Array.from(this.dotsWrap.children).forEach((d,idx)=>{
        d.style.opacity = idx===this.index ? '1' : '.55';
        d.style.transform = idx===this.index ? 'scale(1.05)' : 'scale(1.0)';
        d.style.background = idx===this.index ? 'white' : 'rgba(229,231,235,.45)';
      });
    }
  }
  next(){ this.show(this.index+1); }
  prev(){ this.show(this.index-1); }
  destroy(){
    try{ io.unobserve(this.root); }catch{}
    CAROUSELS.delete(this);
  }
}

// ===== RENDER =====
function renderCategories(){
  CATEGORY.innerHTML = '<option value="">Todas las categorías</option>';
  const sorted = Array.from(STATE.categories).sort();
  for(const c of sorted){
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    CATEGORY.appendChild(opt);
  }
  console.log("Categorías en el filtro:", Array.from(STATE.categories));

}

function buildCard(p) {
  const price = smartPrice(p);
  const card = document.createElement('article');
  card.className = 'card';
  card.setAttribute('data-id', p.id); // ← importante

  card.innerHTML = `
    <div class="media"></div>
    <div class="body">
      <h4 class="title">${p.title}</h4>
      <div class="meta">
        <span class="price">${price != null ? formatCOP(price) : ''}</span>
        <span class="chip">${p.category}</span>
      </div>
      <p class="desc" style="
          color:#9ca3af;font-size:14px;margin:6px 0 8px;
          display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
        ">
        ${p.description || ''}
      </p>
      <div class="actions">
        <button type="button" class="page-btn open-modal" data-id="${p.id}">Ver detalle</button>
       <a class="whatsapp"
   target="_blank" rel="noopener"
   data-title="${p.title}"
   data-price="${price != null ? formatCOP(price) : ''}"
   data-img="${(p.images && p.images[0]) || p.image || PLACEHOLDER}"
   href="https://wa.me/573127112369?text=${encodeURIComponent(`Hola, quiero este producto: ${p.title}${price ? ` | ${formatCOP(price)}` : ''}`)}">
   WhatsApp
</a>
      </div>
    </div>
  `;

  // Carrusel en tarjeta
  const media = card.querySelector('.media');
  new Carousel(media, p.images, { register: true, showDots: true, allowSwipe: true });

 // Abre el modal al hacer clic en cualquier parte de la tarjeta,
// excepto si el clic es en el enlace de WhatsApp (debe ir al chat).
card.style.cursor = 'pointer';
card.addEventListener('click', (e) => {
  const isWhatsApp = e.target.closest('a.whatsapp');
  if (isWhatsApp) return;

  const id = card.getAttribute('data-id');
  const pFound = STATE.filtered.find(prod => prod.id === id) || STATE.products.find(prod => prod.id === id);
  if (pFound) openModal(pFound);
});

// Accesibilidad: abrir con Enter/Espacio cuando la tarjeta tenga foco
card.setAttribute('tabindex', '0');
card.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const id = card.getAttribute('data-id');
    const pFound = STATE.filtered.find(prod => prod.id === id) || STATE.products.find(prod => prod.id === id);
    if (pFound) openModal(pFound);
  }
});

  return card;
}



function renderGrid(){
  GRID.innerHTML = '';
  if (!STATE.filtered.length){
    const empty = document.createElement('div');
    empty.textContent = 'Sin resultados. Ajusta tu búsqueda o filtros.';
    empty.style.cssText = 'opacity:.8;padding:20px;border:1px dashed var(--border);border-radius:12px;text-align:center';
    GRID.appendChild(empty);
    PAG.innerHTML = '';
    STATS.textContent = '0 productos';
    return;
  }
  const start = (STATE.page - 1) * STATE.perPage;
  const slice = STATE.filtered.slice(start, start + STATE.perPage);
  const frag = document.createDocumentFragment();
  slice.forEach(p => frag.appendChild(buildCard(p)));
  GRID.appendChild(frag);
}

function renderStats(){
  const totalPages = Math.max(1, Math.ceil(STATE.filtered.length/STATE.perPage));
  STATS.textContent = `${STATE.filtered.length} productos • página ${STATE.page}/${totalPages}`;
}

function renderPagination(){
  PAG.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(STATE.filtered.length / STATE.perPage));
  const mk = (label, page, disabled=false)=>{
    const b = document.createElement('button');
    b.className='page-btn'; b.textContent=label; b.disabled=disabled;
    b.addEventListener('click', ()=>{
      STATE.page = page;
      renderGrid(); renderStats(); renderPagination();
      window.scrollTo({top:0, behavior:'smooth'});
    });
    return b;
  };
  PAG.appendChild(mk('«', 1, STATE.page===1));
  PAG.appendChild(mk('‹', Math.max(1, STATE.page-1), STATE.page===1));
  const span = document.createElement('span'); span.textContent = `${STATE.page} / ${totalPages}`; span.style.padding='8px 12px';
  PAG.appendChild(span);
  PAG.appendChild(mk('›', Math.min(totalPages, STATE.page+1), STATE.page===totalPages));
  PAG.appendChild(mk('»', totalPages, STATE.page===totalPages));
}

// ===== MODAL =====
function closeModal(modal){
  try {
    if (!modal) return;

    // Quitar clase del body
    document.body.classList.remove('modal-open');

    // Remover evento popstate si estaba registrado
    if (modal._onPopstate) {
      window.removeEventListener('popstate', modal._onPopstate);
      modal._onPopstate = null;
    }

    // Corregir historial: si se empujó estado y no viene de atrás, retrocede
    if (modal._pushedHistory && !modal._fromPopstate) {
      modal._ignorePop = true; // ← evita rebote del back
      history.back();
    }

    modal._pushedHistory = false;
    modal._fromPopstate = false;

    // Cerrar visualmente el modal
    if (typeof modal.close === 'function') {
      modal.close();
    } else {
      modal.removeAttribute('open');
    }

    // Restaurar scroll (opcional si el modal cambia overflow)
    document.body.style.overflow = '';

  } catch (err) {
    console.error('Error al cerrar modal:', err);
  }
}


function openModal(p){
  const MODAL = document.getElementById('productModal');
  if(!MODAL){ console.error('Modal no encontrado (#productModal)'); return; }

  // Construcción del layout tipo ficha
  MODAL.innerHTML = `
    <div class="modal-body">
      <div class="ml-modal">
        <div class="ml-thumbs" id="mlThumbs"></div>
        <div class="ml-viewer"><img id="mlMain" alt="Imagen de producto"></div>
        <aside class="ml-info">
          <h2 class="ml-title" id="mlTitle"></h2>
          <div class="ml-price" id="mlPrice"></div>
          <div class="ml-meta">
            <span class="ml-chip" id="mlCategory"></span>
          </div>
          <div class="ml-actions">
            <a class="btn whatsapp" id="mlWA" target="_blank" rel="noopener">WhatsApp</a>
            <button class="btn" id="modalClose">Cerrar</button>
          </div>
          <p class="ml-desc" id="mlDesc"></p>
        </aside>
      </div>
    </div>
  `;

  const imgs = Array.isArray(p.images) && p.images.length ? p.images : [p.image || PLACEHOLDER];
  const price = smartPrice(p);
  const thumbs = MODAL.querySelector('#mlThumbs');
const main   = MODAL.querySelector('#mlMain');
thumbs.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  e.stopPropagation();                 // evita que burbujee a otros listeners
  const idx = [...thumbs.children].indexOf(btn);
  if (idx >= 0) {
    main.src = imgs[idx];              // muestra en grande
    [...thumbs.children].forEach(b => b.setAttribute('aria-current','false'));
    btn.setAttribute('aria-current','true');
  }
});


  // Título / precio / categoría / desc
  MODAL.querySelector('#mlTitle').textContent = p.title || 'Producto';
  MODAL.querySelector('#mlPrice').textContent = price != null ? formatCOP(price) : '';
  MODAL.querySelector('#mlCategory').textContent = p.category || 'General';
  MODAL.querySelector('#mlDesc').textContent = p.description || '';
  const wa = MODAL.querySelector('#mlWA');
  // Rellena dataset para compartir con imagen
wa.dataset.title = p.title || 'Producto';
wa.dataset.price = price != null ? formatCOP(price) : '';
wa.dataset.img   = (imgs && imgs[0]) || PLACEHOLDER;

// Si cambias de miniatura, actualiza la imagen a compartir
thumbs.addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const idx = [...thumbs.children].indexOf(btn);
  if (idx >= 0) {
    const src = imgs[idx];
    wa.dataset.img = src;
  }
});

  wa.href = `https://wa.me/573127112369?text=${encodeURIComponent(`Hola, quiero este producto: ${p.title}${price?` | ${formatCOP(price)}`:''}`)}`;

  // Imágenes
  main.src = imgs[0] || PLACEHOLDER;
  main.onerror = ()=>{ main.src = PLACEHOLDER; };
  thumbs.innerHTML = imgs.map((src,i)=>`
    <button type="button" aria-current="${i===0}">
      <img src="${src}" alt="miniatura ${i+1}" onerror="this.src='${PLACEHOLDER}'">
    </button>
  `).join('');

  thumbs.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const idx = [...thumbs.children].indexOf(btn);
    if (idx>=0){ main.src = imgs[idx]; }
    [...thumbs.children].forEach(b=>b.setAttribute('aria-current','false'));
    btn.setAttribute('aria-current','true');
  });




    // Bloquea el scroll del body mientras el modal está abierto
  document.body.classList.add('modal-open');

 // ———  CIERRE: solo con X o botón ATRÁS  ———

// 1) elimina handlers antiguos de “cerrar por cualquier clic”
if (MODAL._anyClickHandler) {
  MODAL.removeEventListener('click', MODAL._anyClickHandler, { capture: true });
  MODAL._anyClickHandler = null;
}

// 2) Cerrar con la X
const btnClose = MODAL.querySelector('#modalClose');
btnClose?.addEventListener('click', () => closeModal(MODAL));

// 3) Soporte botón ATRÁS (Android/iOS)
//   - empuja un estado al historial al abrir
//   - al volver atrás, cerramos el modal
history.pushState({ modal: true }, '');
MODAL._pushedHistory = true;
MODAL._fromPopstate = false;
MODAL._onPopstate = () => {
  if (MODAL._ignorePop) {
    MODAL._ignorePop = false; // ← ya ignoramos este
    return;
  }
  if (MODAL.open || MODAL.hasAttribute('open')) {
    MODAL._fromPopstate = true;
    closeModal(MODAL);
  }
};

window.addEventListener('popstate', MODAL._onPopstate);

// 4) (opcional) Escape también cierra
if (!MODAL._escBound) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (MODAL.open || MODAL.hasAttribute('open'))) {
      closeModal(MODAL);
    }
  });
  MODAL._escBound = true;
}

// 5) IMPORTANTE: NO cerrar por clic dentro del modal.
//    Si quieres cerrar al tocar el fondo del <dialog>, usa este patrón:
// MODAL.addEventListener('click', (e) => { if (e.target === MODAL) closeModal(MODAL); });


    // Abrir
  if(typeof MODAL.showModal === 'function') MODAL.showModal();
  else MODAL.setAttribute('open','');
}



// // Delegación de evento: abre modal
// GRID.addEventListener('click', (e)=>{
//   const btn = e.target.closest('.open-modal');
//   if(!btn) return;
//   const id = btn.getAttribute('data-id');
//   const p = STATE.filtered.find(x=>x.id===id) || STATE.products.find(x=>x.id===id);
//   if(p) openModal(p);
// });

// ===== FILTROS =====
function applyFilters(){
  const q = (SEARCH?.value || '').toLowerCase().trim();
  const cat = CATEGORY?.value || '';
  const maxP = Number(MAXPRICE?.value || Infinity);
  const sort = SORT?.value || 'recientes';

  STATE.filtered = STATE.products.filter(p=>{
    const price = smartPrice(p);
    const inQ = !q || (p.title?.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q));
    const inCat = !cat || p.category === cat;
    const inPrice = !maxP || (price==null ? false : price <= maxP);
    return inQ && inCat && inPrice;
  });

  switch(sort){
    case 'precio_asc': STATE.filtered.sort((a,b)=>(smartPrice(a)??Infinity)-(smartPrice(b)??Infinity)); break;
    case 'precio_desc': STATE.filtered.sort((a,b)=>(smartPrice(b)??-Infinity)-(smartPrice(a)??-Infinity)); break;
    case 'nombre_asc': STATE.filtered.sort((a,b)=>(a.title||'').localeCompare(b.title||'')); break;
  default: STATE.filtered.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
  }

  STATE.page = 1;
  renderStats(); renderGrid(); renderPagination();
}

// ===== CARGA Y AUTO-REFRESCO =====
// Asegúrate de usar assignCategory en lugar de normalize en tu fetchCatalog
async function fetchCatalog(force=false){
try{
if(STATUS) STATUS.textContent = 'Cargando…';
const url = `${CATALOG_URL}${force?`?t=${Date.now()}`:''}`;
const res = await fetch(url, { cache:'no-store' });
if(!res.ok) throw new Error(`HTTP ${res.status}`);
const json = await res.json();


const serialized = JSON.stringify(json);
const h = hashString(serialized);
if(h !== STATE.jsonHash){
CAROUSELS.forEach(c=>c.destroy());
CAROUSELS.clear();


STATE.jsonHash = h;
STATE.raw = json;
STATE.products = assignCategory(json);

STATE.categories = new Set(STATE.products.map(p=>p.category || 'General'));
renderCategories();
applyFilters();
console.log("CATEGORÍAS EN SELECT:", Array.from(STATE.categories));
}

if(STATUS) STATUS.textContent = `Última actualización: ${new Date().toLocaleTimeString()}`;
}catch(err){
if(STATUS) STATUS.textContent = `Error: ${err.message}`;
console.error(err);
}
}

// ===== PER-PAGE ADAPTATIVO =====
function fitPerPage(){
  const small = window.matchMedia('(max-width: 580px)').matches;
  const val = small ? 9 : 12;
  if (STATE.perPage !== val){
    STATE.perPage = val;
    if (PERPAGE) PERPAGE.value = String(val);
    STATE.page = 1;
    renderStats(); renderGrid(); renderPagination();
  }
}
window.addEventListener('resize', fitPerPage);

// ===== LISTENERS UI =====
const onSearch = debounce(applyFilters, 200);
SEARCH?.addEventListener('input', onSearch);
CATEGORY?.addEventListener('change', applyFilters);
MAXPRICE?.addEventListener('input', debounce(applyFilters, 200));
SORT?.addEventListener('change', applyFilters);
PERPAGE?.addEventListener('change', ()=>{
  STATE.perPage = Number(PERPAGE.value||12);
  STATE.page=1; renderStats(); renderGrid(); renderPagination();
});
CLEAR?.addEventListener('click', ()=>{
  SEARCH.value=''; CATEGORY.value=''; MAXPRICE.value='';
  SORT.value='recientes';
  if (PERPAGE) PERPAGE.value='12';
  STATE.perPage = Number(PERPAGE?.value||12);
  applyFilters();
});
REFRESH?.addEventListener('click', ()=> fetchCatalog(true));

// ===== TICKS & VISIBILITY =====
setInterval(()=> fetchCatalog(true), REFRESH_MS);
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible'){
    fetchCatalog(true);
    startGlobalTick();
  } else {
    stopGlobalTick();
  }
});




// ===== PRIMERA CARGA =====
fitPerPage();
fetchCatalog(true);
startGlobalTick();

// ===== Compartir en WhatsApp con imagen (si el navegador lo permite) =====
async function shareWhatsAppWithImage({ phone, text, imageUrl }) {
  try {
    // Intenta Web Share API con archivos (Android/Chrome)
    if (imageUrl && navigator.canShare && navigator.canShare({ files: [] })) {
      const res = await fetch(imageUrl, { mode: 'cors' });  // si CORS falla, irá al catch
      const blob = await res.blob();
      const fileName = 'producto' + (/\.\w+$/.exec(imageUrl)?.[0] || '.jpg');
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return; // listo: compartido con imagen
      }
    }
  } catch (err) {
    // Ignoramos y hacemos fallback abajo
    console.debug('Web Share con imagen no disponible:', err?.message || err);
  }

  // Fallback universal: abrir wa.me con el texto + URL de la imagen (muestra preview)
  const msg = imageUrl ? `${text}\n${imageUrl}` : text;
  const to = (phone || '').replace(/[^\d]/g, '');   // solo dígitos
  const url = `https://wa.me/${to}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener');
}

