import os
import asyncio
from telegram import Update, Bot
from telegram.ext import Application, MessageHandler, CallbackContext
from telegram.ext.filters import PHOTO
from telegram.request import HTTPXRequest

# Configuración del bot
IMAGES_FOLDER = "images"
HTML_OUTPUT = "index.html"  # 🔹 Ahora siempre se llamará index.html
BOT_TOKEN = "7836594546:AAGt_YeL3KZGsHIvWxxAkM4I1dcaCr4b8RM"

# Configuración de tiempos de espera para evitar Timeouts
request = HTTPXRequest(connect_timeout=30, read_timeout=60)
bot = Bot(token=BOT_TOKEN, request=request)

# Crear la carpeta de imágenes si no existe
if not os.path.exists(IMAGES_FOLDER):
    os.makedirs(IMAGES_FOLDER)

def update_html():
    """Genera el catálogo y lo guarda en index.html."""
    image_files = sorted(
        [f for f in os.listdir(IMAGES_FOLDER) if f.endswith(".jpg")],
        key=lambda x: os.path.getctime(os.path.join(IMAGES_FOLDER, x)),
        reverse=True  # Muestra las imágenes más recientes primero
    )

    html_content = """<!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Catálogo de Productos Angiefashion</title>
    </head>
    <body>
        <h1>Catálogo de Productos</h1>
        <div>
    """

    for img in image_files:
        img_path = f"{IMAGES_FOLDER}/{img}"
        html_content += f'<img src="{img_path}" width="200">'

    html_content += """</div>
    </body>
    </html>"""

    print(f"✅ Generando archivo: {HTML_OUTPUT}")  # Depuración
    print(html_content)  # Verifica que el contenido se genera antes de guardarlo

    # 🔥 Eliminar `catalogo.html` si aún existe
    if os.path.exists("catalogo.html"):
        os.remove("catalogo.html")
        print("🚨 Se eliminó `catalogo.html` para evitar confusión.")

    # Guardar el archivo SIEMPRE como `index.html`
    with open(HTML_OUTPUT, "w", encoding="utf-8", errors="replace") as file:
        file.write(html_content)
    print(f"✅ Catálogo actualizado correctamente en {HTML_OUTPUT}")

async def save_image(update: Update, context: CallbackContext):
    message = update.message
    if message.photo:
        file_id = message.photo[-1].file_id
        file = await context.bot.get_file(file_id)
        file_path = os.path.join(IMAGES_FOLDER, f"{file_id}.jpg")
        await file.download_to_drive(file_path)
        print(f"✅ Imagen guardada en: {file_path}")
        await update.message.reply_text(f"✅ Imagen guardada: {file_path}")

        # Actualizar el catálogo en segundo plano
        asyncio.create_task(asyncio.to_thread(update_html))
    else:
        await update.message.reply_text("❌ Por favor, envíame una imagen.")

def main():
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(MessageHandler(PHOTO, save_image))
    print("🚀 El bot está funcionando...")
    application.run_polling()

if __name__ == "__main__":
    main()
