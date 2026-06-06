# Fonte unica do projeto

## Projeto oficial

Use somente este repositorio local para desenvolvimento, deploy e geracao de APK:

```powershell
cd C:\Promotor
```

Este monorepo contem as tres partes do sistema:

- `apps/api`: backend Express/Prisma conectado ao Supabase.
- `apps/web`: painel web administrativo.
- `apps/mobile`: app Expo/React Native offline-first para Android.

## Projetos duplicados encontrados

Foram encontradas duas bases locais apontando para o mesmo GitHub:

- `C:\Promotor`
- `C:\Users\Marcelo Baena\OneDrive - 浮光浅夏\Área de Trabalho\Projeto-Promotor`

Isso causa bug operacional porque uma tela pode ser corrigida em uma pasta enquanto o navegador, Vercel ou APK usam outra.

## API unica

Web e mobile devem conversar com a mesma API:

```text
https://promotores-2026-api.vercel.app
```

Configuracoes:

- Web: `VITE_API_BASE_URL`
- Mobile: `EXPO_PUBLIC_API_BASE_URL`
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
