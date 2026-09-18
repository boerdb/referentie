# Referentie — productie op Next-server (192.168.1.32)

**Repo:** `git@github.com:boerdb/referentie.git`  
**Pad:** `/var/www/referentie`  
**PM2:** `referentie` · poort **3023**

Zelfde werkwijze als IC-support (`C:\DEV\IC-support\docs\DEPLOY.md`, `support-next` op poort 3014).

## Eerste keer (DB + env + deploy)

```powershell
cd C:\DEV\referentie
pip install paramiko   # eenmalig
python scripts/deploy_setup.py
```

Dit script:

- voert `sql/schema.sql` uit op MariaDB **192.168.1.14**
- maakt user `referentie` (default wachtwoord via `DB_PASS`, anders `kerkpoort`)
- schrijft `/var/www/referentie/.env.local` op **.32**
- clone + `scripts/deploy.sh` + PM2

## Update (lokaal → server)

```powershell
cd C:\DEV\referentie
npm run deploy
```

Of alleen op de server:

```bash
ssh root@192.168.1.32
cd /var/www/referentie
bash scripts/deploy.sh
```

Handmatig:

```bash
cd /var/www/referentie
git pull origin main
npm ci
npm run build
pm2 restart referentie --update-env
```

## Omgevingsvariabelen

Op de server laadt PM2 `.env.local` via `ecosystem.config.cjs`.

```bash
cp .env.example .env.local
nano .env.local
```

Minimaal: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET` (min. 32 tekens).

## Cloudflare Tunnel (voorbeeld)

```yaml
  - hostname: referentie.jouwdomein.nl
    service: http://127.0.0.1:3023
```

Test:

```bash
curl -I http://127.0.0.1:3023/
curl -s http://127.0.0.1:3023/api/health/redis
pm2 logs referentie
```

## Overrides (optioneel)

`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PASSWORD`, `DB_HOST`, `DB_USER`, `DB_PASS`
