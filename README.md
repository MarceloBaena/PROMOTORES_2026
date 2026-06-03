# Projeto Promotor

Monorepo em TypeScript estrito para acompanhamento operacional de promotores de vendas, com backend NestJS, portal web Next.js para admin, supervisor e promotor, base mobile Expo mantida para paridade operacional, PostgreSQL via Prisma, JWT com refresh token, storage local/S3 compativel e contratos compartilhados.

## Estrutura

```text
.
|-- apps
|   |-- api
|   |-- android-kotlin
|   |-- mobile
|   `-- web
|-- packages
|   |-- config
|   |-- types
|   |-- ui
|-- docker-compose.yml
|-- package.json
`-- tsconfig.base.json
```

Guia direto de deploy:

- [Deploy Passo a Passo](C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/docs/deploy-passo-a-passo.md)
- [Deploy do Painel no Netlify](C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/docs/deploy-netlify.md)

### Apps

- `apps/api`: API NestJS com Prisma, JWT, auditoria, uploads e modulos de dominio
- `apps/android-kotlin`: base Android nativa offline-first com Kotlin, Compose, Room, DataStore, WorkManager, CameraX e GPS
- `apps/web`: portal web Next.js + TypeScript para admin, supervisor e promotor
- `apps/mobile`: app React Native com Expo + TypeScript mantido para fluxos mobile e validacoes especificas

### Packages compartilhados

- `packages/types`: tipos, schemas Zod e utilitarios de dominio compartilhados
- `packages/config`: leitura segura de ambiente
- `packages/ui`: labels e tokens leves compartilhados

Regras de arquitetura aplicadas aos contratos:

- `packages/types` e a fonte de verdade para status, enums operacionais e contratos compartilhados entre API, web e mobile
- `apps/api` nao deve depender de DTO para regras de dominio; status operacionais ficam em modulos de dominio reutilizaveis
- `apps/web` e `apps/mobile` devem consumir contratos compartilhados antes de criar unions locais duplicadas

## Modulos de dominio do backend

Estrutura em `apps/api/src`:

- `auth`
- `users`
- `promoters`
- `customers`
- `collaborators`
- `route-plans`
- `visits`
- `photos`
- `checklists`
- `gps`
- `alerts`
- `audit`

Tambem permanecem os modulos operacionais e de infraestrutura:

- `operations`
- `supervisor`
- `prisma`
- `storage`
- `common`

## Stack

- Monorepo com npm workspaces
- TypeScript estrito
- Backend: NestJS + Prisma + PostgreSQL
- Web: Next.js + TypeScript
- Mobile: Expo + React Native + TypeScript
- Auth: JWT + refresh token
- Storage dev: MinIO local via Docker ou filesystem local
- Qualidade: ESLint, Prettier, typecheck, testes e build

## Requisitos

- Node.js 22+
- npm 10+
- Docker Desktop ou outro daemon Docker ativo para subir PostgreSQL e MinIO localmente

## Variaveis de ambiente

Arquivos de exemplo incluidos:

- `apps/api/.env.example`
- `apps/api/.env.docker.example`
- `apps/web/.env.local.example`
- `apps/mobile/.env.example`

### API

- `JWT_ACCESS_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- `JWT_ACCESS_EXPIRES_IN_SECONDS=900`
- `JWT_REFRESH_EXPIRES_IN_SECONDS=2592000`
- `AUTH_RATE_LIMIT_WINDOW_MS=60000`
- `AUTH_RATE_LIMIT_MAX_ATTEMPTS=5`
- `CUSTOMER_IMPORT_JOB_POLL_INTERVAL_MS=2000`
- `CUSTOMER_IMPORT_JOB_MAX_ATTEMPTS=3`
- `CUSTOMER_IMPORT_JOB_RETRY_DELAY_MS=10000`

Modo filesystem local:

- `STORAGE_DRIVER=local`

Modo S3 local com MinIO:

- `STORAGE_DRIVER=s3`
- `STORAGE_BUCKET=promotor-dev`
- `STORAGE_ENDPOINT=http://localhost:9000`
- `STORAGE_ACCESS_KEY=minio`
- `STORAGE_SECRET_KEY=minio123`
- `STORAGE_PUBLIC_BASE_URL=http://localhost:9000`

Oracle somente leitura para Winthor:

- `WINTHOR_ORACLE_ENABLED=false`
- `WINTHOR_ORACLE_MODE=thin`
- `WINTHOR_ORACLE_CLIENT_LIB_DIR=`
- `WINTHOR_ORACLE_CONNECT_STRING=`
- `WINTHOR_ORACLE_USER=`
- `WINTHOR_ORACLE_PASSWORD=`
- `WINTHOR_ORACLE_POOL_MIN=0`
- `WINTHOR_ORACLE_POOL_MAX=4`
- `WINTHOR_ORACLE_POOL_INCREMENT=1`
- `WINTHOR_ORACLE_POOL_TIMEOUT_SECONDS=60`
- `WINTHOR_ORACLE_QUEUE_TIMEOUT_MS=5000`
- `WINTHOR_ORACLE_STATEMENT_TIMEOUT_MS=15000`
- `WINTHOR_ORACLE_STATEMENT_CACHE_SIZE=30`
- `WINTHOR_ORACLE_FETCH_ARRAY_SIZE=200`
- `WINTHOR_ORACLE_CUSTOMERS_QUERY=SELECT ...`

Observacoes da integracao Oracle:

- usar usuario somente leitura com privilegio minimo
- em bancos legados, `WINTHOR_ORACLE_MODE=thick` exige Oracle Client instalado e `WINTHOR_ORACLE_CLIENT_LIB_DIR` configurado
- a query configurada deve ser apenas `SELECT`
- se a query usar `:changedSince`, o adaptador envia esse bind automaticamente

### Web

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3333/api`

Para deploy do painel no Netlify, troque para a URL publica real da API, por exemplo:

- `NEXT_PUBLIC_API_BASE_URL=https://api.seudominio.com/api`

### Mobile

- `EXPO_PUBLIC_API_BASE_URL=http://localhost:3333/api`

Para aparelho fisico em desenvolvimento, use o IP local da maquina que roda a API, por exemplo:

- `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.11:3333/api`

Se esse IP mudar, o valor precisa ser atualizado antes de abrir no Expo Go ou gerar um novo APK.

## Dominio de dados

Modelagem Prisma principal em `apps/api/prisma/schema.prisma`.

### Entidades principais

- `Company`
- `User`
- `Promoter`
- `Customer`
- `CustomerImportBatch`
- `CustomerImportItem`
- `CustomerSchedule`
- `RoutePlan`
- `RoutePlanItem`
- `RouteTemplate`
- `RouteTemplateItem`
- `RouteChangeLog`
- `Notification`
- `Visit`
- `VisitPhoto`
- `ChecklistTemplate`
- `ChecklistQuestion`
- `VisitChecklist`
- `VisitChecklistAnswer`
- `GpsLog`
- `Alert`
- `VisitStatusHistory`
- `AuditLog`
- `RefreshToken`

### Entidade de apoio operacional

- `Journey`: jornada ativa do promotor. Ela foi mantida como entidade de apoio porque as regras de negocio exigem rastreamento operacional apenas durante a jornada ativa. `GpsLog` pertence a uma `Journey`.

### Diagrama textual

```text
Company
|- User
|  |- RefreshToken
|  `- AuditLog (ator)
|- Promoter (1:1 com User, mesmo id)
|  |- RoutePlan
|  |  |- RoutePlanItem
|  |  |  `- Visit (1:1 por item do roteiro)
|  |  |     |- VisitPhoto
|  |  |     |- VisitChecklist
|  |  |     |  `- VisitChecklistAnswer
|  |  |     |- VisitStatusHistory
|  |  |     `- Alert
|  |  `- Journey
|  |     |- GpsLog
|  |     `- Visit
|  `- Alert
|- Customer
|  |- CustomerSchedule
|  |- RoutePlanItem
|  |- Visit
|  |- VisitPhoto
|  `- Alert
`- ChecklistTemplate
   `- ChecklistQuestion
      `- VisitChecklistAnswer
```

### Regras de modelagem aplicadas

- Timestamps padrao em todas as entidades persistentes
- `active` onde faz sentido operacionalmente
- `deletedAt` para soft delete em cadastros mestres
- Enums fortes para papeis, status, tipos e severidades
- Indices para consultas por data, promotor, cliente, checklist e status
- Cascade apenas em filhos tecnicos e seguros, como `GpsLog`, `VisitChecklist`, `VisitChecklistAnswer`, `VisitPhoto`, `VisitStatusHistory` e `RefreshToken`
- Integridade relacional entre roteiro, jornada, visita, checklist, fotos, alertas e auditoria

## Setup local

### 1. Instalar dependencias

```bash
npm install
```

O `postinstall` compila os packages compartilhados para garantir que `api`, `web` e `mobile` subam sem imports quebrados.

### 2. Preparar `.env` da API para o banco local

No Windows PowerShell:

```powershell
Copy-Item apps/api/.env.docker.example apps/api/.env
```

### 3. Subir infraestrutura local

```bash
npm run infra:up
```

Servicos esperados:

- PostgreSQL: `localhost:5432`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

Para derrubar:

```bash
npm run infra:down
```

### 4. Subir o portal web com validacao de CSS

Para evitar estado em que o HTML sobe mas o bundle de estilos fica dessintonizado do `.next`, use:

```bash
npm run web:start:stable
```

Esse comando:

- encerra a instancia anterior do frontend na porta `3000`
- sobe o `@promotor/web` novamente
- valida que o HTML inicial referencia um stylesheet valido
- confirma que o bundle CSS contem as classes base do login, shell autenticado e workspace do promotor

### 4. Gerar Prisma, aplicar migration e popular seed

```bash
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:seed
```

Para reset completo do banco local de desenvolvimento:

```bash
npm run db:reset
```

## Modulo de clientes e importacao

O painel administrativo/supervisor agora possui um modulo completo de clientes em `/dashboard/customers`, com:

- cadastro manual de clientes na base local
- importacao por `CSV` como caminho funcional principal
- parser CSV robusto com UTF-8/UTF-8 BOM, autodeteccao de `,`, `;` e `TAB`, trim de cabecalhos e preview por lote
- sanitizacao profunda antes de persistir lotes, removendo `BOM`, `\u0000`, surrogates UTF-16 invalidos e caracteres de controle problematicos
- estrutura desacoplada para integracao futura com Winthor/Oracle
- staging em `CustomerImportItem` antes de qualquer gravacao final em `Customer`
- processamento assincrono por job, com fila, retry e observabilidade por lote
- historico de lotes com itens, conflitos, erros e rastreabilidade
- prevencao de duplicidade por `customer_code`, `winthor_customer_code` e `cnpj`
- elegibilidade operacional canonica por `status = ACTIVE`, `active = true` e `deletedAt = null`, usada na listagem, na busca para roteiros e na reativacao manual de clientes

### Integracao Winthor

- A camada de integracao fica em `apps/api/src/customers/winthor-customer.gateway.ts`
- O contrato atual e somente leitura e exposto como `WinthorAdapter`
- A conexao Oracle isolada fica em `apps/api/src/customers/oracle-readonly.service.ts`
- O processamento em background fica em `apps/api/src/customers/customers-import.processor.ts`
- Nada e escrito no banco de producao do ERP
- O lote e sempre persistido e auditado antes do processamento final
- Enquanto o adaptador real nao for configurado, o sistema registra o lote como indisponivel e orienta o uso do fluxo CSV/Excel

### Arquitetura do lote

- `POST /customers/import/csv` faz parse do arquivo, grava cada linha no staging e enfileira o lote
- o preview do CSV informa delimitador detectado, cabecalhos normalizados, linhas validas, linhas com erro e detalhes por linha
- quando o arquivo vier com codificacao/texto invalido, o backend retorna erro claro orientando a salvar o CSV em UTF-8 antes de reenviar
- staging e atualizacao de `CustomerImportItem` sao persistidos em chunks curtos para suportar milhares de linhas sem transacao interativa longa
- `POST /customers/import/winthor` e `POST /customers/sync/winthor` consultam o `WinthorAdapter`, gravam staging local e enfileiram o processamento
- o worker assíncrono valida duplicidade, escopo, supervisor/promotor e coordenadas antes de gravar em `customers`
- nenhum cliente e removido automaticamente em sincronizacao
- lotes falhos guardam `lastError`, `attemptCount`, `nextRetryAt`, `durationMs` e resumo auditavel

### Endpoints de clientes

- `GET /customers`
- `GET /customers/:id`
- `POST /customers`
- `PUT /customers/:id`
- `PATCH /customers/:id/status`
- `POST /customers/import/csv`
- `POST /customers/import/winthor`
- `GET /customers/import/batches`
- `GET /customers/import/batches/:id`
- `GET /customers/import/batches/:id/items`
- `POST /customers/sync/winthor`

## Modulo de roteiros supervisoriais

O modulo de roteiros agora cobre planejamento diario, semanal e mensal com publicacao operacional para o promotor.

### Capacidades principais

- criacao manual de roteiros por dia, semana ou mes
- modelos recorrentes em `RouteTemplate` com itens reutilizaveis por promotor
- aplicacao de template em intervalo de datas com materializacao de roteiros reais em `RoutePlan`
- alteracao de sequencia, horario previsto, prioridade e observacao sem quebrar visitas existentes
- publicacao de roteiro com incremento de versao, notificacao ao promotor e historico auditavel
- cancelamento historico de itens removidos, sem apagar paradas ja concluidas
- sincronizacao de alteracoes para web e mobile quando o promotor reconecta

### Endpoints do modulo de roteiros

- `GET /api/route-plans`
- `GET /api/route-plans/today`
- `GET /api/route-plans/:id`
- `GET /api/route-plans/:id/history`
- `POST /api/route-plans`
- `POST /api/route-plans/batch`
- `PUT /api/route-plans/:id`
- `POST /api/route-plans/:id/publish`
- `DELETE /api/route-plans/:id`
- `GET /api/route-plans/templates`
- `GET /api/route-plans/templates/:id`
- `POST /api/route-plans/templates`
- `PUT /api/route-plans/templates/:id`
- `POST /api/route-plans/templates/:id/apply`
- `GET /api/route-plans/notifications`
- `POST /api/route-plans/notifications/:id/read`

### Regras aplicadas no modulo de roteiros

- o supervisor pode publicar roteiro diario, semanal ou mensal para qualquer promotor do seu escopo
- o roteiro do promotor exposto em `today` carrega versao, prioridade, proxima instrucao e alteracoes recentes
- itens retirados de uma rota publicada sao cancelados com historico, nunca apagados silenciosamente
- mudancas em cliente, sequencia, horario, prioridade e publicacao geram `RouteChangeLog`
- promotor recebe confirmacao visual quando a versao do roteiro muda ou quando chegam novas instrucoes
- se o promotor estiver offline, a rota mais recente volta a sincronizar assim que a conectividade for restabelecida

### 5. Validar leitura real do backend

```bash
npm run db:validate:runtime
```

Esse script sobe o contexto Nest, autentica com usuarios seed e valida leitura de:

- roteiro do promotor
- checklist ativo
- dashboard do supervisor

### 6. Subir os apps

Em terminais separados:

```bash
npm run dev:api
npm run dev:web
npm run dev:mobile
```

Observacao para Windows/OneDrive:

- `npm run dev:web` usa o modo webpack do Next para evitar falhas de arquivo bloqueado em `.next/dev` durante hot reload

Endpoints esperados:

- API: `http://localhost:3333/api`
- Uploads locais do backend: `http://localhost:3333/uploads`
- Web: `http://localhost:3000`
- Mobile: Expo dev server

Fluxo recomendado agora:

- admin, supervisor e promotor acessam `http://localhost:3000` pelo navegador
- no Android do promotor, o uso principal passa a ser pelo navegador do aparelho, com camera e localizacao liberadas
- `npm run dev:mobile` continua util para validacao do cliente Expo e cenarios offline avancados

## Seed inicial

Seed em `apps/api/prisma/seed.ts` cria:

- 1 empresa
- 1 admin: `admin@formula.local` / `Admin@123`
  - matricula `ADM-001`
  - regiao `Matriz`
- 1 supervisor: `supervisor@formula.local` / `Supervisor@123`
  - matricula `SUP-001`
  - regiao `Rondonopolis Centro`
- 2 promotores:
  - `promotor.centro@formula.local` / `Promotor@123`
  - `promotor.leste@formula.local` / `Promotor@123`
  - ambos com CPF, telefone, matricula, data de admissao, regiao e jornada padrao seed
- 10 clientes
- 10 agendas de cliente para o dia operacional corrente
- 1 template de checklist com 4 perguntas
- 1 roteiro de exemplo do dia com 10 itens para o promotor seed principal

## Autenticacao e autorizacao

Perfis ativos no sistema:

- `ADMIN`: acesso total, incluindo painel e rotas supervisionais
- `SUPERVISOR`: acesso ao painel web, dashboard, visitas, alertas, evidencias, clientes, roteiros supervisionais e cadastro de promotores do proprio escopo
- `PROMOTER`: acesso ao workspace operacional web `/workspace` e ao cliente Expo do proprio contexto quando necessario

### Protecao de rotas

- `GET /api/auth/me`: qualquer usuario autenticado
- `GET /api/supervisor/*`: `SUPERVISOR` e `ADMIN`
- `GET/POST/PUT/PATCH /api/collaborators*`: `ADMIN` e `SUPERVISOR`, com `SUPERVISOR` restrito ao proprio time de promotores
- `GET/POST/PUT /api/operations/*`: `PROMOTER`
- `apps/web/src/app/dashboard/*`: acesso resolvido pelo mesmo mapa de navegacao do dashboard, com `/dashboard/collaborators` liberado para `ADMIN` e `SUPERVISOR`; o supervisor enxerga e gerencia apenas promotores do proprio escopo
- `apps/web/src/app/workspace/*`: restrito a `PROMOTER`, com redirecionamento automatico de `ADMIN` e `SUPERVISOR` para `/dashboard`

### Persistencia de sessao

- Web: sessao em `sessionStorage`, com refresh automatico ao receber `401`
- Mobile: sessao em `expo-secure-store`, com fallback em memoria fora do runtime React Native e refresh automatico ao receber `401`
- Refresh token: armazenado com hash SHA-256 no banco, rotacionado no refresh e revogado no logout
- Senha: hash seguro com `bcrypt` e custo `12`

### Rate limit basico de auth

Buckets ativos:

- `login`: ate `5` tentativas por janela configuravel
- `refresh`: ate `10` tentativas por janela configuravel
- `logout`: ate `20` tentativas por janela configuravel

Chaves de limitacao consideram IP e, quando aplicavel, email normalizado.

### Endpoints de auth

#### `POST /api/auth/login`

Request:

```json
{
  "email": "supervisor@formula.local",
  "password": "Supervisor@123"
}
```

Response `201`:

```json
{
  "user": {
    "id": "cmn0uq3dv00049h2g1ditqphf",
    "email": "supervisor@formula.local",
    "name": "Supervisor Operacional",
    "role": "SUPERVISOR"
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

#### `POST /api/auth/refresh`

Request:

```json
{
  "refreshToken": "eyJ..."
}
```

Response `201`:

```json
{
  "user": {
    "id": "cmn0uq3dv00049h2g1ditqphf",
    "email": "supervisor@formula.local",
    "name": "Supervisor Operacional",
    "role": "SUPERVISOR"
  },
  "accessToken": "eyJ...novo",
  "refreshToken": "eyJ...novo"
}
```

#### `POST /api/auth/logout`

Request:

```json
{
  "refreshToken": "eyJ..."
}
```

Response `201`:

```json
{
  "success": true
}
```

#### `GET /api/auth/me`

Header:

```text
Authorization: Bearer eyJ...
```

Response `200`:

```json
{
  "id": "cmn0uq3dv00049h2g1ditqphf",
  "email": "supervisor@formula.local",
  "name": "Supervisor Operacional",
  "role": "SUPERVISOR"
}
```

### Formato padronizado de erro

Exemplo `401`:

```json
{
  "statusCode": 401,
  "path": "/api/auth/login",
  "error": "Unauthorized",
  "message": "Credenciais invalidas",
  "timestamp": "2026-03-21T22:00:00.000Z"
}
```

Exemplo `429`:

```json
{
  "statusCode": 429,
  "path": "/api/auth/login",
  "error": "Too Many Requests",
  "message": "Muitas tentativas em autenticacao. Tente novamente em 30s.",
  "timestamp": "2026-03-21T22:00:00.000Z"
}
```

## Nucleo operacional backend

Fluxos operacionais implementados no backend:

- jornada com inicio, encerramento e rastreamento apenas durante jornada ativa
- roteiro do dia do promotor logado, com ordem, sequencia e status por visita
- abertura da visita a partir do item do roteiro no check-in
- check-in com geofence, justificativa obrigatoria fora do raio do cliente e foto obrigatoria do estabelecimento
- fotos vinculadas a visita, cliente, promotor e horario real de captura
- check-out com validacao obrigatoria de foto do estabelecimento, 1 foto do antes e 1 foto do depois
- alertas operacionais deduplicados para eventos criticos

### Endpoints operacionais principais

- `POST /api/journeys/start`
- `POST /api/journeys/end`
- `GET /api/route-plans/today`
- `POST /api/visits/check-in`
- `POST /api/operations/visits/check-in-with-photo`
- `POST /api/visits/:id/check-out`
- `PUT /api/visits/:id/status`
- `PUT /api/visits/:id/notes`
- `GET /api/visits/:id`
- `GET /api/visits/today`
- `GET /api/checklists/template`
- `POST /api/visits/:id/checklist`
- `GET /api/alerts`
- `GET /api/dashboard/supervisor`

### Regras operacionais principais

- o rastreamento em `journey/track` so funciona com jornada ativa
- o check-in cria a visita real a partir do item do roteiro
- check-in fora da geofence exige justificativa operacional
- o fluxo web do promotor usa `operations/visits/check-in-with-photo` para exigir foto do estabelecimento antes de confirmar o check-in
- fotos `AFTER` so podem ser enviadas depois da foto `BEFORE`
- a visita nao conclui sem foto do estabelecimento no check-in, 1 foto `BEFORE` e 1 foto `AFTER`
- `GET /api/visits/today` lista o dia operacional do promotor com paginação, filtros e sequencia
- `PUT /api/visits/:id/status` aceita `EM_ATENDIMENTO`, `PARCIAL` e `NAO_REALIZADA`
- `CONCLUIDA` permanece responsabilidade do check-out, para preservar integridade do fechamento

### Categorias complementares de foto

Tipos operacionais:

- `BEFORE`
- `AFTER`

Categorias complementares persistidas:

- `CHECKIN_ESTABLISHMENT`
- `BEFORE_1`
- `BEFORE_2`
- `AFTER_1`
- `AFTER_2`
- `GENERAL`
- `SHELF`
- `DISPLAY`
- `PRICE_TAG`
- `STOCK`
- `OTHER`

### Alertas operacionais gerados

- `OUTSIDE_GEOFENCE`
- `RELEVANT_DELAY`
- `MISSING_BEFORE_PHOTO`
- `MISSING_AFTER_PHOTO`
- `MISSING_CHECKLIST`
- `PARTIAL_VISIT`
- `MISSED_VISIT`
- `SKIPPED_CUSTOMER`

Premissa aplicada nesta fase:

- atraso relevante foi considerado como check-in com `20` minutos ou mais apos o `plannedStartAt` do item do roteiro

## App mobile do promotor

Fluxos implementados no `apps/mobile`:

- design system operacional mobile com cards, badges, botoes e navegacao pensados para uso diario em campo
- refresh visual corporativo do mobile com cabecalhos fortes, cards densos, botoes grandes e leitura rapida para uso em rua e loja
- login persistente com refresh automatico de sessao
- resolucao automatica da URL da API no mobile usando `EXPO_PUBLIC_API_BASE_URL`, host do Expo em desenvolvimento e fallback para cenarios comuns de aparelho fisico e emulador Android
- diagnostico de login no proprio app, exibindo motivo do erro, status HTTP e URL da API quando a autenticacao falhar
- o cliente HTTP do mobile envia o cabecalho `bypass-tunnel-reminder` quando a API estiver em `loca.lt` ou `localtunnel.me`, evitando a pagina intersticial do tunel no consumo do app
- dashboard do dia com status da jornada, resumo do roteiro e atalhos operacionais
- atualizacao automatica do roteiro com versao, prioridade da proxima parada e aviso visual quando o supervisor republica a rota
- lista de clientes do dia com busca local e abertura do detalhe da visita
- detalhe da visita com trilha de etapas, proximo passo guiado e acoes rapidas sem poluir a tela
- telas dedicadas para check-in com foto do estabelecimento, foto do antes, foto do depois e encerramento do atendimento, com foco em poucos toques e leitura rapida
- hierarquia visual orientada por "onde estou, o que falta e qual o proximo toque", reduzindo ruido visual no fluxo do promotor
- fluxo principal endurecido no app e no backend: check-in com foto do estabelecimento, inicio do atendimento, foto do antes, execucao, foto do depois e encerramento
- avanco automatico nas etapas obrigatorias: check-in libera o inicio do atendimento, o inicio libera a foto do antes, a foto do antes libera a foto do depois e o encerramento retorna ao roteiro
- historico basico local das visitas ja executadas
- tela de sincronizacao com fila persistida, tentativas e erro por item
- bootstrap de sessao estabilizado para evitar loop de revalidacao no cold start do app
- promotor ativo sem roteiro do dia continua conseguindo abrir o app e recebe estado vazio operacional, sem travar o login

Posicionamento atual:

- para uso diario em Android, o caminho principal agora e o portal web em `apps/web`, acessado pelo navegador
- o workspace web do promotor cobre jornada, check-in, foto do estabelecimento, foto do antes, foto do depois, encerramento do atendimento e rastreio com geolocalizacao apenas durante jornada ativa
- o `apps/mobile` permanece no monorepo para compatibilidade, validacoes dedicadas do cliente Expo e cenarios offline avancados

### Comportamento offline no mobile

- o roteiro do dia, as visitas locais, a fila e os logs de sincronizacao continuam persistidos no storage local do app e sobrevivem ao fechamento/reabertura
- a sessao do usuario fica persistida em `expo-secure-store`
- fotos capturadas sao copiadas para armazenamento local duravel do app antes do upload
- a fila offline guarda `START_JOURNEY`, `TRACK_POINT`, `CHECK_IN`, `UPLOAD_PHOTO`, `SUBMIT_CHECKLIST`, `UPDATE_NOTES`, `CHECK_OUT` e `END_JOURNEY`
- cada item da fila recebe um `clientGeneratedId` estavel para reenvio seguro e confirmacao individual
- mutacoes de jornada e visita agora usam `POST /api/sync/push`, com resposta por item (`SYNCED` ou `FAILED`) e reconciliacao local apenas apos confirmacao do servidor
- uploads de foto continuam separados, com idempotencia por `clientGeneratedId` ou `eventId`, para nao duplicar evidencias
- ao reconectar, o app tenta sincronizar a fila automaticamente e permite reprocessamento manual ignorando o backoff agendado
- falhas parciais nao removem itens locais: o app registra erro, agenda retry e mantem o rascunho intacto
- o backend registra o ledger de sincronizacao em `sync_operations`, impedindo duplicidade de visita, checklist, jornada e observacoes quando o app reenviar o mesmo item

### Endurecimento operacional da fase 7

- cada evento critico do mobile agora sai com `eventId` idempotente para jornada, GPS, check-in, checklist, foto e check-out
- o backend persiste essa idempotencia em `Journey`, `GpsLog`, `Visit`, `VisitChecklist` e `VisitPhoto`
- a fila offline do mobile agora aplica deduplicacao por escopo, retry com backoff exponencial e reprocessamento seguro apos reabertura do app
- fotos locais carregam estado `PENDING`, `SYNCED` ou `ERROR`, alem de tentativas e ultimo envio
- o GPS operacional registra `JOURNEY_START`, `TRACKING`, `CUSTOMER_ARRIVAL`, `CHECK_IN`, `CHECK_OUT` e `JOURNEY_END`
- o supervisor agora recebe reconciliacao automatica de alertas para atraso relevante, falta de evidencia, falta de checklist, cliente pulado, check-in fora da geofence e promotor sem jornada iniciada em horario critico
- premissa operacional registrada: o alerta de "promotor sem jornada iniciada em horario critico" passa a valer a partir de `09:00` do horario local do servidor

### Regras criticas aplicadas no mobile

- nao libera visita operacional sem jornada ativa
- nao libera fotos de depois antes da foto do antes
- nao permite finalizar visita sem foto do estabelecimento, foto do antes e foto do depois
- se o check-in cair de online para offline durante a acao, o app preserva o rascunho local e empilha a sincronizacao
- se o upload de foto falhar por transporte, a evidencia continua salva localmente e entra na fila

## Portal web operacional

Modulos implementados em `apps/web/src/app/dashboard`:

- shell corporativo unico com sidebar, topbar funcional, cards, tabelas e estados padronizados
- refresh visual do painel com linguagem de sistema empresarial, menos cara de site institucional e mais densidade de informacao operacional
- `dashboard`: KPIs do dia, mapa resumido, equipe em destaque, alertas recentes e atalhos
- `audit`: trilha de auditoria com filtros por data, entidade, acao e ator
- `collaborators`: modulo administrativo para cadastrar, editar, ativar, inativar, desligar e redefinir senha de supervisores e promotores
- `map`: mapa operacional com promotores, clientes do roteiro e filtro por data, promotor e status
- `team`: quadro da equipe com status operacional, jornada, cliente atual, proximo cliente, atrasos e alertas
- `visits`: tabela operacional com filtros, paginação, geofence, evidencias e acesso ao detalhe
- `visits/[visitId]`: detalhe completo da visita com checklist, fotos, historico, auditoria e trilha GPS
- `evidences`: galeria organizada com comparacao antes/depois por visita
- `customers`: CRUD operacional de clientes com geolocalizacao, geofence, observacoes e agenda semanal
- `route-plans`: planejamento e manutencao de roteiros diarios, semanais e mensais com templates recorrentes, publicacao, historico e reordenacao rapida
- `alerts`: fila de alertas com severidade, resolucao e navegacao rapida para a visita
- `sync-pendencies`: backlog de visitas em andamento ou aguardando consolidacao e sincronizacao
- `reports`: previstos x realizados, produtividade, clientes nao atendidos, check-in fora de area e taxa de evidencia completa

Fluxos adicionais em `apps/web`:

- login raiz `/` com roteamento automatico por papel
- `ADMIN` e `SUPERVISOR` seguem para `/dashboard`
- `PROMOTER` segue para `/workspace`
- `workspace`: jornada operacional web do promotor com roteiro do dia, proxima instrucao, atualizacao automatica de rota, notificacoes recebidas, check-in com foto do estabelecimento, foto do antes, foto do depois, encerramento do atendimento e rastreio via navegador
- o cliente web usa proxy same-origin em `/backend-api` e `/backend-uploads`, evitando dependencia de `localhost:3333` no navegador e liberando acesso estavel por tablet na rede local

### Arquitetura visual web

Base padronizada atual em `apps/web/src/components`:

- `layout/navigation.ts`: mapa unico de modulos, rotas e visibilidade por perfil
- `layout/sidebar.tsx` e `layout/topbar.tsx`: shell corporativo responsivo do painel
- `app/globals.css`: tokens visuais, grid, superficies, tabelas, filtros e estados de interface do painel corporativo
- `ui/page-header.tsx`: cabecalho padronizado por tela
- `ui/stats-card.tsx`: KPIs resumidos do dia
- `ui/section-card.tsx`: blocos funcionais de conteudo
- `ui/data-table.tsx`: tabela desktop com fallback em cards mobile
- `ui/mobile-list-card.tsx`: leitura compacta para celular
- `ui/filter-bar.tsx`: filtros operacionais reutilizaveis
- `ui/form-field.tsx`: campo padronizado com label, hint e erro
- `ui/empty-state.tsx`: estados vazios padronizados
- `ui/confirm-dialog.tsx`: confirmacoes sensiveis sem `window.confirm`
- `ui/photo-uploader.tsx`: upload de evidencia para fluxo operacional do promotor
- `ui/action-bar.tsx`: barra de acao adaptada para uso mobile

Separacao por dominio em andamento em `apps/web/src/features`:

- `features/admin/collaborators`: formulario e fluxo administrativo de cadastro, status e senha
- `features/promoter/workspace`: jornada operacional web do promotor, com etapas de visita e evidencia
- `features/system-blueprint`: blueprint funcional com arquitetura, banco, APIs, sincronizacao e wireframes da solucao

Auditoria tecnica e visual da base atual registrada em `docs/auditoria-tecnica-visual.md`.
Blueprint tecnico desta primeira fase registrado em `docs/arquitetura-sistema-promotores.md` e exposto no painel em `/dashboard/architecture`.
Base Android nativa offline-first registrada em `docs/android-kotlin-offline-base.md`.
Entrega consolidada na ordem solicitada registrada em `docs/entrega-sistema-promotores.md`.
Base Android nativa agora inclui armazenamento persistente de evidencias em `filesDir/visit-evidences`, eventos operacionais `TRACK_POINT` na fila local e sincronizacao periodica via `WorkManager`.
Painel web e app Android foram refinados para uma linguagem visual corporativa, com shell limpo, navegacao objetiva e componentes operacionais mais solidos.

### Endpoints usados pelo painel

- `GET /api/supervisor/dashboard`
- `GET /api/supervisor/map`
- `GET /api/supervisor/team`
- `GET /api/supervisor/visits`
- `GET /api/supervisor/visits/:visitId`
- `GET /api/supervisor/alerts`
- `GET /api/supervisor/audit`
- `PUT /api/supervisor/alerts/:alertId/resolve`
- `GET /api/supervisor/evidences`
- `GET /api/supervisor/reports`
- `GET /api/supervisor/sync-pendencies`
- `GET /api/promoters`
- `GET /api/collaborators`
- `GET /api/collaborators/:id`
- `POST /api/collaborators`
- `PUT /api/collaborators/:id`
- `PATCH /api/collaborators/:id/status`
- `POST /api/collaborators/:id/reset-password`
- `GET /api/customers`
- `GET /api/customers/:id`
- `POST /api/customers`
- `PUT /api/customers/:id`
- `DELETE /api/customers/:id`
- `GET /api/route-plans`
- `GET /api/route-plans/today`
- `GET /api/route-plans/:id`
- `GET /api/route-plans/:id/history`
- `POST /api/route-plans`
- `POST /api/route-plans/batch`
- `PUT /api/route-plans/:id`
- `POST /api/route-plans/:id/publish`
- `DELETE /api/route-plans/:id`
- `GET /api/route-plans/templates`
- `GET /api/route-plans/templates/:id`
- `POST /api/route-plans/templates`
- `PUT /api/route-plans/templates/:id`
- `POST /api/route-plans/templates/:id/apply`

### Validacoes essenciais do painel

- `ADMIN` gerencia promotores e supervisores; `SUPERVISOR` gerencia apenas promotores vinculados ao proprio escopo
- promotor exige supervisor responsavel no cadastro
- cargo fica imutavel na edicao para preservar historico operacional e relacional
- colaborador inativo ou desligado perde acesso imediatamente porque auth e JWT revalidam `active=true`

- login protegido para `SUPERVISOR` e `ADMIN`
- sessao persistida em `sessionStorage` com refresh automatico
- filtros, paginação, busca, loading, erro e retry nos modulos principais
- build do Next.js gera todas as rotas do painel sem dependencia externa de fonte no tempo de build
- script runtime do painel valida login e consumo real dos endpoints principais

## Scripts principais

### Monorepo

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run mobile:config:check
```

### APK Android instalavel

O uso principal no Android agora e pelo navegador apontando para o portal web em `apps/web`.

O `apps/mobile` ja esta preparado para gerar um APK Android instalavel com `EAS Build`.

Premissas aplicadas:

- o app Android usa `package` `com.projetopromotor.mobile`
- o build `preview` gera `APK`
- o build `production` gera `AAB`
- `usesCleartextTraffic` esta habilitado no Android para permitir acesso a API local `http://...` durante desenvolvimento

Comandos:

```bash
npm run mobile:build:apk
npm run mobile:build:aab
```

Equivalente dentro de `apps/mobile`:

```bash
npm run build:apk
npm run build:aab
```

Observacoes importantes para o APK funcionar com login real:

- o celular precisa conseguir acessar a URL configurada em `EXPO_PUBLIC_API_BASE_URL`
- se a API estiver em IP local da rede, o aparelho precisa estar na mesma rede da maquina
- se o IP local mudar, o APK precisa ser gerado novamente com o novo valor
- para build em nuvem, faca login antes com `npx eas-cli login`
- para build local Android fora do EAS, voce vai precisar de JDK 17+ e Android SDK instalados

### Autenticacao

```bash
npm run auth:validate:runtime
npm run web:validate:login
npm run web:validate:panel
npm run mobile:validate:login
```

### Packages

```bash
npm run build:packages
```

### Infra

```bash
npm run infra:up
npm run infra:down
npm run infra:logs
npm run api:tunnel
npm run mobile:tunnel
```

### Banco

```bash
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:reset
npm run db:seed
npm run db:validate:runtime
```

## Qualidade aplicada

- TypeScript estrito em todos os apps e packages
- ESLint configurado por workspace
- Prettier na raiz
- Scripts de `lint`, `typecheck`, `test` e `build` no monorepo
- Prisma Client gerado no backend
- Docker Compose versionado para infraestrutura local
- Migration versionada do zero em `apps/api/prisma/migrations/20260321160000_init`
- Migration da fase 4 em `apps/api/prisma/migrations/20260321225751_phase4_operational_core`
- Migration da fase 6 em `apps/api/prisma/migrations/20260322003424_phase6_supervisor_panel`
- Migration da fase 7 em `apps/api/prisma/migrations/20260322010000_phase7_hardening`
- Migration da fase 8 em `apps/api/prisma/migrations/20260322153000_phase8_engineering_audit`
- Migration da fase 9 em `apps/api/prisma/migrations/20260322170000_phase9_collaborators`
- `migration_lock.toml` versionado para reproducao do provider PostgreSQL

## Auditoria de engenharia final

Endurecimentos aplicados na revisao final:

- indice unico parcial no banco para garantir no maximo uma jornada ativa por promotor, mesmo sob concorrencia
- tratamento explicito de conflitos `P2002` nas operacoes de jornada, GPS, check-in, upload de foto, check-out e encerramento de jornada
- limpeza automatica de arquivo local/S3 quando um upload de foto grava no storage mas falha ao persistir no banco
- limpeza dos READMEs de scaffold em `apps/api` e `apps/web`, deixando a documentacao do monorepo consistente
- inclusao de `db:deploy` para aplicar migrations de forma nao interativa em validacao e CI

## Validacao executada nesta fase

Comandos executados com sucesso em 22 de marco de 2026:

```bash
npm run infra:up
docker compose ps
npm run db:generate
npm run db:deploy
npm run db:seed
npm run db:validate:runtime
npm run auth:validate:runtime
npm run web:validate:login
npm run web:validate:panel
npm run mobile:validate:login
cd apps/mobile && ..\\..\\node_modules\\.bin\\vitest.cmd run src/lib/offline.spec.ts
npm run lint
npm run typecheck
npm run test
npm run build
```

Saida resumida da validacao de leitura real do backend:

```json
{
  "routeStops": 10,
  "checklistItems": 4,
  "activeJourney": false,
  "plannedVisits": 10,
  "pendingVisits": 10,
  "highAlerts": 1
}
```

Saida resumida da validacao runtime de auth:

```json
{
  "supervisorLogin": 201,
  "promoterLogin": 201,
  "adminLogin": 201,
  "me": 200,
  "supervisorDashboard": 200,
  "adminDashboard": 200,
  "promoterDashboard": 403,
  "promoterRoute": 200,
  "supervisorRoute": 403,
  "refresh": 201,
  "refreshRotated": true,
  "logout": 201,
  "revokedRefresh": 401
}
```

Saida resumida da validacao do login web:

```json
{
  "channel": "web",
  "user": "supervisor@formula.local",
  "role": "SUPERVISOR",
  "plannedVisits": 10,
  "pendingVisits": 10
}
```

Saida resumida da validacao do painel web:

```json
{
  "channel": "web-panel",
  "dashboard": {
    "plannedVisits": 10,
    "completedVisits": 0,
    "openAlerts": 11
  },
  "mapPromoters": 2,
  "teamRows": 2,
  "visitsRows": 10,
  "alertsRows": 11,
  "evidenceRows": 0,
  "customersRows": 5,
  "routePlanRows": 1,
  "promotersRows": 2,
  "reportPlanned": 10
}
```

Saida resumida da validacao do login mobile:

```json
{
  "channel": "mobile",
  "user": "promotor.centro@formula.local",
  "role": "PROMOTER",
  "routeStops": 10,
  "checklistItems": 4
}
```

Cobertura nova da fase 4 no backend:

- testes unitarios de `OperationsService` para geofence, atraso relevante e bloqueio de conclusao sem requisitos minimos
- testes e2e dos endpoints exatos da fase para journeys, route-plans, visits, checklists, alerts e dashboard

Cobertura nova da fase 7:

- testes unitarios do backend para reprocessamento idempotente de `CHECK_IN` e `TRACK_POINT`
- teste de reconciliacao automatica de alertas em `AlertsService`
- testes do mobile para reconexao e sincronizacao, falha parcial de upload, visita concluida offline, reprocessamento seguro e retomada apos fechamento do app
- estresse basico executado repetindo `src/lib/offline.spec.ts` tres vezes em sequencia no `apps/mobile`

## Observacoes importantes

- A migration atual foi gerada a partir do schema Prisma com `prisma migrate diff --from-empty`.
- A migration da fase 7 foi gerada de forma nao interativa com `prisma migrate diff --from-migrations` e aplicada com `prisma migrate deploy`.
- A seed e idempotente para o ambiente local de desenvolvimento.
- O arquivo `apps/api/scripts/validate-runtime.ts` pode ser reutilizado sempre que voce quiser conferir se auth, roteiro e dashboard continuam lendo o banco real corretamente.
- O arquivo `apps/api/scripts/validate-auth-runtime.ts` valida login, `/me`, refresh, logout e guards com banco real.
- Os scripts `apps/web/scripts/validate-login.mjs` e `apps/mobile/scripts/validate-login.mjs` sobem a API automaticamente quando ela nao estiver rodando e validam os logins seed de cada cliente.
- O script `apps/mobile/scripts/validate-login.mjs` tambem aceita `MOBILE_VALIDATE_EMAIL` e `MOBILE_VALIDATE_PASSWORD` para validar um colaborador promotor cadastrado fora do seed.
- O workspace `apps/mobile` inclui `@expo/ngrok` para permitir `expo start --tunnel` em aparelho fisico quando a rede local ou o firewall impedirem o acesso via LAN.
- O script `scripts/start-api-tunnel.ps1` publica a API local com `localtunnel`, gerando uma URL HTTPS temporaria para o mobile quando a rede local impedir o login no celular.
- O script `apps/web/scripts/validate-panel.mjs` autentica como supervisor seed e consome dashboard, mapa, equipe, visitas, alertas, evidencias, clientes, roteiros, promotores e relatorios com a API real.
