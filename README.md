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
