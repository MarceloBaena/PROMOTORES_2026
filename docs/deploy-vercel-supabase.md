# Deploy Vercel + Supabase do Zero

Este roteiro assume que o Supabase ja existe e nao deve ser apagado. O objetivo e recriar GitHub e Vercel com nomes limpos, sem herdar links antigos.

## 1. GitHub

Repositorio oficial:

```text
https://github.com/MarceloBaena/PROMOTORES_2026.git
```

Comandos locais:

```bash
git remote add origin https://github.com/MarceloBaena/PROMOTORES_2026.git
git push -u origin main
```

Se `origin` ja existir apontando para outro lugar:

```bash
git remote set-url origin https://github.com/MarceloBaena/PROMOTORES_2026.git
git push -u origin main
```

Antes do push, confira:

```bash
git status
git remote -v
```

O `git status` precisa estar limpo ou conter apenas alteracoes que voce realmente quer publicar.

## 2. Supabase

No Supabase, mantenha o projeto atual. Voce vai precisar de duas informacoes:

- `DATABASE_URL` para runtime da API no Vercel
- senha do banco

Para ambiente serverless, prefira a connection string com pooler do Supabase quando disponivel. Depois de configurar a URL no Vercel, rode as migrations a partir da sua maquina local:

```bash
npm run db:generate
npm run db:deploy
```

Rode seed apenas se quiser recriar usuarios e dados demonstrativos:

```bash
npm run db:seed
```

Credenciais seed deste projeto:

```text
admin@formula.local / Admin@123
supervisor@formula.local / Supervisor@123
promotor.centro@formula.local / Promotor@123
promotor.leste@formula.local / Promotor@123
```

## 3. Vercel API

Crie um projeto novo no Vercel:

```text
Nome: promotores-2026-api
Repositorio: MarceloBaena/PROMOTORES_2026
Root Directory: apps/api
Framework Preset: Other
Node.js Version: 22.x
```

Variaveis de ambiente de Production:

```env
NODE_ENV=production
DATABASE_URL=COLE_A_URL_DO_SUPABASE
JWT_ACCESS_SECRET=COLOQUE_UM_SEGREDO_FORTE
JWT_REFRESH_SECRET=COLOQUE_OUTRO_SEGREDO_FORTE
JWT_ACCESS_EXPIRES_IN_SECONDS=900
JWT_REFRESH_EXPIRES_IN_SECONDS=2592000
CORS_ORIGIN=https://promotores-2026-web.vercel.app
STORAGE_DRIVER=local
STORAGE_BUCKET=promotor-prod
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_PUBLIC_BASE_URL=
```

Depois do primeiro deploy, teste:

```bash
curl https://promotores-2026-api.vercel.app/api/auth/login
```

O `GET` pode responder erro de metodo. Para login, teste com `POST` pelo painel ou Postman.

## 4. Vercel Web

Crie outro projeto no Vercel:

```text
Nome: promotores-2026-web
Repositorio: MarceloBaena/PROMOTORES_2026
Root Directory: apps/web
Framework Preset: Next.js
Node.js Version: 22.x
```

Variavel de ambiente de Production:

```env
NEXT_PUBLIC_API_BASE_URL=https://promotores-2026-api.vercel.app/api
```

O painel usa `/backend-api` como proxy interno. Por isso, no navegador voce acessa o web e ele chama a API sem depender de `localhost`.

## 5. Ordem Segura

1. Subir codigo no GitHub.
2. Criar projeto API no Vercel.
3. Colocar envs da API no Vercel.
4. Rodar `npm run db:deploy` localmente apontando para Supabase.
5. Rodar `npm run db:seed` somente se precisar dos usuarios demo.
6. Fazer deploy da API.
7. Testar login da API.
8. Criar projeto Web no Vercel.
9. Configurar `NEXT_PUBLIC_API_BASE_URL`.
10. Fazer deploy do Web.
11. Testar login no painel.

## 6. Diagnostico Rapido

- `401` no login: usuario/senha nao existem no banco usado pela API ou seed nao foi rodado.
- `404` no login: frontend esta apontando para URL base errada da API.
- `500` na API: conferir `DATABASE_URL`, migrations e logs do Vercel.
- Erro de CORS: incluir o dominio do web em `CORS_ORIGIN`.
- Login funciona na API e falha no painel: conferir `NEXT_PUBLIC_API_BASE_URL` no projeto web.

## 7. Nao Fazer

- Nao colocar `.env` no GitHub.
- Nao apagar o projeto Supabase se os dados devem ser preservados.
- Nao misturar API de um repositorio antigo com web deste repositorio.
- Nao usar `localhost` em variavel do Vercel.
