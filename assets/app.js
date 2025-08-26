// ===== CONFIG =====
const REFRESH_MS = 15000;                     // auto-actualizar catálogo
const CATALOG_URL = "./data/catalog.json";
const PLACEHOLDER = "./assets/placeholder.jpg";
const SLIDE_MS = 3500;                        // tiempo entre diapositivas
const SWIPE_THRESHOLD = 30;                   // px para swipe

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

// ===== CARRUSEL GLOBAL (para tarjetas) =====
const CAROUSELS = new Set();   // carouseles en tarjetas (en sincronía)
let tickId = null;
const io = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const c = entry.target._carousel;
    if(c) c.visible = entry.isIntersecting;   // sólo avanzar visibles
  });
}, { root: null, threshold: 0.4 });

function startGlobalTick(){
  if(tickId) return;
  tickId = setInterval(()=>{
    if (document.visibilityState !== 'visible') return;
    CAROUSELS.forEach(c => { if(c.visible && !c.paused) c.next(); });
  }, SLIDE_MS);
}
function stopGlobalTick(){
  if(tickId){ clearInterval(tickId); tickId = null; }
}

// ===== UTILIDADES =====
function formatCOP(n){
  if(n == null || isNaN(Number(n))) return '';
  return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
}
function hashString(str){
  let h = 0, i, chr;
  for(i=0;i<str.length;i++){ chr=str.charCodeAt(i); h=((h<<5)-h)+chr; h|=0; }
  return h;
}
function debounce(fn, ms=250){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
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

function normalize(data){
  const arr = Array.isArray(data) ? data : (data.products || []);
  return arr.map(p=>{
    const imgs = (p.images && p.images.length ? p.images : (p.image ? [p.image] : [])) || [];
    const created = p.created_at || p.date || '1970-01-01T00:00:00Z';
    const rawNum = p.price!=null ? Number(String(p.price).replace(/[^\d]/g,'')) : null;
    return {
      id: p.id || (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)),
      title: p.title || p.caption || 'Producto',
      price: rawNum,
      sku: p.sku || p.code || null,   // no lo mostramos
      category: p.category || 'General',
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
}

function buildCard(p){
  const price = smartPrice(p);
  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = `
    <div class="media"></div>
    <div class="body">
      <h4 class="title">${p.title}</h4>
      <div class="meta">
        <span class="price">${price!=null ? formatCOP(price) : ''}</span>
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
        <a class="whatsapp" target="_blank" rel="noopener"
           href="https://wa.me/573127112369?text=${encodeURIComponent(`Hola, quiero este producto: ${p.title}${price?` | ${formatCOP(price)}`:''}`)}">
           WhatsApp
        </a>
      </div>
    </div>
  `;
  // Carrusel en tarjeta
  const media = card.querySelector('.media');
  new Carousel(media, p.images, { register:true, showDots:true, allowSwipe:true });
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
  try{
    if(modal._tickId){ clearInterval(modal._tickId); modal._tickId = null; }
    if(typeof modal.close === 'function') modal.close(); else modal.removeAttribute('open');
  }catch{}
}

function openModal(p){
  const MODAL = document.getElementById('productModal');
  if(!MODAL){ console.error('Modal no encontrado (#productModal)'); return; }
  const M_TITLE = document.getElementById('modalTitle');
  const M_PRICE = document.getElementById('modalPrice');
  const M_DESC  = document.getElementById('modalDesc');
  const M_WA    = document.getElementById('modalWhatsApp');
  const M_SKU   = document.getElementById('modalSku'); // si existe, oculto
  let MODAL_MEDIA = MODAL.querySelector('.modal-media');

  if(!MODAL_MEDIA){
    const body = MODAL.querySelector('.modal-body') || MODAL;
    MODAL_MEDIA = document.createElement('div');
    MODAL_MEDIA.className = 'modal-media';
    body.prepend(MODAL_MEDIA);
  }

  const price = smartPrice(p);
  if (M_SKU){ M_SKU.textContent = ''; M_SKU.style.display = 'none'; }
  if (M_TITLE) M_TITLE.textContent = p.title;
  if (M_PRICE) M_PRICE.textContent = price!=null ? formatCOP(price) : '';
  if (M_DESC)  M_DESC.textContent  = p.description || '';
  if (M_WA)    M_WA.href = `https://wa.me/573127112369?text=${encodeURIComponent(`Hola, quiero este producto: ${p.title}${price?` | ${formatCOP(price)}`:''}`)}`;

  // Carrusel en el modal (auto-advance propio)
  MODAL_MEDIA.innerHTML = '';
  MODAL_MEDIA.style.position = 'relative';
  MODAL_MEDIA.style.width = '100%';
  MODAL_MEDIA.style.background = '#0f1015';
  MODAL_MEDIA.style.aspectRatio = getComputedStyle(document.documentElement).getPropertyValue('--card-aspect') || '4 / 5';
  MODAL_MEDIA.style.overflow = 'hidden';

  const modalCarousel = new Carousel(MODAL_MEDIA, p.images, { register:false, showDots:true, allowSwipe:true });
  if(MODAL._tickId){ clearInterval(MODAL._tickId); }
  MODAL._tickId = setInterval(()=>{
    if(document.visibilityState==='visible' && (MODAL.open || MODAL.hasAttribute('open')) && !modalCarousel.paused){
      modalCarousel.next();
    }
  }, SLIDE_MS);

  // Botón cerrar
  const MODAL_CLOSE = document.getElementById('modalClose');
  if(MODAL_CLOSE) MODAL_CLOSE.onclick = ()=> closeModal(MODAL);

  // Cerrar con Esc (una sola vez)
  if(!MODAL._escBound){
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && (MODAL.open || MODAL.hasAttribute('open'))) closeModal(MODAL); });
    MODAL._escBound = true;
  }
  // Clic fuera de la tarjeta para cerrar (una sola vez)
  if(!MODAL._outsideBound){
    MODAL.addEventListener('click', (e)=>{
      const card = MODAL.querySelector('.modal-card');
      if(!card) return;
      const r = card.getBoundingClientRect();
      const inside = e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
      if(!inside) closeModal(MODAL);
    });
    MODAL._outsideBound = true;
  }

  // Abrir
  if(typeof MODAL.showModal === 'function') MODAL.showModal();
  else MODAL.setAttribute('open','');
}

// Delegación de evento: abre modal
GRID.addEventListener('click', (e)=>{
  const btn = e.target.closest('.open-modal');
  if(!btn) return;
  const id = btn.getAttribute('data-id');
  const p = STATE.filtered.find(x=>x.id===id) || STATE.products.find(x=>x.id===id);
  if(p) openModal(p);
});

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
      // limpiar carouseles de tarjetas antiguos
      CAROUSELS.forEach(c=>c.destroy());
      CAROUSELS.clear();

      STATE.jsonHash = h;
      STATE.raw = json;
      STATE.products = normalize(json);
      STATE.categories = new Set(STATE.products.map(p=>p.category || 'General'));
      renderCategories();
      applyFilters();
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
  if (M_WA) {
    const imgURL = p.images?.[0] || PLACEHOLDER;
    const message = `
Hola, quiero este producto:

📌 *${p.title}*
💰 *Precio:* ${price ? formatCOP(price) : 'Consultar'}
🖼️ Imagen: ${imgURL}
`.trim();
    M_WA.href = `https://wa.me/573127112369?text=${encodeURIComponent(message)}`;
  }
