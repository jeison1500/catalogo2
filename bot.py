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
PRICE_RX = re.compile(r"(?:\$|COP)?\s*([\d\.]{4,})")            # $40.000 | 40.000 | COP 40000
SKU_RX   = re.compile(r"SKU[:\s\-]*([A-Z0-9\-\.]+)", re.IGNORECASE)
CAT_RX   = re.compile(r"#([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)")            # #Vestidos #blusas

def parse_caption(text: str):
    """Extrae title (1a línea), price, sku, category, description."""
    text = (text or "").strip()
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    title = lines[0][:80] if lines else "Producto"

    price = None
    m = PRICE_RX.search(text)
    if m:
        # deja solo dígitos -> 40000
        price = int(re.sub(r"\D", "", m.group(1))) if m.group(1) else None

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
