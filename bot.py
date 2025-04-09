import os
import json
import asyncio
from collections import defaultdict
from telegram import Update, Bot
from telegram.ext import Application, MessageHandler, CallbackContext, filters
from telegram.request import HTTPXRequest

# Configuración del bot
IMAGES_FOLDER = "images"
HTML_OUTPUT = "index.html"
DATA_FILE = "data.json"
BOT_TOKEN = "7836594546:AAGt_YeL3KZGsHIvWxxAkM4I1dcaCr4b8RM"

request = HTTPXRequest(connect_timeout=30, read_timeout=60)
bot = Bot(token=BOT_TOKEN, request=request)

if not os.path.exists(IMAGES_FOLDER):
    os.makedirs(IMAGES_FOLDER)

# Cargar grupos anteriores si existen
if os.path.exists(DATA_FILE):
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        image_groups = json.load(f)
else:
    image_groups = []

def save_data():
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(image_groups, f, ensure_ascii=False, indent=2)

def update_html():
    html_content = """<!DOCTYPE html>
<html lang=\"es\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>Catálogo de Productos Angiefashion</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            background-color: #f0f0f0;
            margin: 0;
            padding-bottom: 30px;
        }
        h1 {
            background: linear-gradient(90deg, #0073e6, #00c6ff);
            color: white;
            padding: 20px;
            margin: 0;
            font-size: 28px;
            font-weight: bold;
            text-align: center;
            letter-spacing: 2px;
            border-bottom: 4px solid #005bb5;
            text-transform: uppercase;
        }
        .catalogo {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 0;
        }
        .bloque-conjunto {
            background: #fff;
            padding: 15px;
            margin: 15px;
            border-radius: 15px;
            box-shadow: 0px 2px 8px rgba(0,0,0,0.1);
            width: 95%;
            max-width: 700px;
        }
        .galeria {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: center;
        }
        .producto {
            flex: 1 1 calc(50% - 10px);
            max-width: calc(50% - 10px);
            border-radius: 10px;
            overflow: hidden;
        }
        .producto img {
            width: 100%;
            height: auto;
            object-fit: cover;
            display: block;
        }
        .descripcion {
            font-size: 16px;
            text-align: left;
            padding-top: 10px;
            white-space: pre-line;
            color: #333;
            line-height: 1.5;
        }
        .descripcion::before {
            content: "📝 Descripción:\A";
            font-weight: bold;
            white-space: pre;
            color: #0073e6;
        }
        @media (max-width: 600px) {
            .producto {
                flex: 1 1 100%;
                max-width: 100%;
            }
        }
    </style>
</head>
<body>
    <h1>📢 Catálogo de Productos Angiefashion 📢</h1>
    <div class=\"catalogo\">
"""

    for grupo in reversed(image_groups):
        html_content += "<div class='bloque-conjunto'>\n"
        html_content += "<div class='galeria'>\n"
        for img in grupo['imagenes']:
            img_path = f"{IMAGES_FOLDER}/{img}"
            html_content += f"<div class='producto'><img src='{img_path}' alt='Producto'></div>\n"
        html_content += "</div>\n"
        if grupo['descripcion']:
            html_content += f"<div class='descripcion'>{grupo['descripcion']}</div>\n"
        html_content += "</div>\n"

    html_content += """
    </div>
</body>
</html>
"""

    with open(HTML_OUTPUT, "w", encoding="utf-8", errors="replace") as file:
        file.write(html_content)
    print(f"✅ Catálogo actualizado correctamente en {HTML_OUTPUT}")

async def save_image(update: Update, context: CallbackContext):
    message = update.message
    if message.photo:
        file_id = message.photo[-1].file_id
        file = await context.bot.get_file(file_id)
        filename = f"{file_id}.jpg"
        file_path = os.path.join(IMAGES_FOLDER, filename)
        await file.download_to_drive(file_path)

        if not image_groups or image_groups[-1].get("descripcion") is not None:
            image_groups.append({"imagenes": [], "descripcion": None})
        image_groups[-1]["imagenes"].append(filename)
        save_data()
        asyncio.create_task(asyncio.to_thread(update_html))

async def save_description(update: Update, context: CallbackContext):
    message = update.message
    if message.text and image_groups:
        image_groups[-1]["descripcion"] = message.text.strip()
        save_data()
        asyncio.create_task(asyncio.to_thread(update_html))


def main():
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(MessageHandler(filters.PHOTO, save_image))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, save_description))
    application.run_polling()

if __name__ == "__main__":
    main()
