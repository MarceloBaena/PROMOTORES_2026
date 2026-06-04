# Sales Promoters

Monorepo npm workspaces para painel web, API Express serverless no Vercel, pacote compartilhado TypeScript e base mobile.

## Workspaces

- `apps/api` - Express, Prisma ORM, PostgreSQL/Supabase, JWT e rotas protegidas.
- `apps/web` - React 18, Vite, TailwindCSS, React Router e lucide-react.
- `apps/mobile` - base inicial para evolução mobile.
- `packages/shared` - constantes e tipos compartilhados.
- `docs` - guias operacionais.

## Scripts principais

```bash
npm install
npm run build:shared
npm run api:build
npm run api:migrate
npm run api:seed:access
npm run supabase:check
npm run supabase:setup
npm run build:web
```

Configure `DATABASE_URL` com o Session Pooler do Supabase na porta `5432`. Nunca use `localhost`, `https://...supabase.co` ou o host direto `db.PROJECT_REF.supabase.co` como `DATABASE_URL`.

## Deploy Vercel

O projeto usa dois projetos no Vercel:

- Web/painel: `promotores-2026`, usando `vercel.json`.
- API: `promotores-2026-api`, usando `vercel.api.json`.

Antes do deploy, valide:

```bash
npm run supabase:check
npm run api:migrate
npm run build
```

Deploy da API:

```bash
vercel link --yes --project promotores-2026-api --scope marcelobaenas-projects
vercel --prod --yes --local-config vercel.api.json
```

Deploy do painel web:

```bash
vercel link --yes --project promotores-2026 --scope marcelobaenas-projects
vercel env add VITE_API_BASE_URL production --force --yes --value "https://promotores-2026-api.vercel.app"
vercel --prod --yes
```

URLs de produção:

- Web: `https://promotores-2026.vercel.app`
- API: `https://promotores-2026-api.vercel.app`
- Health da API: `https://promotores-2026-api.vercel.app/health`

## Mapa ao vivo

O painel web possui a rota `/mapa` para visualizar a última posição operacional dos promotores.

Regras de segurança:

- O promotor só envia localização pelo endpoint `POST /locations/heartbeat`.
- O backend aceita heartbeat somente se o usuário for `PROMOTOR` e tiver visita `in_progress`.
- Admin e supervisor visualizam o mapa pelo endpoint `GET /locations/live`.
- Não existe rastreamento fora da jornada ativa.

O app mobile base inclui `apps/mobile/src/locationHeartbeat.ts`, que prepara o envio da posição quando o app Expo/React Native estiver integrado ao GPS do aparelho.
