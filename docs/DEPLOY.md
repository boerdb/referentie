# Referentie deployen

Zelfde infrastructuur als **med-track-pwa** en **news-app**.

## Architectuur

| Onderdeel | Host | Details |
|-----------|------|---------|
| Next.js | NEXT `192.168.1.32` | `/var/www/referentie`, poort **3020** |
| MariaDB | DB `192.168.1.14` | database `referentie` |
| Redis | DB `192.168.1.14` | `redis://192.168.1.14:6379` |

```
Browser/PWA → Cloudflare Tunnel (optioneel) → Next.js :3020 → MariaDB + Redis op .14
```

## 1. MariaDB (phpMyAdmin / root op .14)

```bash
# sql/schema.sql uitvoeren, daarna app-user:
CREATE USER 'referentie'@'%' IDENTIFIED BY 'sterk-wachtwoord';
GRANT SELECT, INSERT, UPDATE, DELETE ON referentie.* TO 'referentie'@'%';
FLUSH PRIVILEGES;
```

Lokaal testen: `npm run db:init` (met `DATABASE_URL` in `.env.local`).

## 2. Omgevingsvariabelen op de server

```bash
cp /var/www/referentie/.env.example /var/www/referentie/.env.local
nano /var/www/referentie/.env.local
```

Minimaal:

```env
DATABASE_URL=mysql://referentie:...@192.168.1.14:3306/referentie
REDIS_URL=redis://192.168.1.14:6379
AUTH_SECRET=<openssl rand -base64 32>
REGISTRATION_OPEN=true
UPLOAD_DIR=./data/pdfs
NODE_ENV=production
```

## 3. GitHub + server (aanbevolen)

Repo: `git@github.com:boerdb/referentie.git`, branch **main**.

### Eerste keer op de server

```bash
ssh root@192.168.1.32
mkdir -p /var/www && cd /var/www
git clone git@github.com:boerdb/referentie.git referentie
cd referentie
cp .env.example .env.local && nano .env.local
npm ci && npm run build
pm2 start npm --name referentie -- start
pm2 save
```

### Updates (methode A — git pull op server)

```bash
cd /var/www/referentie
git pull origin main
npm ci
npm run build
pm2 restart referentie --update-env
```

### Updates (methode B — vanaf Windows)

```powershell
cd C:\DEV\referentie
$env:DEPLOY_PASS="..."   # SSH-wachtwoord NEXT-server
npm run deploy
```

Het script doet `git pull`, `npm ci`, `build` en `pm2 restart referentie`. Bestaande `.env.local` blijft staan.

## 4. Cloudflare Tunnel (optioneel)

```yaml
ingress:
  - hostname: referentie.jouwdomein.nl
    service: http://127.0.0.1:3020
```

## 5. Controle

```bash
curl -s http://127.0.0.1:3020/api/health/redis
pm2 logs referentie --lines 30
```
