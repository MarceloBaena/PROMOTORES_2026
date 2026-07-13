# Sales Promoters

Monorepo para painel web, API Express serverless no Vercel, app mobile Expo/React Native offline-first, novo app mobile Flutter e pacote compartilhado TypeScript.

## Fonte unica oficial

Use `C:\Promotor` como repositorio local oficial do projeto.

Nao use nomes alternativos ou copias paralelas como `C:\Projeto-Promotor`, `Projeto-Promotor` ou qualquer outra pasta fora de `C:\Promotor` para novas correcoes, deploy ou APK. O sistema considera apenas `C:\Promotor` como base oficial. Manter duas pastas ativas apontando para o mesmo GitHub faz web, API e mobile ficarem fora de sincronia.

Guia detalhado: `docs/fonte-unica.md`.

## Workspaces

- `apps/api` - Express, Prisma ORM, PostgreSQL/Supabase, JWT e rotas protegidas.
- `apps/web` - React, Vite, TailwindCSS, React Router, lucide-react e mapa operacional com Leaflet.
- `apps/mobile` - app Android Expo/React Native para operacao offline do promotor.
- `apps/mobile_flutter` - app Android Flutter offline-first para operacao de campo.
- `packages/shared` - constantes e tipos compartilhados.
- `docs` - guias operacionais.

## Multiempresa / filiais

O sistema possui cadastro de `Empresas/Filiais` para uso comercial com separacao de dados entre clientes.

- Administrador geral: usuario `ADMIN` sem empresa vinculada. Pode cadastrar empresas/filiais e escolher a empresa em cadastros operacionais.
- O painel web agora possui seletor global de empresa para o `ADMIN` geral no header. Quando uma empresa ativa e selecionada, dashboard, mapa, auditoria, visitas, relatórios e listagens operacionais passam a consultar somente o contexto dessa empresa.
- Quando o `ADMIN` geral deixa o seletor em branco, a API continua permitindo visao consolidada nas telas que suportam consolidacao.
- Usuario de empresa: usuario com `companyId`. Enxerga somente clientes, promotores, supervisores, rotas, visitas, mapa, auditorias, importacoes e relatorios da propria empresa.
- Cada empresa/filial tem codigo numerico sequencial, nome, CNPJ opcional, contato, telefone, e-mail, endereco, numero, bairro, cidade, UF e situacao.
- Clientes possuem codigo sequencial por empresa/filial, permitindo `0001` em empresas diferentes sem misturar dados.
- Fornecedores sao cadastrados por empresa/filial e podem ser vinculados a varios clientes.
- Categorias de produtos sao cadastradas por empresa/filial e podem ser vinculadas a um ou mais fornecedores.
- Atividades do cliente sao cadastradas por empresa/filial e podem ser vinculadas a um ou mais clientes.
- Clientes aceitam varios fornecedores em `supplierIds`, e a importacao CSV aceita a coluna opcional `fornecedores`/`suppliers` com itens separados por ponto e virgula.
- Clientes aceitam varias atividades em `activityIds`, e a importacao CSV aceita a coluna opcional `atividades`/`activities` com itens separados por ponto e virgula.
- Fornecedores aceitam varias categorias em `categoryIds`, facilitando classificacao comercial e filtros futuros.
- Antes de publicar em producao, rode `npm run api:migrate` para aplicar as migrations de empresas, fornecedores, categorias, atividades e vinculos operacionais.

## Escopo de empresa na API

- Usuarios com `companyId` sempre operam presos a essa empresa, mesmo que tentem enviar outro `companyId` no body, query ou header.
- `ADMIN` geral pode enviar `x-company-id` para operar em uma empresa ativa especifica sem alterar os contratos atuais.
- Se o `x-company-id` for invalido, inexistente ou apontar para empresa inativa, a API retorna erro explicito.
- O app mobile continua usando o `companyId` do usuario autenticado no token e nao depende do seletor global do painel web.

## Scripts principais

```bash
npm install
npm run build:shared
npm run api:build
npm run api:migrate
npm run api:seed:access
npm run api:check:tenant
npm run supabase:check
npm run supabase:setup
npm run build:web
npm run mobile:typecheck
```

## Bootstrap multiempresa de demonstracao

Por padrao, `npm run api:seed:access` cria apenas:

- administrador global `admin@salespromoters.local`
- supervisor base `supervisor@salespromoters.local`
- empresa base do sistema

O pacote de demonstracao multiempresa ficou opcional para nao poluir producao acidentalmente.

Para gerar duas empresas demo completas com supervisor, promotor, telefone, categorias, fornecedores, atividades e clientes vinculados:

```powershell
$env:BOOTSTRAP_MULTI_COMPANY_DEMO="true"
$env:BOOTSTRAP_RESET_PASSWORDS="true"
npm run api:seed:access
npm run api:check:tenant
Remove-Item Env:BOOTSTRAP_MULTI_COMPANY_DEMO -ErrorAction SilentlyContinue
Remove-Item Env:BOOTSTRAP_RESET_PASSWORDS -ErrorAction SilentlyContinue
```

Usuarios demo criados quando `BOOTSTRAP_MULTI_COMPANY_DEMO=true`:

- `supervisor.formula@salespromoters.local` / `Supervisor@123`
- `promotor.formula@salespromoters.local` / `Promotor@123`
- `supervisor.norte@salespromoters.local` / `Supervisor@123`
- `promotor.norte@salespromoters.local` / `Promotor@123`

Observacoes:

- O seed multiempresa nao cria visitas nem rotas publicadas, para nao sujar dashboard e auditoria.
- O app mobile continua preso a empresa do usuario autenticado no token.
- O painel web do administrador geral continua podendo alternar a empresa pelo seletor global.

Configure `DATABASE_URL` com o Session Pooler do Supabase na porta `5432`. Nunca use `localhost`, `https://...supabase.co` ou o host direto `db.PROJECT_REF.supabase.co` como `DATABASE_URL`.

Web e mobile devem apontar para a mesma API:

```bash
# Web local:
VITE_API_BASE_URL=http://localhost:3000

# Mobile:
EXPO_PUBLIC_API_BASE_URL=https://promotores-2026-api.vercel.app
```

Em producao, o painel web usa `/api` no mesmo dominio e o Vercel reescreve para `https://promotores-2026-api.vercel.app`. Isso evita falhas de CORS/cache entre painel e API.

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
npx vercel build --prod --yes --project promotores-2026-api --local-config vercel.api.json
npx vercel deploy --prebuilt --prod --yes --project promotores-2026-api --local-config vercel.api.json
```

Observacao importante da API no Vercel:

- O comando `npm run api:build` agora prepara automaticamente `api/dist` e `api/prisma`.
- A funcao serverless publicada em `api/index.js` carrega o bundle compilado a partir de `api/dist/serverless.js`.
- Se a API voltar a exibir `API_BOOT_FAILED`, refaca exatamente o fluxo `vercel build --prod` seguido de `vercel deploy --prebuilt --prod`.

Deploy do painel web:

```bash
vercel link --yes --project promotores-2026 --scope marcelobaenas-projects
vercel --prod --yes
```

URLs de producao:

- Web: `https://promotores-2026.vercel.app`
- API: `https://promotores-2026-api.vercel.app`
- Health da API: `https://promotores-2026-api.vercel.app/health`

## App mobile Android offline-first

O app em `apps/mobile` foi preparado em Expo/React Native para instalacao em Android e operacao offline depois do primeiro login.

## Roteirizacao por periodo

Cada rota agora possui `data inicial` e `data final`.

- O cadastro de roteirizacao no painel grava a janela operacional completa da rota.
- O dashboard considera como "visitas de hoje" apenas o que pertence a rotas ativas na janela do dia e teve movimento no periodo atual.
- O snapshot mobile e o mapa ao vivo passam a considerar a janela da rota para decidir o que ainda esta valido para operacao.
- Rotas antigas continuam funcionando porque o sistema usa `scheduledDate` como legado e preenche `start_date`/`end_date` automaticamente via migration.

Fluxo offline:

- Primeiro login precisa de internet para autenticar e baixar o snapshot do roteiro em `GET /mobile/snapshot`.
- O app salva sessao, clientes, roteiro, visitas, fotos, fila de sync e logs em SQLite local.
- O fluxo atual da loja e: `check-in -> fornecedores do cliente -> foto antes do fornecedor -> respostas operacionais -> foto depois do fornecedor -> fotos extras -> checkout da visita`.
- Cada visita pode ter varias `SupplierExecution`, uma para cada fornecedor vinculado ao cliente.
- Check-in, execucao por fornecedor, fotos extras, anotacoes e checkout funcionam sem internet.
- Fotos sao copiadas para o armazenamento local do app antes de entrar na fila.
- A visita so encerra com check-in e, quando existir fornecedor concluido, com respostas obrigatorias e fotos antes/depois desse fornecedor.
- Quando a internet voltar, a fila local reenvia visita, execucoes de fornecedor e fotos com `clientGeneratedId`, sem duplicar no backend.

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

Comandos principais:

```bash
cd apps/mobile_flutter
flutter pub get
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://promotores-2026-api.vercel.app
```

Em Windows, se o projeto estiver em pasta com caracteres especiais ou acentos e o Gradle/CMake falhar, copie temporariamente para um caminho simples como `C:\PromotorFlutterWork` antes do build.

## Contratos operacionais e auditoria

Os contratos oficiais de status/tipos ficam em `packages/shared` e devem permanecer alinhados com o Prisma em `apps/api/prisma/schema.prisma`.

- Status de visita: `pending`, `in_progress`, `completed`, `not_completed`, `canceled`.
- Status de execucao de fornecedor: `pending`, `in_progress`, `completed`, `skipped`.
- Fotos do fluxo legado: `checkin`, `before`, `after`.
- Fotos do fluxo atual: `checkin`, `supplier_before`, `supplier_after`, `leaflet`, `gondola`, `display`, `island`, `promotional_material`, `checkout`, `store_extra`, `occurrence_extra`.
- Ocorrencias: `store_closed`, `manager_absent`, `rupture`, `no_stock`, `price_issue`, `competitor_action`, `other`.
- Auditoria automatica: `GPS_MISSING`, `OUTSIDE_GEOFENCE`, `MISSING_REQUIRED_PHOTO`, `TOO_FAST_VISIT`, `TOO_LONG_VISIT`, `INCONSISTENT_FINISH`, `SYNC_FAILURE`, `POSSIBLE_DUPLICATE_PHOTO`, `SUPPLIER_MISSING_BEFORE_PHOTO`, `SUPPLIER_MISSING_AFTER_PHOTO`, `SUPPLIER_MISSING_DELIVERY_RESPONSE`, `SUPPLIER_MISSING_REPLENISHMENT_RESPONSE`, `SUPPLIER_MISSING_STOCKOUT_RESPONSE`, `SUPPLIER_TOO_FAST`, `CHECKOUT_WITH_PENDING_SUPPLIER`.

A API recalcula auditorias pelo servico `apps/api/src/services/visit-audit.ts` sempre que uma visita ou foto e recebida. As flags podem ser resolvidas manualmente pela retaguarda em `PATCH /audit/:id/resolve`, registrando usuario, data e observacao.

## Mapa ao vivo

O painel web possui a rota `/mapa` para visualizar a ultima posicao operacional dos promotores.

O dashboard inicial tambem possui um mapa visivel com os promotores em campo, usando basemap real de ruas e rastro recente de posicoes.

Regras de seguranca:

- O promotor so envia localizacao pelo endpoint `POST /locations/heartbeat`.
- O backend aceita heartbeat somente se o usuario for `PROMOTOR` e tiver visita `in_progress` ou roteiro `PUBLISHED` agendado para o dia.
- Admin e supervisor visualizam o mapa pelo endpoint `GET /locations/live`.
- Nao existe rastreamento fora da jornada ativa.

Fluxo atual do mapa:

- O app mobile envia heartbeat em primeiro plano quando ha atendimento ativo ou roteiro publicado em janela operacional valida.
- Durante visita em andamento, o heartbeat e mais frequente para dar sensacao de acompanhamento em tempo quase real.
- O endpoint `GET /locations/live` entrega ultima posicao, status do sinal e trilha recente para desenhar o rastro no painel web.
- O mapa web usa Leaflet com tiles publicos e mostra promotores conectados, ultima posicao e linha recente da rota.
