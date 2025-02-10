import os
import asyncio
from telegram import Update, Bot
from telegram.ext import Application, MessageHandler, CallbackContext
from telegram.ext.filters import PHOTO
from telegram.request import HTTPXRequest

# Configuración del bot
IMAGES_FOLDER = "images"
HTML_OUTPUT = "catalogo.html"
BOT_TOKEN = "7836594546:AAGt_YeL3KZGsHIvWxxAkM4I1dcaCr4b8RM"

# Configuración de tiempos de espera para evitar Timeouts
request = HTTPXRequest(connect_timeout=30, read_timeout=60)
bot = Bot(token=BOT_TOKEN, request=request)

# Crear la carpeta de imágenes si no existe
if not os.path.exists(IMAGES_FOLDER):
    os.makedirs(IMAGES_FOLDER)

def update_html():
    """Genera un archivo HTML con todas las imágenes en un solo bloque."""
    image_files = sorted(
        [f for f in os.listdir(IMAGES_FOLDER) if f.endswith(".jpg")],
        key=lambda x: os.path.getctime(os.path.join(IMAGES_FOLDER, x)),
        reverse=True  # Muestra las imágenes más recientes primero
    )

    html_content = """
    <!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Catálogo de Productos Angiefashion</title>
    <style>
        body { 
            font-family: Arial, sans-serif; text-align: center; 
            background-color: #f0f0f0; margin: 0; padding-bottom: 30px; 
        }
        h1 { 
            background: #0088cc; color: white; padding: 15px; margin: 0; 
        }

        .catalogo { 
            display: flex; flex-direction: column; align-items: center; padding: 20px; 
        }

        .grupo { 
            display: grid; grid-template-columns: repeat(3, 1fr); /* 📌 3 imágenes por fila en escritorio */
            gap: 15px; background: white; padding: 20px; 
            border-radius: 15px; box-shadow: 0px 4px 10px rgba(0,0,0,0.1); 
            max-width: 900px; width: 100%; 
        }

        .producto { 
            width: 100%; height: 280px; cursor: pointer; border-radius: 10px; overflow: hidden; 
            transition: transform 0.3s ease;
        }

        .producto img { 
            width: 100%; height: 100%; object-fit: cover; 
        }

        .producto:hover { transform: scale(1.05); }

        /* Modal */
        .modal { 
            display: none; position: fixed; z-index: 1000; left: 0; top: 0; 
            width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); 
            align-items: center; justify-content: center; 
        }

        .modal-content { position: relative; max-width: 90%; max-height: 90%; }
        .modal img { width: 100%; border-radius: 10px; }

        .close { 
            position: absolute; top: 10px; right: 20px; font-size: 30px; 
            color: white; cursor: pointer; 
        }

        .nav { 
            position: absolute; top: 50%; transform: translateY(-50%); 
            font-size: 30px; color: white; cursor: pointer; 
            background: rgba(0,0,0,0.5); padding: 10px; border-radius: 5px; 
        }

        .prev { left: 10px; }
        .next { right: 10px; }
        .disabled { opacity: 0.5; pointer-events: none; }

        /* 📌 Adaptar a móviles (2 imágenes por fila) */
        @media (max-width: 768px) {
            .grupo { grid-template-columns: repeat(2, 1fr); } /* 📌 2 imágenes por fila en móvil */
        }

    </style>
</head>
<body>

    <h1>📢 Catálogo de Productos Angiefashion 📢</h1>

    <div class="catalogo">
        <div class='grupo' id="image-container">
            <!-- Aquí se insertarán las imágenes dinámicamente -->
        </div>
    </div>

    <div id="modal" class="modal">
        <span class="close" onclick="closeModal()">&times;</span>
        <span class="nav prev" onclick="prevImage()">&#10094;</span>
        <img class="modal-content" id="modal-img">
        <span class="nav next" onclick="nextImage()">&#10095;</span>
    </div>

    <script>
        let images = [];
        let currentIndex = 0;
        let imageElements;

        // Simulación de imágenes dinámicas
        let imageList = [
            "images/image1.jpg",
            "images/image2.jpg",
            "images/image3.jpg",
            "images/image4.jpg",
            "images/image5.jpg"
        ];

        function generateCatalog() {
            const container = document.getElementById("image-container");
            container.innerHTML = "";
            imageList.forEach(imgSrc => {
                let div = document.createElement("div");
                div.classList.add("producto");
                div.innerHTML = `<img src="${imgSrc}" alt="Producto" onclick="openModal('${imgSrc}')">`;
                container.appendChild(div);
            });
            imageElements = document.querySelectorAll(".producto img");
        }

        function openModal(src) {
            document.getElementById("modal").style.display = "flex";
            document.getElementById("modal-img").src = src;
            images = Array.from(imageElements).map(img => img.src);
            currentIndex = images.indexOf(src);
            updateNavButtons();
        }

        function closeModal() {
            document.getElementById("modal").style.display = "none";
        }

        function prevImage() {
            if (currentIndex > 0) {
                currentIndex--;
                document.getElementById("modal-img").src = images[currentIndex];
                updateNavButtons();
            }
        }

        function nextImage() {
            if (currentIndex < images.length - 1) {
                currentIndex++;
                document.getElementById("modal-img").src = images[currentIndex];
                updateNavButtons();
            }
        }

        function updateNavButtons() {
            document.querySelector(".prev").classList.toggle("disabled", currentIndex === 0);
            document.querySelector(".next").classList.toggle("disabled", currentIndex === images.length - 1);
        }

        generateCatalog();
    </script>

</body>
</html>

"""

    with open(HTML_OUTPUT, "w", encoding="utf-8") as file:
        file.write(html_content)
    print(f"✅ Catálogo actualizado: {HTML_OUTPUT}")

async def save_image(update: Update, context: CallbackContext):
    message = update.message
    if message.photo:
        file_id = message.photo[-1].file_id
        file = await context.bot.get_file(file_id)
        file_path = os.path.join(IMAGES_FOLDER, f"{file_id}.jpg")
        await file.download_to_drive(file_path)
        print(f"✅ Imagen guardada en: {file_path}")
        await update.message.reply_text(f"✅ Imagen guardada: {file_path}")
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
