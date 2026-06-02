# Migração Supabase

## DATABASE_URL correta

Use o Session Pooler do Supabase, porta `5432`:

```text
postgres://postgres.PROJECT_REF:SENHA@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Se a senha tiver `@`, substitua por `%40`.

Não use:

- `localhost`
- `127.0.0.1`
- `https://xxxx.supabase.co`
- `postgres://postgres:SENHA@db.PROJECT_REF.supabase.co:5432/postgres`

O host direto `db.PROJECT_REF.supabase.co` pode exigir IPv6 e não é o recomendado para este projeto.

## Setup

1. Copie `.env.example` para `.env` e configure as variáveis reais.
2. Rode `npm install`.
3. Valide a conexão com `npm run supabase:check`.
4. Execute as migrations com `npm run api:migrate`.
5. Crie os acessos iniciais com `npm run api:seed:access`.

O comando `npm run supabase:setup` executa validação, migration deploy e bootstrap em sequência.

## Bootstrap

Usuários criados:

- `admin@salespromoters.local` / `Admin@123`
- `supervisor@salespromoters.local` / `Supervisor@123`

Use `BOOTSTRAP_RESET_PASSWORDS=true` apenas quando quiser redefinir as senhas desses usuários para os valores padrão.

## Vercel

API:

- Root Directory: `apps/api`
- Framework Preset: `Other`
- Build Command: vazio no painel
- Install Command: vazio no painel
- Output Directory: vazio no painel

O arquivo `apps/api/vercel.json` define `installCommand`, `buildCommand`, rota catch-all para `api/index.js` e inclui `dist` na função serverless.

Painel:

- Configure `VITE_API_BASE_URL=https://URL-DA-API`
- Publique no Vercel ou Netlify usando `npm run build:web`
