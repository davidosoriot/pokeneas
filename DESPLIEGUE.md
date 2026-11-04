# Despliegue de Pokeneas

Reemplace `TU_USUARIO` por su usuario de DockerHub (en minúsculas). Cada integrante repite las partes 2 a 6 en su propia cuenta de GCP; la imagen de DockerHub se comparte.

## 1. GitHub y DockerHub (solo una vez, en el computador)

1. En <https://hub.docker.com> cree el repositorio público `pokeneas`.
2. En DockerHub, vaya a **Account settings > Personal access tokens** y genere un token con permiso **Read & Write**. Cópielo.
3. Desde la carpeta del proyecto ejecute:

```powershell
gh auth refresh -h github.com -s workflow
gh repo create pokeneas --public --source=. --remote=origin
gh secret set DOCKERHUB_USERNAME --body "TU_USUARIO"
gh secret set DOCKERHUB_TOKEN
git push -u origin main
gh run watch
```

`gh secret set DOCKERHUB_TOKEN` le pedirá pegar el token. Al terminar `gh run watch`, la imagen `TU_USUARIO/pokeneas:latest` debe aparecer en DockerHub.

## 2. Preparar GCP (Cloud Shell)

Abra <https://console.cloud.google.com>, seleccione su proyecto y active **Cloud Shell** (icono `>_`). Todo lo que sigue se ejecuta ahí hasta la parte 4.

```bash
gcloud config set project ID_DE_SU_PROYECTO
gcloud services enable compute.googleapis.com storage.googleapis.com
```

## 3. Bucket con las imágenes

```bash
git clone https://github.com/davidosoriot/pokeneas.git
export BUCKET=pokeneas-$RANDOM$RANDOM
gcloud storage buckets create gs://$BUCKET --location=us-central1 --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=allUsers --role=roles/storage.objectViewer
gcloud storage cp pokeneas/assets/pokeneas/*.png gs://$BUCKET/
gcloud storage ls gs://$BUCKET
echo "https://storage.googleapis.com/$BUCKET"
```

Guarde la URL que imprime la última línea. Ábrala en el navegador agregando `/arrierin.png` para confirmar que la imagen es pública.

**Pantallazo 2 del taller:** la lista de imágenes (`gcloud storage ls`, o el bucket en la consola web).

## 4. Template, firewall y 4 instancias

```bash
cat > docker.sh <<'EOF'
#!/bin/bash
command -v docker || curl -fsSL https://get.docker.com | sh
EOF

gcloud compute firewall-rules create pokeneas-http --allow=tcp:80 --target-tags=swarm --source-ranges=0.0.0.0/0
gcloud compute firewall-rules create pokeneas-swarm --allow=tcp:2377,tcp:7946,udp:7946,udp:4789 --target-tags=swarm --source-tags=swarm

gcloud compute instance-templates create pokeneas-template \
  --machine-type=e2-small \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --tags=swarm \
  --metadata-from-file=startup-script=docker.sh

gcloud compute instances create swarm-1 swarm-2 swarm-3 swarm-4 \
  --source-instance-template=pokeneas-template \
  --zone=us-central1-a

gcloud compute instances list
```

Espere unos 2 minutos para que se instale Docker. Compruébelo con:

```bash
gcloud compute ssh swarm-1 --zone=us-central1-a --command="sudo docker --version"
```

Si el template del curso (Presentación-13-B) usa otra imagen o máquina, puede usar ese. Lo importante es que tenga Docker y el tag de red `swarm`.

## 5. Docker Swarm

Entre a la líder:

```bash
gcloud compute ssh swarm-1 --zone=us-central1-a
```

Dentro de `swarm-1`:

```bash
sudo docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')
sudo docker swarm join-token manager
```

El segundo comando imprime una línea `docker swarm join --token SWMTKN-... IP:2377`. Cópiela.

Abra otra pestaña de Cloud Shell y, para cada una de `swarm-2`, `swarm-3` y `swarm-4`:

```bash
gcloud compute ssh swarm-2 --zone=us-central1-a
sudo docker swarm join --token SWMTKN-... IP:2377
exit
```

Note que debe anteponer `sudo` a la línea copiada. De vuelta en `swarm-1`:

```bash
sudo docker node ls
```

Deben aparecer 4 nodos: uno `Leader` y tres `Reachable`.

## 6. Servicio con 10 réplicas

En `swarm-1`, con la URL del bucket de la parte 3:

```bash
sudo docker service create \
  --name pokeneas \
  --replicas 10 \
  --publish published=80,target=3000 \
  --env IMAGES_BASE_URL=https://storage.googleapis.com/NOMBRE_DEL_BUCKET \
  TU_USUARIO/pokeneas:latest

sudo docker service ls
sudo docker service ps pokeneas
```

`service ls` debe mostrar `10/10`.

**Pantallazo 1 del taller:** la salida de `docker service ps pokeneas`, con las 10 réplicas repartidas en los 4 nodos.

## 7. Verificación

En `swarm-1`, cuente cuántos contenedores distintos responden:

```bash
for i in $(seq 1 40); do curl -s localhost/api/pokenea; echo; done | grep -o '"contenedorId":"[^"]*"' | sort | uniq -c
```

Deben aparecer varios ids. Luego, en el navegador, use la IP externa de cualquier instancia (`gcloud compute instances list`), con `http://` y no `https://`:

- `http://IP/api/pokenea`: JSON con id, nombre, altura, habilidad y `contenedorId`.
- `http://IP/pokenea`: imagen, frase e id del contenedor.

Recargue con F5 y el id irá cambiando.

**Pantallazo 3 del taller:** `/pokenea` con dos ids de contenedor diferentes. **Acceso a la APP:** la IP externa de `swarm-1`.

El id de la app es el de `sudo docker ps` en cada nodo, no la columna `ID` de `docker service ps` (esa es la tarea de Swarm).

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El push falla con `refusing to allow an OAuth App to create or update workflow` | Falta el scope: `gh auth refresh -h github.com -s workflow` |
| Falla el job `publish` en GitHub Actions | Secretos mal escritos o token sin permiso de escritura. Corríjalos y ejecute `gh run rerun --failed` |
| `service ls` se queda en `0/10` | Vea el error con `sudo docker service ps pokeneas --no-trunc`. Suele ser un nombre de imagen errado o un repositorio privado |
| La página carga pero sin imagen | `IMAGES_BASE_URL` errada o bucket no público. Corrija con `sudo docker service update --env-add IMAGES_BASE_URL=URL pokeneas` |
| No se puede hacer público el bucket | Desactive **Public access prevention** en la pestaña Permissions del bucket |
| `join` se queda esperando | Falta la regla `pokeneas-swarm` o la instancia no tiene el tag `swarm` |
| El navegador no abre la IP | Use `http://`, no `https://`, y confirme la regla `pokeneas-http` |
| Tras subir código nuevo sigue la versión vieja | `sudo docker service update --force --image TU_USUARIO/pokeneas:latest pokeneas` |

## Costos

Cuatro `e2-small` generan costo mientras estén encendidas. No las apague antes de la sustentación: al apagarlas cambia la IP externa. Después de la nota, borre todo desde Cloud Shell:

```bash
gcloud compute instances delete swarm-1 swarm-2 swarm-3 swarm-4 --zone=us-central1-a
gcloud compute instance-templates delete pokeneas-template
gcloud compute firewall-rules delete pokeneas-http pokeneas-swarm
gcloud storage rm -r gs://NOMBRE_DEL_BUCKET
```

## Adaptación a AWS (si no tiene acceso a GCP)

Las partes 1, 5, 6 y 7 son iguales, cambiando `gcloud compute ssh` por `ssh`. Lo demás se hace en la consola de AWS:

| GCP | AWS |
|---|---|
| Bucket | Bucket S3. Desactive **Block all public access** y agregue una bucket policy que permita `s3:GetObject` a `*` sobre `arn:aws:s3:::NOMBRE/*`. Suba los PNG de `assets/pokeneas` |
| URL de imágenes | `https://NOMBRE.s3.amazonaws.com` |
| Template | Launch Template con Ubuntu 24.04 x86_64, `t3.small` y `docker.sh` como User data. No use instancias ARM (`t4g`): la imagen es amd64 |
| Firewall | Security Group con entrada TCP 80 desde `0.0.0.0/0`, y TCP 2377, TCP/UDP 7946 y UDP 4789 desde el mismo Security Group |
| 4 instancias | Lance 4 instancias desde el template |
