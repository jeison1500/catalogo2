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
  const price = smartPrice(p); // ✅ Solo una vez
  const card = document.createElement('article');
  card.className = 'card';
  card.setAttribute('data-id', p.id); // ← importante

  const imagenURL = new URL(p.images?.[0] || p.image || PLACEHOLDER, location.origin).href;
  const mensajeWP = `Hola, quiero este producto:\n🛍️ ${p.title}\n💰 ${price ? formatCOP(price) : ''}\n🖼️ Imagen: ${imagenURL}`;
  const whatsappURL = `https://wa.me/573127112369?text=${encodeURIComponent(mensajeWP)}`;


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
     <a class="whatsapp" target="_blank" rel="noopener" href="${whatsappURL}" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; background-color: #25D366; color: white; border-radius: 6px; text-decoration: none; font-weight: bold;">
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="white" viewBox="0 0 24 24">
    <path d="M12.04 2.003C6.507 2.003 2 6.506 2 12.038c0 1.95.511 3.815 1.482 5.465L2 22l4.6-1.46a10.002 10.002 0 0 0 5.44 1.501h.002C17.494 22.04 22 17.535 22 12.002c0-5.532-4.506-10-9.96-10h-.001zM12 20.019a8.002 8.002 0 0 1-4.077-1.124l-.292-.173-2.724.865.896-2.65-.178-.3A7.948 7.948 0 0 1 4 12.038c0-4.403 3.58-7.994 7.997-7.994 4.417 0 8.003 3.59 8.003 7.994 0 4.404-3.586 7.981-8 7.981h-.001zm4.35-5.654c-.237-.118-1.4-.692-1.617-.77-.217-.079-.375-.118-.533.118-.158.237-.612.77-.75.928-.138.158-.275.178-.512.06-.237-.119-1.001-.368-1.905-1.175-.704-.627-1.18-1.403-1.318-1.64-.137-.237-.015-.365.103-.482.106-.106.237-.275.355-.412.119-.138.158-.237.237-.395.079-.158.04-.296-.02-.414-.06-.119-.532-1.28-.73-1.751-.192-.462-.387-.399-.532-.406l-.453-.008c-.158 0-.414.06-.63.296-.217.237-.825.806-.825 1.964 0 1.158.846 2.277.964 2.434.119.158 1.664 2.55 4.035 3.574.564.243 1.004.388 1.348.497.567.18 1.082.154 1.49.094.454-.068 1.4-.57 1.597-1.121.197-.553.197-1.027.139-1.121-.06-.093-.217-.153-.454-.271z"/>
  </svg>
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
    b.className = 'page-btn';
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', ()=> {
      STATE.page = page;
      renderGrid();
      renderStats();
      renderPagination();
      window.scrollTo({top:0, behavior:'smooth'});
    });
    return b;
  };

  PAG.appendChild(mk('Primera', 1, STATE.page === 1));
  PAG.appendChild(mk('Anterior', Math.max(1, STATE.page - 1), STATE.page === 1));

  const span = document.createElement('span');
  span.textContent = `Página ${STATE.page} de ${totalPages}`;
  span.style.padding = '8px 12px';
  PAG.appendChild(span);

  PAG.appendChild(mk('Siguiente', Math.min(totalPages, STATE.page + 1), STATE.page === totalPages));
  PAG.appendChild(mk('Última', totalPages, STATE.page === totalPages));
}


// ===== MODAL =====
function closeModal(modal){
  try{
    if(modal._tickId){ clearInterval(modal._tickId); modal._tickId = null; }
    if(typeof modal.close === 'function') modal.close(); else modal.removeAttribute('open');
  }catch{}
}

function openModal(p) {
  const MODAL = document.getElementById('productModal');
  if (!MODAL) {
    console.error('❌ Modal no encontrado (#productModal)');
    return;
  }

  const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('modalTitle');
  const modalPrice = document.getElementById('modalPrice');
  const modalSku = document.getElementById('modalSku');
  const modalDesc = document.getElementById('modalDesc');
  const modalWhatsApp = document.getElementById('modalWhatsApp');
  const thumbsContainer = MODAL.querySelector('.ml-thumbs');
  

  // Mostrar datos
  modalTitle.textContent = p.title;
  modalPrice.textContent = formatCOP(smartPrice(p));
  modalSku.textContent = p.sku ? `SKU: ${p.sku}` : '';
  modalDesc.textContent = p.description || '';

  // Link WhatsApp
  modalWhatsApp.href = `https://wa.me/573127112369?text=${encodeURIComponent(`Hola, quiero este producto: ${p.title}`)}`;
  modalWhatsApp.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="white" viewBox="0 0 24 24">
    <path d="M12.04 2.003C6.507 2.003 2 6.506 2 12.038c0 1.95.511 3.815 1.482 5.465L2 22l4.6-1.46a10.002 10.002 0 0 0 5.44 1.501h.002C17.494 22.04 22 17.535 22 12.002c0-5.532-4.506-10-9.96-10h-.001zM12 20.019a8.002 8.002 0 0 1-4.077-1.124l-.292-.173-2.724.865.896-2.65-.178-.3A7.948 7.948 0 0 1 4 12.038c0-4.403 3.58-7.994 7.997-7.994 4.417 0 8.003 3.59 8.003 7.994 0 4.404-3.586 7.981-8 7.981h-.001zm4.35-5.654c-.237-.118-1.4-.692-1.617-.77-.217-.079-.375-.118-.533.118-.158.237-.612.77-.75.928-.138.158-.275.178-.512.06-.237-.119-1.001-.368-1.905-1.175-.704-.627-1.18-1.403-1.318-1.64-.137-.237-.015-.365.103-.482.106-.106.237-.275.355-.412.119-.138.158-.237.237-.395.079-.158.04-.296-.02-.414-.06-.119-.532-1.28-.73-1.751-.192-.462-.387-.399-.532-.406l-.453-.008c-.158 0-.414.06-.63.296-.217.237-.825.806-.825 1.964 0 1.158.846 2.277.964 2.434.119.158 1.664 2.55 4.035 3.574.564.243 1.004.388 1.348.497.567.18 1.082.154 1.49.094.454-.068 1.4-.57 1.597-1.121.197-.553.197-1.027.139-1.121-.06-.093-.217-.153-.454-.271z"/>
  </svg>
  <span style="margin-left: 6px;">WhatsApp</span>
`;




  // Miniaturas (galería)
// Miniaturas (galería)
const imagenes = p.images || [p.image];
thumbsContainer.innerHTML = '';
imagenes.forEach((url, i) => {
  const btn = document.createElement('button');
  btn.innerHTML = `<img src="${url}" alt="Miniatura">`;
  btn.setAttribute('aria-current', i === 0 ? 'true' : 'false');
  btn.addEventListener('click', () => {
    modalImage.src = url;
    [...thumbsContainer.children].forEach(b => b.removeAttribute('aria-current'));
    btn.setAttribute('aria-current', 'true');
    
    // ACTUALIZAR link de WhatsApp si cambia imagen
    const imgURL = new URL(url, location.origin).href;
    const mensajeWP = `Hola, quiero este producto:\n🛍️ ${p.title}\n💰 ${formatCOP(smartPrice(p)) || ''}\n🖼️ Imagen: ${imgURL}`;
    modalWhatsApp.href = `https://wa.me/573127112369?text=${encodeURIComponent(mensajeWP)}`;
  });
  thumbsContainer.appendChild(btn);
});

// Imagen principal
// Imagen principal
modalImage.src = imagenes[0];

// Asegurar que es una URL absoluta (aunque ya venga así del JSON)
const imagenAbsoluta = new URL(imagenes[0], location.origin).href;


const mensajeWP = `${imagenAbsoluta}\n\nHola, quiero este producto:\n🛍️ ${p.title}\n💰 ${formatCOP(smartPrice(p)) || ''}`;
modalWhatsApp.href = `https://wa.me/573127112369?text=${encodeURIComponent(mensajeWP)}`;




  // Botón cerrar (✅ ¡DENTRO de la función!)
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) {
    closeBtn.onclick = () => {
      if (typeof MODAL.close === 'function') MODAL.close();
      else MODAL.removeAttribute('open');
    };
  }

  // Abrir modal
  if (typeof MODAL.showModal === 'function') MODAL.showModal();
  else MODAL.setAttribute('open', '');
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

GRID.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;

  const isWhatsApp = e.target.closest('a.whatsapp');
  if (isWhatsApp) return;




  const id = card.getAttribute('data-id');
  const p = STATE.filtered.find(prod => prod.id === id) || STATE.products.find(prod => prod.id === id);
  if (p) openModal(p);
});








