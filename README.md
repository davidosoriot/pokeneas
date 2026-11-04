# Pokeneas

Pokedex de Pokeneas (nacidos en Antioquia) en Express. Se ejecuta con 10 réplicas en Docker Swarm y muestra qué contenedor atendió cada petición.

## Rutas

| Ruta | Respuesta |
|---|---|
| `GET /api/pokenea` | JSON con id, nombre, altura y habilidad de un Pokenea aleatorio, más el id del contenedor |
| `GET /pokenea` | Página con la imagen y la frase filosófica de un Pokenea aleatorio, más el id del contenedor |

`GET /` redirige a `/pokenea`.

## Estructura

```
src/
  config/       variables de entorno
  data/         arreglo de Pokeneas
  services/     lógica de negocio
  controllers/  respuestas HTTP
  routes/       definición de rutas
  views/        plantillas EJS
  app.js        configuración de Express
  server.js     arranque del servidor
assets/pokeneas/  imágenes que se suben al bucket (no van en la imagen Docker)
```

## Ejecutar en local

```bash
npm install
npm test
IMAGES_BASE_URL=https://NOMBRE_DEL_BUCKET.s3.us-east-1.amazonaws.com npm start
```

Variables de entorno:

- `IMAGES_BASE_URL` (obligatoria): URL pública del bucket S3 con las imágenes.
- `PORT` (opcional): puerto de la aplicación, 3000 por defecto.

## Despliegue

Cada push a `main` ejecuta los tests y publica la imagen en DockerHub con GitHub Actions. Los pasos para el bucket, las instancias y Docker Swarm están en [DESPLIEGUE.md](DESPLIEGUE.md).
