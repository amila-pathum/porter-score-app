# Porter: Deployment

Porter runs as two stateless containers plus PostgreSQL:

| Component | Image | Port | Notes |
|---|---|---|---|
| `web` | `porter-client/Dockerfile` (nginx) | 80 | Serves the SPA and reverse-proxies `/api` and `/health` to the API (`API_UPSTREAM`, default `http://api:8080`) |
| `api` | `server/Dockerfile` (ASP.NET Core 10) | 8080 | Runs as a non-root user. Health: `/health/live`, `/health/ready` |
| `db` | PostgreSQL 17 (managed service recommended) | 5432 | Persistent storage |

Only `web` needs to be public. Terminate HTTPS in front of it (a platform load balancer, Caddy, Traefik, Cloudflare, etc.).

## Production checklist

| Setting | Value |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` (image default) |
| `ConnectionStrings__Postgres` | Managed PostgreSQL connection string (use `SSL Mode=Require` where offered) |
| `Jwt__SigningKey` | A secret of at least 32 random characters, e.g. `openssl rand -base64 48`. Store it in the platform's secret manager. Rotating it logs everyone out. |
| `App__PublicUrl` | `https://your-domain`, used in password-reset links |
| `Auth__SecureCookies` | `true` (the image default outside Development) |
| `Email__Smtp__Host`, `Port`, `Username`, `Password`, `From` | An SMTP provider for password-reset emails. Without it, reset links are only written to the API log. |
| `Database__MigrateOnStartup` | `true` for a single API instance. For several instances, run migrations as a release step instead (below) and leave this `false`. |
| `Seed__DemoData` | `false`. Never seed demo data in production. |
| `Https__Redirect` | `true` only if the API itself receives HTTPS. Usually TLS ends at the proxy, and forwarded headers are honoured. |
| `OpenApi__Enabled` | `false` unless you want public API docs |
| `RateLimiting__AuthPermitPerMinute` | Keep the default (10) or lower |

Logs are JSON on stdout in non-Development environments. Ship them with your platform's log collector.

## Option A: single host with Docker Compose

Suitable for a small VPS:

```bash
git clone <repo> porter && cd porter
cp .env.example .env
# edit .env: strong POSTGRES_PASSWORD and JWT_SIGNING_KEY, PUBLIC_URL=https://porter.example.com,
#            SECURE_COOKIES=true, SEED_DEMO_DATA=false
docker compose up -d --build
```

Put a TLS-terminating reverse proxy (e.g. Caddy: `porter.example.com { reverse_proxy 127.0.0.1:8080 }`) in front of the `web` port. Back up the `porter-db` volume (or use `pg_dump` on a schedule).

## Option B: container platform + managed PostgreSQL

Works on any platform that runs containers (Azure Container Apps, AWS ECS/App Runner, Google Cloud Run, Fly.io, Render, Railway, …):

1. Create a managed PostgreSQL 17 database.
2. Build and push the images (for example to GitHub Container Registry):
   ```bash
   docker build -t ghcr.io/<you>/porter-api:<sha> ./server
   docker build -t ghcr.io/<you>/porter-web:<sha> ./porter-client
   docker push ghcr.io/<you>/porter-api:<sha> && docker push ghcr.io/<you>/porter-web:<sha>
   ```
3. Deploy `porter-api` as an **internal** service with the environment from the checklist.
4. Deploy `porter-web` as the **public** service with `API_UPSTREAM=http://<internal-api-host>:8080`.
5. Point your domain at `porter-web`. HTTPS is provided by the platform.

If you must host the SPA on a different origin from the API (e.g. a static host plus a separate API domain), set `Cors__AllowedOrigins__0=https://app.example.com`. The refresh cookie's `SameSite=Strict` then needs both hosts to share a registrable domain (e.g. `app.example.com` and `api.example.com`). Same-origin via nginx is the recommended setup.

## Database migrations as a release step

Generate an idempotent SQL script in CI and apply it before rolling out new API instances:

```bash
cd server
dotnet ef migrations script --idempotent -p src/Porter.Infrastructure -s src/Porter.Infrastructure -o migrate.sql
psql "$DATABASE_URL" -f migrate.sql
```

Migrations are additive. Roll the API back only to a version compatible with the current schema.

## Smoke test after deploy

```bash
curl -fsS https://porter.example.com/health/ready     # "Healthy"
curl -fsSI https://porter.example.com/ | grep -i content-security-policy
```

Then register an account, create a two-player game and save Deal 1.
