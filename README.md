# Check-in HUB — Cloudflare Pages + Supabase

**Stack**
- Frontend: `/public/index.html` (HTML + JS)
- API (Functions): `/functions/api/ping.js` e `/functions/api/checkin.js` (sem `@supabase/supabase-js`, via REST)
- DB: Supabase (Postgres) — tabelas `escalados_dia` e `checkins`

## Deploy (Cloudflare Pages)
1. Crie um projeto _Full-Stack_ conectado ao seu repositório.
2. Configurações de build:
   - Framework preset: **None**
   - Build command: **(vazio)**
   - Build output directory: **public**
   - Root directory: **/**
3. **Environment Variables** (Settings → Environment variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (chave **service_role** — manter privada)
   - `LAT_BASE`, `LNG_BASE`, `RADIUS_KM`, `MIN_ACCURACY_OK`
4. Deploy e teste:
   - `/api/ping` → `{"ok":true,"msg":"pong"}`
   - `/` → página HTML do check-in

## Regras de negócio
- Apenas **1 check-in por ID** no dia.
- **Mesmo aparelho** não pode registrar para **outro ID** no mesmo dia.
- **Geofence**: raio padrão `1 km` (ajustável por env).
