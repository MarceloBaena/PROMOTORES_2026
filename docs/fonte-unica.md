# Fonte unica do projeto

## Projeto oficial

Use somente este repositorio local para desenvolvimento, deploy e geracao de APK:

```powershell
cd C:\Promotor
```

Este e o unico caminho oficial do sistema. Qualquer outra pasta local deve ser tratada apenas como copia paralela e nao pode ser usada para web, API, mobile, deploy ou APK.

Este monorepo contem as partes oficiais do sistema:

- `apps/api`: backend Express/Prisma conectado ao Supabase.
- `apps/web`: painel web administrativo.
- `apps/mobile`: app Expo/React Native offline-first para Android.
- `apps/mobile_flutter`: app Flutter offline-first para Android.

## Regra de validacao

Considere sempre esta regra:

- caminho oficial do projeto: `C:\Promotor`
- qualquer outro caminho local: copia paralela, fora da operacao oficial

Se houver diferenca visual entre tela, deploy ou APK, a primeira verificacao deve ser se o comando foi executado em `C:\Promotor`.

## API unica

Web e mobile devem conversar com a mesma API:

```text
https://promotores-2026-api.vercel.app
```

Configuracoes:

- Web: `VITE_API_BASE_URL`
- Mobile Expo: `EXPO_PUBLIC_API_BASE_URL`
- Mobile Flutter: `API base URL` configurada no app
- API: `CORS_ORIGIN`, `DATABASE_URL`, `UPLOAD_BASE_URL`

## Comandos de validacao

Antes de deploy ou build de APK:

```powershell
npm run supabase:check
npm run api:migrate
npm run build
npm run mobile:typecheck
```

## Regra pratica

Se a tela no navegador nao mudou, confira primeiro se voce abriu o projeto certo:

```powershell
cd C:\Promotor
git status
```
