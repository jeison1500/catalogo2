# bot.py - Telegram -> images/ + data/catalog.json (robusto, con logs)
import os
import re
import json
import uuid
import datetime as dt
from json import JSONDecodeError

from telegram import Update, Bot
from telegram.ext import Application, MessageHandler, CallbackContext, filters
from telegram.request import HTTPXRequest

# ------------------ Config ------------------
IMAGES_FOLDER = "images"               # donde se guardan las fotos
DATA_DIR = "data"
DATA_JSON = "data.json"                # historial crudo de grupos (opcional)
CATALOG_JSON = os.path.join(DATA_DIR, "catalog.json")  # lo que consume el front

BOT_TOKEN = os.getenv("BOT_TOKEN") or "7836594546:AAGt_YeL3KZGsHIvWxxAkM4I1dcaCr4b8RM"  # mejor vía variable de entorno

request = HTTPXRequest(connect_timeout=30, read_timeout=60)
bot = Bot(token=BOT_TOKEN, request=request)

os.makedirs(IMAGES_FOLDER, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# ------------------ Utils JSON seguros ------------------
def _save_json_atomic(path: str, data):
    """Escritura atómica (evita archivos corruptos)."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)

def _safe_load_json(path: str, default):
    """Lectura tolerante: si está corrupto lo renombra a .bak y devuelve default."""
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except JSONDecodeError as e:
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        bak = f"{path}.corrupt.{stamp}.bak"
        os.replace(path, bak)
        print(f"[WARN] {path} corrupto → {bak}. Arranco vacío. Detalle: {e}")
        return default

# ------------------ Estado ------------------
# Mantén el histórico de grupos (fotos hasta que llegue descripción)
image_groups = _safe_load_json(DATA_JSON, default=[])
products_store = _safe_load_json(CATALOG_JSON, default={}).get("products", [])

# ------------------ Parsers ------------------
# SKU (acepta "SKU 123", "Ref 123", "Referencia 123", con guiones)
SKU_RX = re.compile(r"(?i)\b(?:sku|ref(?:erencia)?)\s*[:\-]?\s*([a-z0-9\-\.]+)")
# Categoría por hashtag: #Vestidos #blusas
CAT_RX = re.compile(r"#([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)")

# --- NUEVO extractor de precio robusto ---
# 1) Con keywords ($, COP, precio/valor/vale/costo)
PRICE_KW_RX = re.compile(
    r"(?i)(?:\$|cop|precio|vale|valor|costo)\s*[:\-]?\s*(?:\$?\s*)"
    r"([0-9]{1,3}(?:[.\s]?[0-9]{3})+|[0-9]{5,})"
)
# 2) Con separadores de miles (1.234.567)
PRICE_SEP_RX = re.compile(r"(?i)\b([0-9]{1,3}(?:[.\s][0-9]{3})+)\b")
# 3) Números “largos” sin separadores (>= 5 dígitos, ej: 65000)
PRICE_PLAIN_RX = re.compile(r"\b([0-9]{5,})\b")
# 4) Atajo para “92k”, “150k”, etc.
PRICE_K_RX = re.compile(r"(?i)(?:\$|cop|precio|valor|vale|costo)?\s*[:\-]?\s*([0-9]+)\s*k\b")

def extract_price(text: str):
    """
    Devuelve un entero (COP) o None. Prefiere coincidencias con keywords
    (precio/valor/vale/costo/$/COP). Evita capturar REF/Referencia/SKU.
    Maneja formatos: 76.000  |  76000  |  $ 76.000  |  92k
    """
    if not text:
        return None

    # “92k” → 92000
    mk = PRICE_K_RX.search(text)
    if mk:
        try:
            return int(mk.group(1)) * 1000
        except Exception:
            pass

    candidates = []

    # 1) Con keywords (preferidos)
    for m in PRICE_KW_RX.finditer(text):
        val = int(re.sub(r"\D", "", m.group(1)))
        candidates.append(("kw", val, m.start()))

    # 2) Con separadores (evitando 'ref' o 'sku' cerca)
    for m in PRICE_SEP_RX.finditer(text):
        ctx = text[max(0, m.start()-8):m.start()].lower()
        if "ref" in ctx or "sku" in ctx:
            continue
        val = int(re.sub(r"\D", "", m.group(1)))
        candidates.append(("sep", val, m.start()))

    # 3) Números largos (>= 5 dígitos), evitando 'ref' o 'sku' cerca
    for m in PRICE_PLAIN_RX.finditer(text):
        ctx = text[max(0, m.start()-8):m.start()].lower()
        if "ref" in ctx or "sku" in ctx:
            continue
        val = int(m.group(1))
        candidates.append(("plain", val, m.start()))

    if not candidates:
        return None

    # Filtro de valores razonables (evita refs de 4 dígitos)
    SENSIBLE_MIN = 20000   # ajusta si lo necesitas
    sensible = [v for (_, v, _) in candidates if v >= SENSIBLE_MIN]

    # Preferir keyword dentro de rango
    kw = [v for (t, v, _) in candidates if t == "kw" and v >= SENSIBLE_MIN]
    if kw:
        return max(kw)

    # Luego, el mayor sensible
    if sensible:
        return max(sensible)

    # Último recurso: el mayor de todos
    return max(v for (_, v, _) in candidates)

def parse_caption(text: str):
    """Extrae title (1a línea), price, sku, category, description."""
    text = (text or "").strip()
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    title = lines[0][:80] if lines else "Producto"

    # --- nuevo: usar extractor robusto ---
    price = extract_price(text)

    sku = None
    s = SKU_RX.search(text)
    if s:
        sku = s.group(1).upper()

    cat = None
    c = CAT_RX.search(text)
    if c:
        cat = c.group(1).capitalize()
    if not cat:
        cat = "General"

    return {
        "title": title,
        "price": price,
        "sku": sku,
        "category": cat,
        "description": text
    }

def make_product(images, caption_text, created_at_iso):
    fields = parse_caption(caption_text)
    img_paths = [f"{IMAGES_FOLDER}/{fn}" for fn in images]
    product = {
        "id": str(uuid.uuid4()),
        "title": fields["title"],
        "price": fields["price"],
        "sku": fields["sku"],
        "category": fields["category"],
        "images": img_paths,
        "image": img_paths[0] if img_paths else None,   # para el front
        "description": fields["description"],
        "created_at": created_at_iso
    }
    return product

# ------------------ Handlers ------------------
async def save_image(update: Update, context: CallbackContext):
    message = update.message
    if not message or not message.photo:
        return

    # Descarga la mejor resolución
    file_id = message.photo[-1].file_id
    file = await context.bot.get_file(file_id)
    filename = f"{file_id}.jpg"
    file_path = os.path.join(IMAGES_FOLDER, filename)
    await file.download_to_drive(file_path)

    # Inicia nuevo grupo si el último ya tiene descripción
    if not image_groups or image_groups[-1].get("descripcion") is not None:
        image_groups.append({
            "imagenes": [],
            "descripcion": None,
            "created_at": message.date.isoformat()  # ISO string (seguro para JSON)
        })

    image_groups[-1]["imagenes"].append(filename)
    _save_json_atomic(DATA_JSON, image_groups)

    print(f"📸 Imagen guardada: {file_path}  (grupo actual: {len(image_groups[-1]['imagenes'])} img)")

async def save_description(update: Update, context: CallbackContext):
    message = update.message
    if not message or not message.text:
        return

    if not image_groups or image_groups[-1].get("descripcion") is not None:
        # Texto suelto sin imágenes anteriores: ignora o crea producto sin imagen (opcional)
        print("ℹ️ Texto recibido pero no hay grupo abierto con imágenes. Ignorado.")
        return

    image_groups[-1]["descripcion"] = message.text.strip()
    created_at_iso = image_groups[-1].get("created_at") or message.date.isoformat()

    imgs = image_groups[-1]["imagenes"]
    desc = image_groups[-1]["descripcion"]

    product = make_product(imgs, desc, created_at_iso)
    products_store.insert(0, product)  # al inicio = más recientes

    # Persistencia segura
    _save_json_atomic(DATA_JSON, image_groups)
    _save_json_atomic(CATALOG_JSON, {"products": products_store})

    print(f"✅ Producto agregado a catalog.json: {product['title']} | SKU {product.get('sku') or '—'} | {product.get('price') or 's/prec.'}")
    print(f"   → Imagen principal: {product.get('image')}")

def main():
    if not BOT_TOKEN or BOT_TOKEN.startswith("PON_AQUI"):
        raise RuntimeError("Configura la variable de entorno BOT_TOKEN con el token de tu bot.")

    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(MessageHandler(filters.PHOTO, save_image))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, save_description))

    print("🤖 Bot corriendo. Envia FOTOS del producto y luego la DESCRIPCIÓN (con precio, SKU y #categoria si quieres).")
    print(f"📁 Guardando imágenes en: {IMAGES_FOLDER} | Catálogo: {CATALOG_JSON}")
    application.run_polling()

if __name__ == "__main__":
    main()
