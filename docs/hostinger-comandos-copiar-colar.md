# Hostinger KVM 4 - comandos copiar e colar

Use este roteiro depois de criar o VPS e apontar os dominios para o IP do servidor.

Exemplo usado abaixo:

- painel: `app.seudominio.com`
- API: `api.seudominio.com`

Troque pelos seus dominios reais antes de executar.

## 1. Entrar no VPS

```bash
ssh root@IP_DO_VPS
```

## 2. Preparar servidor

```bash
mkdir -p /opt
cd /opt
git clone URL_DO_SEU_GITHUB promotorpro
cd /opt/promotorpro
chmod +x deploy/scripts/*.sh
sudo bash deploy/scripts/hostinger-bootstrap.sh
```

## 3. Criar arquivos de ambiente

```bash
cd /opt/promotorpro
cp .env.compose.example .env
cp .env.api.production.example .env.api.production
cp .env.web.production.example .env.web.production
```

## 4. Ajustar ambiente do Compose

```bash
nano /opt/promotorpro/.env
```

Troque pelo menos:

- `POSTGRES_PASSWORD`
- `API_PORT` se quiser porta diferente da `3000`
- `WEB_PORT` se quiser porta diferente da `8080`

## 5. Editar ambiente da API

```bash
nano /opt/promotorpro/.env.api.production
```

Cole este modelo:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://promotorpro:<DB_PASSWORD>@postgres:5432/promotorpro?schema=public
DATABASE_URL_MODE=standard
JWT_ACCESS_SECRET=<JWT_ACCESS_SECRET>
JWT_REFRESH_SECRET=<JWT_REFRESH_SECRET>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=https://app.seudominio.com,https://api.seudominio.com
UPLOAD_DRIVER=local
UPLOAD_BASE_URL=https://api.seudominio.com
STARTUP_DATABASE_SETUP=false
BOOTSTRAP_RESET_PASSWORDS=false
BOOTSTRAP_MULTI_COMPANY_DEMO=false
```

## 6. Validar e subir containers

```bash
cd /opt/promotorpro
./deploy/scripts/preflight.sh
./deploy/scripts/deploy.sh
```

## 7. Instalar configuracao do Nginx

```bash
sudo bash /opt/promotorpro/deploy/scripts/install-nginx-site.sh app.seudominio.com api.seudominio.com
```

## 8. Gerar HTTPS

```bash
sudo certbot --nginx -d app.seudominio.com -d api.seudominio.com
sudo systemctl status certbot.timer
```

## 9. Testar funcionamento

```bash
curl -I https://app.seudominio.com
curl https://api.seudominio.com/health
docker compose -f /opt/promotorpro/docker-compose.prod.yml ps
```

## 10. Fazer backup diario

```bash
crontab -e
```

Cole:

```cron
0 2 * * * /opt/promotorpro/deploy/scripts/backup-postgres.sh >> /var/log/promotorpro-backup.log 2>&1
```

## 11. Deploy das proximas versoes

```bash
cd /opt/promotorpro
./deploy/scripts/preflight.sh
./deploy/scripts/deploy.sh
```

## 12. Rollback se der problema

Veja os backups:

```bash
ls -lah /opt/promotorpro/backups/predeploy
ls -lah /opt/promotorpro/backups/postgres
```

Restaurar backup compactado:

```bash
cd /opt/promotorpro
./deploy/scripts/restore-postgres.sh /opt/promotorpro/backups/postgres/ARQUIVO.sql.gz
```

Rollback com dump predeploy:

```bash
cd /opt/promotorpro
./deploy/scripts/rollback.sh /opt/promotorpro/backups/predeploy/ARQUIVO.sql
```

## 13. Gerar APK Flutter apontando para a API do VPS

No seu computador com Flutter:

```bash
cd C:\Promotor\apps\mobile_flutter
flutter pub get
flutter analyze
flutter build apk --release --dart-define=API_BASE_URL=https://api.seudominio.com
```

Saida esperada:

```text
build\app\outputs\flutter-apk\app-release.apk
```

## 14. Checklist final

- painel abre em HTTPS
- API responde `status: ok`
- login web funciona
- login mobile funciona
- sync mobile envia visitas
- fotos aparecem na retaguarda
- heartbeat aparece no acompanhamento do dia
- backup diario fica gerando arquivo
