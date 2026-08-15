# Sales Promoters

Monorepo para painel web, API Express serverless no Vercel, app mobile Expo/React Native offline-first, novo app mobile Flutter e pacote compartilhado TypeScript.

## Fonte unica oficial

Use `C:\Promotor` como repositorio local oficial do projeto.

Existe uma copia antiga em `Projeto-Promotor`; ela nao deve ser usada para novas correcoes, deploy ou APK. Manter duas pastas ativas apontando para o mesmo GitHub faz web, API e mobile ficarem fora de sincronia.

Guia detalhado: `docs/fonte-unica.md`.

## Workspaces

- `apps/api` - Express, Prisma ORM, PostgreSQL/Supabase, JWT e rotas protegidas.
- `apps/web` - React, Vite, TailwindCSS, React Router e lucide-react.
- `apps/mobile` - app Android Expo/React Native para operacao offline do promotor.
- `apps/mobile_flutter` - app Android Flutter offline-first para operacao de campo.
- `packages/shared` - constantes e tipos compartilhados.
- `docs` - guias operacionais.

## Multiempresa / filiais

O sistema possui cadastro de `Empresas/Filiais` para uso comercial com separacao de dados entre clientes.

- Administrador geral: usuario `ADMIN` sem empresa vinculada. Pode cadastrar empresas/filiais e escolher a empresa em cadastros operacionais.
- Usuario de empresa: usuario com `companyId`. Enxerga somente clientes, promotores, supervisores, rotas, visitas, mapa, auditorias, importacoes e relatorios da propria empresa.
- Cada empresa/filial tem codigo numerico sequencial, nome, CNPJ opcional, contato, telefone, e-mail, endereco, numero, bairro, cidade, UF e situacao.
- Clientes possuem codigo sequencial por empresa/filial, permitindo `0001` em empresas diferentes sem misturar dados.
- Antes de publicar em producao, rode `npm run api:migrate` para criar a tabela `companies` e os campos `company_id`.

## Cadastros operacionais

- `Categorias de produtos`: organizam o sortimento e a cobertura comercial dos fornecedores.
- `Atividades`: definem o que a equipe executa no ponto de venda.
- `Fornecedores`: concentram as categorias e as atividades que devem aparecer no atendimento de cada cliente. O cadastro do fornecedor permite selecionar atividades existentes e criar novas atividades no mesmo formulario.
- `Clientes`: recebem automaticamente os fornecedores ativos da empresa/filial para padronizar a visita no app mobile.

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
npm run mobile:typecheck
```

O backend suporta dois modos explicitos de banco:

- `DATABASE_URL_MODE=standard` para PostgreSQL comum, inclusive em Docker/VPS. Este agora e o modo padrao quando a variavel nao for definida.
- `DATABASE_URL_MODE=supabase_pooler` para Supabase Session Pooler na porta `5432`.

Regras da validacao:

- aceita Supabase Pooler e PostgreSQL comum de VPS
- rejeita `http://` e `https://`
- rejeita `localhost`, `127.0.0.1` e loopback por padrao para evitar erro de container separado do banco
- rejeita placeholders como `PROJECT_REF`, `SENHA`, `PASSWORD`, `USUARIO`, `HOST-POOLER-SUPABASE` e `REGION`
- exige usuario, senha, host e nome do banco
- nunca imprime a senha nas mensagens de erro

Se usar Supabase, nunca use `localhost`, `https://...supabase.co` ou o host direto `db.PROJECT_REF.supabase.co` como `DATABASE_URL`.

Se usar PostgreSQL em Docker Compose, use o nome do servico, por exemplo `postgres`. Se a API estiver em container e o banco em outro container, nao use `localhost`.

Web e mobile devem apontar para a mesma API:

```bash
VITE_API_BASE_URL=https://promotores-2026-api.vercel.app
EXPO_PUBLIC_API_BASE_URL=https://promotores-2026-api.vercel.app
```

Para VPS com Nginx fazendo proxy do painel para a API, o web pode usar:

```bash
VITE_API_BASE_URL=/api
```

## Deploy Vercel

O projeto usa dois projetos no Vercel:

- Web/painel: `promotores-2026`, usando `vercel.json`.
- API: `promotores-2026-api`, usando `vercel.api.json`.

Antes do deploy, valide:

```bash
npm run supabase:check
npm run api:migrate
npm run build
npm run mobile:typecheck
```

Deploy da API:

```bash
vercel link --yes --project promotores-2026-api --scope marcelobaenas-projects
npm run api:deploy:prod
```

O script `api:deploy:prod` limpa `.vercel/output`, gera o prebuilt da API com `vercel.api.json`, remove a pasta estatica antiga e publica somente o bundle correto da API. Isso evita o erro `API failed to load its serverless bundle` e impede que o dominio da API sirva HTML antigo do painel web.

Deploy do painel web:

```bash
vercel link --yes --project promotores-2026 --scope marcelobaenas-projects
vercel env add VITE_API_BASE_URL production --force --yes --value "https://promotores-2026-api.vercel.app"
vercel --prod --yes
```

URLs de producao:

- Web: `https://promotores-2026.vercel.app`
- API: `https://promotores-2026-api.vercel.app`
- Health da API: `https://promotores-2026-api.vercel.app/health`

## App mobile Android offline-first

O app em `apps/mobile` foi preparado em Expo/React Native para instalacao em Android e operacao offline depois do primeiro login.

Fluxo offline:

- Primeiro login precisa de internet para autenticar e baixar o snapshot do roteiro em `GET /mobile/snapshot`.
- O app salva sessao, clientes, roteiro, visitas, fotos, fila de sync e logs em SQLite local.
- Check-in, foto before, foto after, anotacoes e encerramento funcionam sem internet.
- Fotos sao copiadas para o armazenamento local do app antes de entrar na fila.
- A visita so encerra com check-in, before e after.
- Quando a internet voltar, a fila local reenvia visita e fotos com `clientGeneratedId`, sem duplicar no backend.

Comandos mobile:

```bash
npm run mobile:typecheck
npm run mobile:start
npm run mobile:prebuild:android
npm run mobile:android
```

Para gerar APK de teste via EAS:

```bash
cd apps/mobile
npx eas build -p android --profile preview
```

Se for build local, a maquina precisa ter Android Studio/Android SDK configurado. Se for build EAS, precisa login em uma conta Expo.

## App mobile Flutter

O app em `apps/mobile_flutter` e a nova base Flutter do aplicativo de campo.

Ele usa os mesmos contratos da API existente:

- `POST /auth/login`
- `GET /mobile/snapshot`
- `POST /visits`
- `PUT /visits/:id`
- `POST /visits/:id/photos/base64`
- `POST /locations/heartbeat`

Captura de camera no Flutter:

- A captura foi migrada para camera interna do proprio app.
- O fluxo nao depende mais da abertura do aplicativo externo de camera do Android.
- Em aparelhos gerenciados por MDM, isso reduz falhas de `Intent` ao abrir check-in, categoria, atividade, foto antes, foto depois e check-out.
- O app valida permissao da camera, trata bloqueio permanente e orienta abrir as configuracoes do Android quando necessario.

Comandos principais:

```bash
cd apps/mobile_flutter
flutter pub get
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://promotores-2026-api.vercel.app
```

Em Windows, se o projeto estiver em pasta com caracteres especiais ou acentos e o Gradle/CMake falhar, copie temporariamente para um caminho simples como `C:\PromotorFlutterWork` antes do build.

## Mapa ao vivo

O painel web possui a rota `/mapa` para visualizar a ultima posicao operacional dos promotores.

Regras de seguranca:

- O promotor so envia localizacao pelo endpoint `POST /locations/heartbeat`.
- O backend aceita heartbeat somente se o usuario for `PROMOTOR` e tiver visita `in_progress` ou roteiro `PUBLISHED` agendado para o dia.
- Admin e supervisor visualizam o mapa pelo endpoint `GET /locations/live`.
- Nao existe rastreamento fora da jornada ativa.

O app mobile envia heartbeat em primeiro plano quando ha atendimento ativo: app aberto, promotor logado, GPS permitido e jornada operacional autorizada.

## Deploy em VPS Hostinger KVM 4

O repositorio agora possui uma base de deploy para VPS com Docker:

- `.env.compose.example`
- `Dockerfile.api`
- `Dockerfile.web`
- `docker-compose.prod.yml`
- `.env.api.production.example`
- `.env.web.production.example`
- `deploy/nginx/promotorpro.vps.conf`

Arquitetura recomendada:

- `web` em container Nginx interno na porta `127.0.0.1:8080`
- `api` em container Node na porta `127.0.0.1:3000`
- `postgres` em rede Docker privada, sem exposicao publica
- `nginx` no host como reverse proxy para `app.seudominio.com` e `api.seudominio.com`

Passo a passo resumido:

```bash
cp .env.compose.example .env
cp .env.api.production.example .env.api.production
cp .env.web.production.example .env.web.production
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d
```

Depois disso:

1. Ajuste o DNS do dominio para o IP do VPS.
2. Instale Nginx no host.
3. Copie `deploy/nginx/promotorpro.vps.conf` para `/etc/nginx/sites-available/promotorpro.conf`.
4. Ajuste os dominios reais.
5. Gere HTTPS com Certbot.

Exemplo de build do APK Flutter apontando para a API do VPS:

```bash
cd apps/mobile_flutter
flutter build apk --release --dart-define=API_BASE_URL=https://api.seudominio.com
```

Scripts operacionais:

- `deploy/scripts/deploy.sh`
- `deploy/scripts/rollback.sh`
- `deploy/scripts/backup-postgres.sh`
- `deploy/scripts/restore-postgres.sh`

Guia completo do VPS:

- `docs/vps-hostinger-kvm4.md`
- `docs/hostinger-comandos-copiar-colar.md`

Script para instalar o site do Nginx ja com os dominios:

- `deploy/scripts/install-nginx-site.sh`

Observacao sobre scripts:

- `npm run api:migrate` funciona com Supabase ou PostgreSQL VPS, desde que `DATABASE_URL` e `DATABASE_URL_MODE` estejam corretos.
- `npm run supabase:check` e `npm run supabase:setup` foram mantidos por compatibilidade de nome, mas agora validam a conexao configurada no ambiente atual, seja Supabase ou PostgreSQL VPS.
