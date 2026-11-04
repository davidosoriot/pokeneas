# Despliegue de Pokeneas en AWS

Reemplace `TU_USUARIO` por su usuario de DockerHub (en minúsculas). Cada integrante repite las partes 2 a 7 en su propia cuenta de AWS; la imagen de DockerHub se comparte.

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

## 2. Preparar AWS

Entre a la consola de AWS, seleccione la región **us-east-1 (N. Virginia)** y abra **CloudShell** (icono `>_` de la barra superior). Si usa AWS Academy Learner Lab y no tiene CloudShell, use la terminal del laboratorio. Ejecute todo en una misma pestaña, porque las variables se pierden al cerrarla.

```bash
export AWS_REGION=us-east-1
git clone https://github.com/davidosoriot/pokeneas.git
```

## 3. Bucket S3 con las imágenes

```bash
export BUCKET=pokeneas-$RANDOM$RANDOM
aws s3 mb s3://$BUCKET
aws s3api put-public-access-block --bucket $BUCKET --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket $BUCKET --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$BUCKET/*\"}]}"
aws s3 sync pokeneas/assets/pokeneas s3://$BUCKET
aws s3 ls s3://$BUCKET
echo "https://$BUCKET.s3.$AWS_REGION.amazonaws.com"
```

Guarde la URL que imprime la última línea. Ábrala en el navegador agregando `/arrierin.png` para confirmar que la imagen es pública.

**Pantallazo 2 del taller:** la lista de imágenes (`aws s3 ls`, o el bucket en la consola de S3).

## 4. Llave, Security Group, Launch Template y 4 instancias

```bash
aws ec2 create-key-pair --key-name pokeneas-key --query KeyMaterial --output text > pokeneas-key.pem
chmod 400 pokeneas-key.pem

VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 create-security-group --group-name pokeneas-swarm --description "Pokeneas Swarm" --vpc-id $VPC --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 2377 --source-group $SG
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 7946 --source-group $SG
aws ec2 authorize-security-group-ingress --group-id $SG --protocol udp --port 7946 --source-group $SG
aws ec2 authorize-security-group-ingress --group-id $SG --protocol udp --port 4789 --source-group $SG

cat > docker.sh <<'EOF'
#!/bin/bash
dnf install -y docker
systemctl enable --now docker
EOF

aws ec2 create-launch-template --launch-template-name pokeneas-template --launch-template-data "{\"ImageId\":\"resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64\",\"InstanceType\":\"t3.small\",\"KeyName\":\"pokeneas-key\",\"SecurityGroupIds\":[\"$SG\"],\"UserData\":\"$(base64 -w0 docker.sh)\"}"

for i in 1 2 3 4; do
  aws ec2 run-instances --launch-template LaunchTemplateName=pokeneas-template --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=swarm-$i}]" --query 'Instances[0].InstanceId' --output text
done
```

Espere unos 2 minutos y liste las instancias:

```bash
aws ec2 describe-instances --filters "Name=tag:Name,Values=swarm-*" "Name=instance-state-name,Values=running" --query 'Reservations[].Instances[].[Tags[?Key==`Name`]|[0].Value,PublicIpAddress,PrivateIpAddress]' --output table
```

No use instancias ARM (`t4g`): la imagen publicada es amd64.

## 5. Docker Swarm

Entre a la líder con la IP pública de `swarm-1`:

```bash
ssh -i pokeneas-key.pem ec2-user@IP_PUBLICA_SWARM_1
```

Dentro de `swarm-1`:

```bash
sudo docker --version
sudo docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')
sudo docker swarm join-token manager
```

El último comando imprime una línea `docker swarm join --token SWMTKN-... IP:2377`. Cópiela y salga con `exit`.

Repita esto con la IP pública de `swarm-2`, `swarm-3` y `swarm-4`, anteponiendo `sudo` a la línea copiada:

```bash
ssh -i pokeneas-key.pem ec2-user@IP_PUBLICA_SWARM_2
sudo docker swarm join --token SWMTKN-... IP:2377
exit
```

Vuelva a entrar a `swarm-1` y ejecute:

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
  --env IMAGES_BASE_URL=https://NOMBRE_DEL_BUCKET.s3.us-east-1.amazonaws.com \
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

Deben aparecer varios ids. Luego, en el navegador, use la IP pública de cualquier instancia, con `http://` y no `https://`:

- `http://IP/api/pokenea`: JSON con id, nombre, altura, habilidad y `contenedorId`.
- `http://IP/pokenea`: imagen, frase e id del contenedor.

Recargue con F5 y el id irá cambiando.

**Pantallazo 3 del taller:** `/pokenea` con dos ids de contenedor diferentes. **Acceso a la APP:** la IP pública de `swarm-1`.

El id de la app es el de `sudo docker ps` en cada nodo, no la columna `ID` de `docker service ps` (esa es la tarea de Swarm).

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El push falla con `refusing to allow an OAuth App to create or update workflow` | Falta el scope: `gh auth refresh -h github.com -s workflow` |
| Falla el job `publish` en GitHub Actions | Secretos mal escritos o token sin permiso de escritura. Corríjalos y ejecute `gh run rerun --failed` |
| `AccessDenied` o `UnauthorizedOperation` en CloudShell | Su usuario no tiene permiso para esa acción. Pida acceso al docente o use otra cuenta |
| `put-bucket-policy` responde `AccessDenied` por acceso público | Block Public Access está activo a nivel de cuenta. Desactívelo en **S3 > Block Public Access settings for this account** |
| `InvalidParameterValue` con `t3.small` | La cuenta no permite ese tipo. Cambie `InstanceType` a `t3.micro` |
| `docker: command not found` en una instancia | Aún no termina la instalación. Espere un minuto y reintente |
| `service ls` se queda en `0/10` | Vea el error con `sudo docker service ps pokeneas --no-trunc`. Suele ser un nombre de imagen errado o un repositorio privado |
| La página carga pero sin imagen | `IMAGES_BASE_URL` errada o bucket no público. Corrija con `sudo docker service update --env-add IMAGES_BASE_URL=URL pokeneas` |
| `join` se queda esperando | Faltan las reglas 2377, 7946 o 4789 en el Security Group |
| El navegador no abre la IP | Use `http://`, no `https://`, y confirme la regla del puerto 80 |
| Tras subir código nuevo sigue la versión vieja | `sudo docker service update --force --image TU_USUARIO/pokeneas:latest pokeneas` |

## Costos

Las instancias generan costo mientras estén encendidas. No las apague antes de la sustentación: al apagarlas cambia la IP pública. En AWS Academy las instancias se detienen al terminar la sesión del laboratorio, así que inicie el laboratorio antes de sustentar y verifique la IP.

Después de la nota, borre todo desde CloudShell:

```bash
export AWS_REGION=us-east-1
IDS=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=swarm-*" "Name=instance-state-name,Values=running,stopped" --query 'Reservations[].Instances[].InstanceId' --output text)
aws ec2 terminate-instances --instance-ids $IDS
aws ec2 wait instance-terminated --instance-ids $IDS
aws ec2 delete-launch-template --launch-template-name pokeneas-template
aws ec2 delete-security-group --group-name pokeneas-swarm
aws ec2 delete-key-pair --key-name pokeneas-key
aws s3 rb s3://NOMBRE_DEL_BUCKET --force
```
