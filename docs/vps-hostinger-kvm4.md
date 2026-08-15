# Deploy PromotorPro em VPS Hostinger KVM 4

Este guia assume:

- Ubuntu 24.04 LTS no VPS
- dominio `app.seudominio.com` para o painel
- dominio `api.seudominio.com` para a API
- repositório clonado em `/opt/promotorpro`

## 1. Recursos recomendados do KVM 4

- 4 vCPU
- 16 GB RAM
- 200 GB NVMe
- Banco PostgreSQL local sem exposicao publica

Essa capacidade atende bem a fase atual do PromotorPro, desde que as fotos crescam com controle e o backup seja externo ao VPS.

## 2. Pacotes do servidor

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git curl unzip jq ufw fail2ban
systemctl enable docker
systemctl start docker
```

Ou, se quiser automatizar o primeiro preparo da VPS:

```bash
sudo bash deploy/scripts/hostinger-bootstrap.sh
```

## 3. Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Nao abra `5432` publicamente.

## 4. Clonar o projeto

```bash
mkdir -p /opt
cd /opt
git clone <URL_DO_REPOSITORIO> promotorpro
cd /opt/promotorpro
```

## 5. Arquivos de ambiente

```bash
cp .env.compose.example .env
cp .env.api.production.example .env.api.production
cp .env.web.production.example .env.web.production
```

Edite `.env.api.production`:

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

O arquivo `.env` do Compose pode comecar assim:

```env
POSTGRES_DB=promotorpro
POSTGRES_USER=promotorpro
POSTGRES_PASSWORD=<DB_PASSWORD>
```

## 6. Subir a stack

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d
```

## 7. Nginx

Copie o modelo:

```bash
cp deploy/nginx/promotorpro.vps.conf /etc/nginx/sites-available/promotorpro.conf
ln -s /etc/nginx/sites-available/promotorpro.conf /etc/nginx/sites-enabled/promotorpro.conf
nginx -t
systemctl reload nginx
```

Antes disso, troque `app.seudominio.com` e `api.seudominio.com` pelos dominios reais.

## 8. HTTPS

Depois que o DNS estiver apontando para o VPS:

```bash
certbot --nginx -d app.seudominio.com -d api.seudominio.com
systemctl status certbot.timer
```

## 9. Health checks

```bash
curl -I https://app.seudominio.com
curl https://api.seudominio.com/health
docker compose -f docker-compose.prod.yml ps
```

## 10. Deploy de novas versoes

```bash
chmod +x deploy/scripts/*.sh
./deploy/scripts/preflight.sh
./deploy/scripts/deploy.sh
```

Esse script:

- atualiza o codigo
- faz backup preventivo
- builda imagens
- sobe postgres
- aplica migrations Prisma
- sobe api e web
- valida `/health`

O `preflight.sh` valida:

- docker
- docker compose
- nginx
- `.env`
- `.env.api.production`
- sintaxe do `docker-compose.prod.yml`

## 11. Backup diario

Crie a cron:

```bash
crontab -e
```

Exemplo:

```cron
0 2 * * * /opt/promotorpro/deploy/scripts/backup-postgres.sh >> /var/log/promotorpro-backup.log 2>&1
```

## 12. Restore

```bash
./deploy/scripts/restore-postgres.sh /opt/promotorpro/backups/postgres/promotorpro-AAAAMMDD-HHMMSS.sql.gz
```

## 13. Build do APK Flutter em producao

```bash
cd /opt/promotorpro/apps/mobile_flutter
flutter pub get
flutter analyze
flutter build apk --release --dart-define=API_BASE_URL=https://api.seudominio.com
```

## 14. Checklist final

- painel abre em HTTPS
- API responde `/health`
- login web funciona
- login mobile funciona
- sync mobile envia visitas
- fotos aparecem na retaguarda
- heartbeat chega no acompanhamento do dia
- backup gera arquivo valido
