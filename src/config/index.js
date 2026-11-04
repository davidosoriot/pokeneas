const imagesBaseUrl = process.env.IMAGES_BASE_URL;

if (!imagesBaseUrl) {
  throw new Error('Falta la variable de entorno IMAGES_BASE_URL (URL pública del bucket de imágenes)');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  imagesBaseUrl: imagesBaseUrl.replace(/\/+$/, ''),
};
