# Deploying the Zonash storefront to your own server

The Lovable project contains two apps against one backend:

| Surface | Where it runs | Who uses it |
| --- | --- | --- |
| **Storefront** (`/`, `/products`, `/cart`, `/checkout`, `/step/*`, OTP flow) | your server (this guide) | customers |
| **Dashboard** (`/admin/*`) | stays in Lovable | staff |

Both talk to the same Supabase database and the same WooCommerce store, so
orders placed on your server appear in the Lovable dashboard immediately. No
data migration is involved.

---

## 1. Create the storefront repo

Connect this project to GitHub (chat **+** menu → GitHub → Connect project),
then in a clone of that repo:

```bash
node scripts/strip-admin.mjs          # dry run — review the list
node scripts/strip-admin.mjs --apply  # delete staff-only code
bun install && bun run build          # must pass before you deploy
git commit -am "storefront-only build"
```

The script refuses to delete anything if a customer-facing file still imports a
staff-only module, so it can't silently break the storefront. Keep it in the
repo — re-run it after each sync from Lovable.

## 2. Configure environment

```bash
cp .env.example .env   # then fill in every value
```

Two things to get right:

- **`CUSTOMER_SESSION_SECRET`** signs the customer phone-session cookie. Generate
  once (`openssl rand -hex 32`) and never change it — rotating it logs every
  customer out and invalidates in-flight OTP sessions.
- **WooCommerce credentials.** On your own server the app talks to WooCommerce
  **directly** (`WC_STORE_URL` + `WC_CONSUMER_KEY` + `WC_CONSUMER_SECRET`,
  Read/Write, from WooCommerce → Settings → Advanced → REST API). Direct mode is
  preferred automatically when those three are set, so the deploy has no runtime
  dependency on Lovable infrastructure. Leave them unset only if you deliberately
  want to keep routing through the Lovable connector gateway.

`VITE_*` values are compiled into the browser bundle, so they must be present at
**build** time — `docker-compose` passes them through as build args.

## 3. Run

```bash
docker compose up -d --build
docker compose logs -f storefront
```

The container serves plain HTTP on `127.0.0.1:3000`. Put nginx, Caddy, or Traefik
in front for TLS, HTTP/2, and gzip/brotli — do **not** expose port 3000 publicly.

Minimal nginx server block:

```nginx
server {
  listen 443 ssl http2;
  server_name zonash.com;

  ssl_certificate     /etc/letsencrypt/live/zonash.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/zonash.com/privkey.pem;

  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
  }

  # Immutable hashed assets — cache hard.
  location /assets/ {
    proxy_pass http://127.0.0.1:3000;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
```

`X-Forwarded-For` matters: rate limiting, velocity/abuse scoring, and the IP
stored on each order all read the client IP from that header. Without it every
customer looks like one IP and the abuse limits will start rejecting real orders.

## 4. Point WooCommerce at the new host

Update the webhook URLs in WooCommerce → Settings → Advanced → Webhooks to
`https://<your-domain>/api/public/woo-webhook`, keeping the same
`WC_WEBHOOK_SECRET`. Signatures are verified per request, so a wrong secret
fails closed rather than accepting unverified payloads.

## 5. Capacity notes

Sized for the ~2,000 orders/day target:

- One container handles the load comfortably; scale by raising `replicas` and
  round-robining in nginx. The app keeps no in-process session state, so
  instances are interchangeable.
- WooCommerce read caching (single-flight coalescing + micro-cache) is
  **per instance**. Off Cloudflare there is no shared edge cache, so each extra
  replica multiplies origin reads on cold caches. Two to four replicas is the
  sweet spot before a shared cache (Redis/Varnish) is worth adding.
- Order writes, OTP, rate limits, and abuse counters are all Postgres-backed and
  therefore already shared and correct across replicas.
- Set `--memory=1g` per instance (already in `docker-compose.yml`) and watch RSS
  after a traffic spike; the caches are bounded, so steady state should sit well
  under it.

## Security checklist before going live

- [ ] `.env` is `chmod 600`, owned by root, and not in git
- [ ] TLS enforced; HTTP redirects to HTTPS
- [ ] Port 3000 bound to loopback only (firewall verified)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` present only in `.env` on the server
- [ ] `CUSTOMER_SESSION_SECRET` is 32+ random bytes and backed up
- [ ] WooCommerce REST keys are Read/Write and scoped to a dedicated user
- [ ] Webhook secret matches on both sides
- [ ] `node scripts/strip-admin.mjs` applied — no `/admin` or `/auth` on the public host
- [ ] `docker compose logs` clean of config warnings on boot
