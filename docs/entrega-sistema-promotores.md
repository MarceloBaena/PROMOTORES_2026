# Entrega consolidada do sistema de controle de atendimento de promotores

Este documento organiza a entrega na ordem solicitada e aponta para a implementacao inicial ja existente no repositorio para Android, backend e painel web.

## 1. Visao geral da arquitetura

### 1.1 Objetivo da solucao

O sistema foi estruturado em tres frentes integradas:

- app Android nativo para o promotor, offline-first
- backend REST para autenticacao, sincronizacao, armazenamento, auditoria e relatorios
- painel web corporativo para supervisor e administrador

### 1.2 Arquitetura macro

```text
Promotor em campo
  -> App Android Kotlin
     -> Room + DataStore + Files + WorkManager
     -> CameraX + GPS
     -> fila local de sincronizacao
  -> API REST NestJS
     -> JWT + RBAC
     -> regras operacionais
     -> sync pull/push
     -> upload de fotos
     -> auditoria + logs
  -> PostgreSQL + Storage externo
  -> Painel Web Next.js
     -> dashboard
     -> cadastros
     -> roteiros
     -> mapa
     -> relatorios
     -> historico e auditoria
```

### 1.3 Regras estruturais da solucao

- offline-first como premissa principal
- Room como fonte local operacional do app
- sincronizacao assicrona e idempotente
- evidencias fotograficas obrigatorias
- GPS e geofence no check-in e check-out
- historico local no app
- auditoria e rastreabilidade no backend e no painel
- separacao clara entre camadas de UI, dominio, repositorio e infraestrutura

### 1.4 Perfis

- `PROMOTER`
- `SUPERVISOR`
- `ADMIN`

### 1.5 Decisao operacional de geofence

A base atual esta preparada para operacao real com regra estrita por padrao:

- dentro do raio: atendimento liberado
- fora do raio: atendimento nao segue sem justificativa operacional

Isso preserva operacao em campo quando o GPS oscila e mantem auditoria de excecao. Se voce quiser endurecer para bloqueio absoluto fora do raio, o ponto de regra ja esta centralizado na camada operacional.

## 2. Modelagem do banco

### 2.1 Banco relacional do backend

#### Identidade e governanca

- `Company`
- `User`
- `Promoter`
- `RefreshToken`
- `AuditLog`

Campos centrais:

- `User.id`
- `User.name`
- `User.email`
- `User.passwordHash`
- `User.role`
- `User.active`
- `Promoter.registrationCode`
- `Promoter.cpf`
- `Promoter.phone`
- `Promoter.supervisorId`
- `Promoter.region`

#### Supervisao e organizacao

- `Team`
- `TeamMember`

#### Clientes

- `Customer`
- `CustomerSchedule`
- `CustomerImportBatch`
- `CustomerImportItem`

Campos operacionais principais de `Customer`:

- `code`
- `legalName`
- `tradeName`
- `cnpj`
- `address`
- `number`
- `district`
- `city`
- `state`
- `zipCode`
- `latitude`
- `longitude`
- `geofenceRadiusM`
- `visitFrequency`
- `promoterId`
- `notes`
- `status`
- `active`
- `createdAt`
- `updatedAt`

#### Planejamento de roteiros

- `RoutePlan`
- `RoutePlanItem`
- `RouteTemplate`
- `RouteTemplateItem`
- `RouteChangeLog`
- `Notification`

Campos operacionais principais:

- `RoutePlan.routeDate`
- `RoutePlan.promoterId`
- `RoutePlan.version`
- `RoutePlan.status`
- `RoutePlan.publishedAt`
- `RoutePlanItem.sequence`
- `RoutePlanItem.clientId`
- `RoutePlanItem.status`
- `RoutePlanItem.priority`
- `RoutePlanItem.plannedStartAt`
- `RoutePlanItem.plannedEndAt`

#### Atendimento em campo

- `Journey`
- `GpsLog`
- `Visit`
- `VisitChecklist`
- `VisitChecklistAnswer`
- `VisitPhoto`
- `VisitStatusHistory`
- `Alert`

Campos criticos de `Visit`:

- `id`
- `routeStopId`
- `promoterId`
- `clientId`
- `journeyId`
- `checkInAt`
- `checkOutAt`
- `checkInLatitude`
- `checkInLongitude`
- `checkOutLatitude`
- `checkOutLongitude`
- `outsideGeofence`
- `geofenceDistanceM`
- `outsideGeofenceJustification`
- `notes`
- `status`
- `completionStatus`
- `startedExecutionAt`
- `finishedExecutionAt`
- `totalDurationSeconds`
- `effectiveExecutionSeconds`
- `checkInEventId`
- `checkOutEventId`
- `createdAt`
- `updatedAt`

Campos criticos de `VisitPhoto`:

- `id`
- `visitId`
- `clientId`
- `promoterId`
- `type`
- `category`
- `storageKey`
- `publicUrl`
- `capturedAt`
- `capturedLatitude`
- `capturedLongitude`
- `eventId`
- `createdAt`

Campos criticos de `GpsLog`:

- `id`
- `journeyId`
- `promoterId`
- `visitId`
- `latitude`
- `longitude`
- `accuracyM`
- `capturedAt`
- `source`
- `eventId`

### 2.2 Banco local do app Android

Implementado com Room em [PromoterDatabase.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/data/local/PromoterDatabase.kt#L13).

Entidades locais:

- `RoutePlanEntity`
- `RouteStopEntity`
- `ChecklistQuestionEntity`
- `VisitDraftEntity`
- `VisitPhotoEntity`
- `SyncQueueEntity`
- `LocationEventEntity`

#### `RoutePlanEntity`

- `routeDate`
- `routePlanId`
- `promoterId`
- `promoterName`
- `routeVersion`
- `routeStatus`
- `publishedAt`
- `updatedAt`
- `nextInstruction`

#### `RouteStopEntity`

- `id`
- `routeDate`
- `routePlanId`
- `routeVersion`
- `sequence`
- `clientId`
- `clientName`
- `addressLine`
- `city`
- `state`
- `latitude`
- `longitude`
- `radiusInMeters`
- `status`
- `plannedStartAt`
- `plannedEndAt`
- `notes`
- `remoteVisitId`

#### `VisitDraftEntity`

- `localId`
- `routeStopId`
- `remoteVisitId`
- `clientName`
- `checkInAt`
- `checkOutAt`
- `checkInLatitude`
- `checkInLongitude`
- `checkOutLatitude`
- `checkOutLongitude`
- `outsideGeofence`
- `geofenceDistanceMeters`
- `outsideGeofenceJustification`
- `notes`
- `checklistJson`
- `checklistCompleted`
- `status`
- `completionStatus`
- `pendingSync`
- `lastSyncedAt`
- `localUpdatedAt`

#### `VisitPhotoEntity`

- `id`
- `localVisitId`
- `routeStopId`
- `type`
- `localPath`
- `mimeType`
- `capturedAt`
- `capturedLatitude`
- `capturedLongitude`
- `uploaded`
- `remoteUrl`
- `remotePhotoId`
- `syncStatus`
- `uploadAttempts`

#### `SyncQueueEntity`

- `id`
- `type`
- `routeStopId`
- `localVisitId`
- `payloadJson`
- `status`
- `attempts`
- `lastError`
- `createdAt`
- `lastAttemptAt`
- `nextRetryAt`

#### `LocationEventEntity`

- `id`
- `eventType`
- `routeStopId`
- `localVisitId`
- `latitude`
- `longitude`
- `accuracyMeters`
- `capturedAt`
- `synced`

### 2.3 Sessao e preferencias locais

Implementado com DataStore em `SessionPreferences`.

Chaves:

- `access_token`
- `refresh_token`
- `user_id`
- `user_name`
- `user_role`
- `device_id`
- `last_sync_at`

## 3. Estrutura de pastas

### 3.1 Estrutura do app Android

```text
apps/android-kotlin
|-- app
|   |-- build.gradle.kts
|   `-- src/main
|       |-- AndroidManifest.xml
|       |-- java/br/com/projetopromotor/android
|       |   |-- MainActivity.kt
|       |   |-- PromoterApplication.kt
|       |   |-- PromoterApp.kt
|       |   |-- core
|       |   |   |-- AppContainer.kt
|       |   |   |-- camera/CameraCaptureController.kt
|       |   |   |-- location/FieldLocationManager.kt
|       |   |   |-- network/PromoterApi.kt
|       |   |   |-- storage/PhotoStorageManager.kt
|       |   |   `-- work/OfflineSyncWorker.kt
|       |   |-- data
|       |   |   |-- local/PromoterDatabase.kt
|       |   |   |-- preferences/SessionPreferences.kt
|       |   |   `-- repository
|       |   |       |-- AuthRepository.kt
|       |   |       |-- RouteRepository.kt
|       |   |       |-- SyncRepository.kt
|       |   |       `-- VisitRepository.kt
|       |   |-- domain/models/PromoterModels.kt
|       |   |-- features
|       |   |   |-- dashboard
|       |   |   |-- history
|       |   |   |-- login
|       |   |   |-- route
|       |   |   |-- sync
|       |   |   `-- visit
|       |   `-- ui
|       |       |-- components/SystemComponents.kt
|       |       `-- theme/Theme.kt
|       `-- res/values
|-- build.gradle.kts
|-- gradle.properties
`-- settings.gradle.kts
```

### 3.2 Estrutura do backend

```text
apps/api/src
|-- alerts
|-- audit
|-- auth
|-- checklists
|-- collaborators
|-- common
|-- customers
|-- gps
|-- operations
|-- photos
|-- prisma
|-- promoters
|-- route-plans
|-- storage
|-- supervisor
|-- teams
|-- users
|-- visits
|-- app.module.ts
|-- env.ts
`-- main.ts
```

### 3.3 Estrutura do painel web

```text
apps/web/src/app/dashboard
|-- audit
|-- alerts
|-- architecture
|-- collaborators
|-- customers
|-- evidences
|-- map
|-- reports
|-- route-plans
|-- sync-pendencies
|-- team
|-- teams
|-- visits
|-- layout.tsx
`-- page.tsx
```

## 4. Contratos das APIs

### 4.1 Autenticacao

#### `POST /api/auth/login`

Request:

```json
{
  "email": "promotor.centro@formula.local",
  "password": "Promotor@123"
}
```

Response:

```json
{
  "user": {
    "id": "promoter-1",
    "name": "Promotor Centro",
    "role": "PROMOTER"
  },
  "accessToken": "jwt-access",
  "refreshToken": "jwt-refresh"
}
```

#### `GET /api/auth/me`

Response:

```json
{
  "id": "promoter-1",
  "email": "promotor.centro@formula.local",
  "name": "Promotor Centro",
  "role": "PROMOTER"
}
```

### 4.2 Sincronizacao offline/online

Implementado no backend em [sync.controller.ts](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/api/src/operations/sync.controller.ts#L11) e [operations.service.ts](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/api/src/operations/operations.service.ts#L113).

#### `GET /sync/pull`

Query:

- `deviceId`
- `routeDate`
- `lastPulledAt`
- `lastKnownRouteVersion`

Response:

```json
{
  "serverTime": "2026-04-11T13:00:00.000Z",
  "deviceId": "android-device-1",
  "routeDate": "2026-04-11",
  "routeVersion": 4,
  "hasRouteChange": true,
  "snapshot": {
    "route": {
      "id": "route-2026-04-11-promoter-1",
      "date": "2026-04-11T00:00:00.000Z",
      "promoterId": "promoter-1",
      "promoterName": "Promotor Centro",
      "status": "PUBLISHED",
      "version": 4,
      "notes": "Executar com foco em abastecimento",
      "nextInstruction": "Prossiga para Supermercado Centro.",
      "stops": []
    },
    "checklistTemplate": [],
    "activeJourney": null,
    "notifications": []
  }
}
```

#### `POST /sync/push`

Request:

```json
{
  "deviceId": "android-device-1",
  "pushedAt": "2026-04-11T13:05:00.000Z",
  "routeDate": "2026-04-11",
  "lastPulledAt": "2026-04-11T12:55:00.000Z",
  "actions": [
    {
      "id": "queue-1",
      "type": "TRACK_POINT",
      "payload": {
        "locationEventId": "gps-local-1",
        "capturedAt": "2026-04-11T13:03:12.000Z",
        "location": {
          "latitude": -16.4701,
          "longitude": -54.6356
        },
        "accuracyM": 8.5,
        "source": "TRACKING",
        "eventId": "gps-route-stop-1-a1b2"
      }
    },
    {
      "id": "queue-2",
      "type": "UPDATE_NOTES",
      "payload": {
        "visitId": "visit-1",
        "notes": "Reposicao concluida"
      }
    }
  ]
}
```

Response:

```json
{
  "serverTime": "2026-04-11T13:05:02.000Z",
  "deviceId": "android-device-1",
  "pushedAt": "2026-04-11T13:05:00.000Z",
  "acceptedActions": 2,
  "rejectedActions": 0,
  "results": [
    {
      "id": "queue-1",
      "success": true,
      "result": {
        "id": "gps-route-stop-1-a1b2"
      }
    },
    {
      "id": "queue-2",
      "success": true,
      "result": {
        "id": "visit-1"
      }
    }
  ],
  "snapshot": {
    "route": null,
    "checklistTemplate": [],
    "activeJourney": null,
    "notifications": []
  }
}
```

### 4.3 Operacao do promotor

#### `POST /operations/visits/check-in-with-photo`

Multipart form:

- `routeStopId`
- `checkedInAt`
- `capturedAt`
- `latitude`
- `longitude`
- `justification`
- `eventId`
- `photoEventId`
- `file`

#### `POST /operations/visits/:visitId/photos`

Query/form:

- `type`: `BEFORE` | `AFTER`
- `category`
- `capturedAt`
- `eventId`
- `file`

#### `PUT /operations/visits/:visitId/checklist`

```json
{
  "items": [
    {
      "code": "MIX",
      "label": "Mix completo exposto",
      "type": "BOOLEAN",
      "required": true,
      "value": true
    }
  ],
  "notes": "Gondola revisada",
  "eventId": "checklist-123"
}
```

#### `POST /operations/visits/:visitId/check-out`

```json
{
  "checkedOutAt": "2026-04-11T14:00:00.000Z",
  "location": {
    "latitude": -16.4701,
    "longitude": -54.6352
  },
  "completionStatus": "COMPLETED",
  "notes": "Atendimento finalizado",
  "eventId": "checkout-123"
}
```

### 4.4 Supervisao e cadastros

- `GET /api/supervisor/dashboard`
- `GET /api/supervisor/map`
- `GET /api/supervisor/visits`
- `GET /api/supervisor/evidences`
- `GET /api/supervisor/alerts`
- `GET /api/supervisor/audit`
- `GET /api/supervisor/reports`
- `GET /api/supervisor/sync-pendencies`
- `GET|POST|PUT|PATCH /api/collaborators`
- `GET|POST|PUT|PATCH /api/customers`
- `GET|POST|PUT /api/route-plans`
- `POST /api/route-plans/:id/publish`

#### `GET /api/supervisor/sync-pendencies?date=2026-04-13&status=SYNC_PENDING&page=1&pageSize=20`

Response:

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 2,
  "items": [
    {
      "routeStopId": "route-stop-1",
      "visitId": "visit-1",
      "status": "SYNC_PENDING",
      "promoterId": "promoter-1",
      "promoterName": "Promotor Centro",
      "customerId": "customer-1",
      "customerName": "Supermercado Centro",
      "sequence": 1,
      "plannedStartAt": "2026-04-13T12:30:00.000Z",
      "checkInAt": "2026-04-13T12:42:00.000Z",
      "checkOutAt": "2026-04-13T13:18:00.000Z",
      "outsideGeofence": false,
      "geofenceDistanceM": 18.4,
      "beforePhotosCount": 1,
      "afterPhotosCount": 1,
      "checklistSubmitted": true,
      "openAlerts": 0,
      "pendingReason": "Visita aguardando consolidacao e fechamento de sincronizacao",
      "notes": "Reposicao finalizada e aguardando envio."
    }
  ]
}
```

#### `GET /api/supervisor/audit?date=2026-04-13&entityType=VISIT&action=CHECK_OUT&page=1&pageSize=20`

Response:

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "items": [
    {
      "id": "audit-1",
      "entityType": "VISIT",
      "entityId": "visit-1",
      "action": "CHECK_OUT_CONFIRMED",
      "actorUserId": "supervisor-1",
      "actorName": "Supervisor Operacional",
      "actorEmail": "supervisor@formula.local",
      "actorRole": "SUPERVISOR",
      "payload": {
        "routeStopId": "route-stop-1",
        "completionStatus": "COMPLETED",
        "outsideGeofence": false
      },
      "createdAt": "2026-04-13T13:20:03.000Z"
    }
  ]
}
```

## 5. Fluxo offline e sincronizacao

### 5.1 Premissas

- o promotor trabalha offline durante todo o atendimento
- o app usa Room como fonte local principal
- o backend e a fonte de verdade apos sincronizacao
- WorkManager cuida da retomada automatica quando houver rede

### 5.2 Ordem da fila local

1. `START_JOURNEY`
2. `TRACK_POINT`
3. `CHECK_IN`
4. `UPLOAD_CHECKIN_PHOTO`
5. `UPLOAD_BEFORE_PHOTO`
6. `SUBMIT_CHECKLIST`
7. `UPDATE_NOTES`
8. `UPLOAD_AFTER_PHOTO`
9. `CHECK_OUT`
10. `END_JOURNEY`

### 5.3 Regras da sincronizacao

- cada item da fila tem identificador proprio
- cada evento critico leva `eventId` idempotente para o backend
- eventos de localizacao operacional entram na fila como `TRACK_POINT`
- foto de check-in depende do draft local da visita
- foto de antes e depois dependem do `remoteVisitId`
- checklist depende da foto do antes
- checkout depende de check-in, foto antes, checklist e foto depois
- retries usam backoff exponencial
- quando a fila da visita zera, `visit_draft.pendingSync` passa para `false`
- falha de transporte nao apaga evidencia local
- falha de auth nao perde dados locais; apenas impede novo push ate revalidar sessao

### 5.4 Estrategia push/pull

#### Pull

- baixa roteiro do dia
- baixa versao do roteiro
- baixa template de checklist
- baixa notificacoes e estado de jornada

#### Push

- envia lote da fila local
- recebe resultado individual por item
- remove apenas itens confirmados com sucesso
- atualiza snapshot local ao final do push

### 5.5 Login offline

- login online inicial obrigatorio
- depois disso, sessao fica persistida em DataStore
- o app pode ser reaberto offline usando credenciais ja validadas
- se o token expirar sem internet, a operacao local continua com base e fila locais; o envio aguarda reconexao

### 5.6 Tratamento de erro e validacoes obrigatorias

Tratamento de erro no app:

- falha de GPS retorna mensagem operacional clara
- falha de camera nao perde o draft local
- falha de upload nao apaga foto local
- falha de push marca item da fila como `FAILED` e programa retry
- falha de auth nao apaga dados locais

Validacoes obrigatorias protegidas na base atual:

- sem check-in nao existe atendimento
- sem foto de check-in nao ha finalizacao
- sem foto do antes nao ha checklist nem finalizacao
- sem checklist concluido nao ha foto do depois nem finalizacao
- sem foto do depois nao ha checkout
- checkout duplicado e bloqueado no repositorio local e no backend
- observacao vazia nao entra em sincronizacao de notas

## 6. Wireframes funcionais das telas

### 6.1 App Android

#### Login

```text
+--------------------------------------------------+
| Controle de Atendimento                          |
| App operacional offline-first                    |
|--------------------------------------------------|
| E-mail                                           |
| [______________________________]                 |
| Senha                                            |
| [______________________________]                 |
|                                                  |
| [ Entrar e preparar roteiro ]                    |
|--------------------------------------------------|
| Regras operacionais e disponibilidade offline    |
+--------------------------------------------------+
```

#### Dashboard operacional

```text
+--------------------------------------------------+
| Operacao do dia                                  |
|--------------------------------------------------|
| Visitas do dia | Concluidas | Pendentes | Sync   |
|--------------------------------------------------|
| Proxima parada                                   |
| 1. Supermercado Centro                           |
| Rua A, Centro                                    |
| [ Abrir atendimento ]                            |
|--------------------------------------------------|
| [ Sincronizar ] [ Abrir roteiro ] [ Ver fila ]   |
+--------------------------------------------------+
```

#### Roteiro do dia

```text
+--------------------------------------------------+
| Roteiro do dia                                   |
| Buscar cliente                                   |
| [______________________________]                 |
|--------------------------------------------------|
| 1. Cliente A                      [ PENDENTE ]    |
| Endereco, cidade                                  |
| Raio: 120 m                                       |
| [ Abrir atendimento ]                             |
|--------------------------------------------------|
| 2. Cliente B                      [ CONCLUIDA ]   |
+--------------------------------------------------+
```

#### Fluxo da visita

```text
+--------------------------------------------------+
| Cliente selecionado                              |
|--------------------------------------------------|
| Status: check-in | antes | checklist | depois    |
|--------------------------------------------------|
| [ Check-in com foto obrigatoria ]                |
| [ Capturar foto do antes ]                       |
| [ Salvar checklist ]                             |
| [ Capturar foto do depois ]                      |
| [ Finalizar atendimento ]                        |
|--------------------------------------------------|
| Observacoes                                      |
| [____________________________________________]   |
|--------------------------------------------------|
| Evidencias locais                                |
+--------------------------------------------------+
```

#### Fila de sincronizacao

```text
+--------------------------------------------------+
| Fila de sincronizacao                            |
|--------------------------------------------------|
| CHECK_IN                PENDING      Tentativas 1|
| UPLOAD_BEFORE_PHOTO     FAILED       Tentativas 2|
| CHECK_OUT               PENDING      Tentativas 0|
|--------------------------------------------------|
| [ Processar fila agora ]                         |
+--------------------------------------------------+
```

#### Historico local

```text
+--------------------------------------------------+
| Historico local                                  |
|--------------------------------------------------|
| Cliente A             [ CHECKED OUT ] [ SYNC ]   |
| Check-in: 09:00                                  |
| Check-out: 09:38                                 |
|--------------------------------------------------|
| Cliente B             [ IN PROGRESS ] [ PEND ]   |
+--------------------------------------------------+
```

### 6.2 Painel web

#### Dashboard

```text
+--------------------------------------------------------------+
| Sidebar | Dashboard                                          |
|--------------------------------------------------------------|
| KPI 1 | KPI 2 | KPI 3 | KPI 4                                |
|--------------------------------------------------------------|
| Mapa de atendimentos          | Alertas e pendencias         |
|------------------------------ |------------------------------|
| Equipe em campo               | Atendimentos recentes        |
+--------------------------------------------------------------+
```

#### Cadastros e roteiros

```text
+--------------------------------------------------------------+
| Sidebar | Clientes / Promotores / Roteiros                   |
|--------------------------------------------------------------|
| Filtros                                                      |
| [ periodo ] [ promotor ] [ rota ] [ status ]                 |
|--------------------------------------------------------------|
| Tabela corporativa                                           |
| codigo | cliente | promotor | status | ultima visita | acao  |
+--------------------------------------------------------------+
```

#### Mapa e auditoria

```text
+--------------------------------------------------------------+
| Sidebar | Mapa dos atendimentos                              |
|--------------------------------------------------------------|
| Mapa principal com pontos de check-in/check-out              |
|--------------------------------------------------------------|
| Tabela lateral: horario | cliente | promotor | dentro raio   |
+--------------------------------------------------------------+
```

### 6.3 Nomes reais das telas do app

- `LoginScreen`
- `DashboardScreen`
- `RouteScreen`
- `VisitFlowScreen`
- `HistoryScreen`
- `SyncQueueScreen`

### 6.4 Nomes reais dos viewmodels, repositories, entities e services

ViewModels Android:

- `LoginViewModel`
- `DashboardViewModel`
- `RouteViewModel`
- `VisitFlowViewModel`
- `HistoryViewModel`
- `SyncQueueViewModel`

Repositories Android:

- `AuthRepository`
- `RouteRepository`
- `VisitRepository`
- `SyncRepository`

Entities locais Android:

- `RoutePlanEntity`
- `RouteStopEntity`
- `ChecklistQuestionEntity`
- `VisitDraftEntity`
- `VisitPhotoEntity`
- `SyncQueueEntity`
- `LocationEventEntity`

Services e classes principais do backend:

- `AuthService`
- `CollaboratorsService`
- `CustomersService`
- `RoutePlansService`
- `OperationsService`
- `SupervisorService`
- `StorageService`
- `AuditService`
- `AlertsService`
- `VisitsService`

## 7. Implementacao inicial do app Android

A base inicial do Android foi implementada no modulo `apps/android-kotlin`.

Arquitetura e inicializacao:

- [PromoterApp.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/PromoterApp.kt#L55)
- [AppContainer.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/core/AppContainer.kt#L1)

Persistencia e sessao:

- [PromoterDatabase.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/data/local/PromoterDatabase.kt#L13)
- [SessionPreferences.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/data/preferences/SessionPreferences.kt#L1)

Sincronizacao e APIs:

- [PromoterApi.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/core/network/PromoterApi.kt#L1)
- [OfflineSyncWorker.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/core/work/OfflineSyncWorker.kt#L1)
- [SyncRepository.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/data/repository/SyncRepository.kt#L1)

GPS e evidencias:

- [FieldLocationManager.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/core/location/FieldLocationManager.kt#L1)
- [CameraCaptureController.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/core/camera/CameraCaptureController.kt#L1)

Telas implementadas:

- [LoginScreen.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/features/login/LoginScreen.kt#L1)
- [DashboardScreen.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/features/dashboard/DashboardScreen.kt#L1)
- [HistoryScreen.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/features/history/HistoryScreen.kt#L1)
- [RouteScreen.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/features/route/RouteScreen.kt#L1)
- [VisitFlowScreen.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/features/visit/VisitFlowScreen.kt#L94)
- [SyncQueueScreen.kt](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/android-kotlin/app/src/main/java/br/com/projetopromotor/android/features/sync/SyncQueueScreen.kt#L1)

Fluxo critico implementado:

- login e bootstrap do roteiro
- leitura offline do roteiro do dia
- check-in com validacao de geofence
- foto de check-in com data/hora visiveis
- foto do antes
- checklist dinamico
- foto do depois
- checkout
- historico local de evidencias
- historico local de visitas
- fila de sincronizacao

### Como a foto e salva localmente e enviada depois

1. `VisitFlowScreen` captura a imagem via `CameraCaptureController`
2. `TimestampedPhotoWriter` grava o carimbo visual de data/hora e coordenadas
3. `PhotoStorageManager` grava o bruto em `filesDir/visit-evidences/{routeStopId}/raw`
4. `VisitRepository.savePhoto` gera o arquivo final em `filesDir/visit-evidences/{routeStopId}/final` e salva metadados em `VisitPhotoEntity`
5. o arquivo bruto e removido depois do carimbo visual
6. o repositorio cria um item em `SyncQueueEntity`
7. `OfflineSyncWorker` ou sincronizacao manual chama `SyncRepository.pushPendingQueue`
8. `SyncRepository` envia a foto para a rota correspondente do backend
9. ao confirmar sucesso, a foto local e marcada como `uploaded=true`

### Como o raio do cliente e validado

1. `FieldLocationManager.getCurrentCoordinates` captura a posicao atual
2. `FieldLocationManager.isInsideGeofence` calcula a distancia em metros
3. o app compara a distancia com `RouteStopEntity.radiusInMeters`
4. se estiver fora do raio:
   - sem justificativa: bloqueia check-in
   - com justificativa: registra excecao operacional auditavel

### Como impedir finalizacao sem foto obrigatoria

Na UI:

- `VisitFlowUiState.canFinish` so libera checkout com:
  - foto de check-in
  - foto do antes
  - checklist concluido
  - foto do depois

No repositorio local:

- `VisitRepository.completeVisit` revalida todas essas dependencias antes de criar a acao de `CHECK_OUT`

No backend:

- `OperationsService.ensureVisitReadyForCheckout` bloqueia o fechamento se faltar evidencia minima

## 8. Implementacao inicial do backend

O backend ja esta estruturado e funcional em `apps/api`.

Modulos principais:

- `auth`
- `collaborators`
- `customers`
- `route-plans`
- `operations`
- `visits`
- `photos`
- `gps`
- `alerts`
- `audit`
- `supervisor`
- `storage`

Pontos ja implementados:

- autenticacao JWT com refresh token
- autorizacao por perfil
- rotas de cadastro de colaboradores e clientes
- planejamento e publicacao de roteiros
- operacao de jornada e visita
- upload de fotos
- alertas operacionais
- relatorios e visoes supervisoras
- logs e auditoria

Arquivos de referencia:

- [operations.service.ts](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/api/src/operations/operations.service.ts#L98)
- [sync.controller.ts](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/api/src/operations/sync.controller.ts#L11)
- [operations.dto.ts](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/api/src/operations/operations.dto.ts#L1)

### Estrategia de armazenamento das fotos

No app:

- captura com CameraX
- gravacao local em pasta do app
- aplicacao do carimbo visual de data/hora e coordenadas
- armazenamento do caminho local no Room

No backend:

- upload multipart
- persistencia em storage externo via modulo `storage`
- chave do objeto em `VisitPhoto.storageKey`
- URL ou URL assinada em `VisitPhoto.publicUrl`
- metadados persistidos em banco
- limpeza em caso de falha entre storage e banco

## 9. Implementacao inicial do painel web

O painel web corporativo esta implementado em `apps/web`.

Areas ja existentes:

- auditoria
- dashboard
- colaboradores
- clientes
- roteiros
- mapa
- evidencias
- relatorios
- alertas
- pendencias de sincronizacao
- arquitetura interna

Arquivos e rotas de referencia:

- [page.tsx](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/web/src/app/dashboard/page.tsx#L1)
- [apps/web/src/app/dashboard/audit](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/web/src/app/dashboard/audit)
- [apps/web/src/app/dashboard/collaborators](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/web/src/app/dashboard/collaborators)
- [apps/web/src/app/dashboard/customers](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/web/src/app/dashboard/customers)
- [apps/web/src/app/dashboard/route-plans](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/web/src/app/dashboard/route-plans)
- [apps/web/src/app/dashboard/map](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/web/src/app/dashboard/map)
- [apps/web/src/app/dashboard/reports](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/web/src/app/dashboard/reports)
- [apps/web/src/app/dashboard/sync-pendencies](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/web/src/app/dashboard/sync-pendencies)
- [apps/web/src/app/dashboard/architecture](/C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/apps/web/src/app/dashboard/architecture)

Padrao visual adotado:

- interface de sistema corporativo
- sem estrutura de landing page
- navegacao lateral
- cards de KPI
- filtros operacionais
- tabelas e detalhes
- leitura objetiva para supervisor e administrador

## Estado da entrega

Esta base ja deixa pronto para evolucao:

- arquitetura completa
- modelagem principal
- estrutura de pastas por camada
- contratos de API
- sincronizacao offline/online
- wireframes funcionais
- implementacao inicial do app Android
- implementacao inicial do backend
- implementacao inicial do painel web

Documentos complementares:

- `docs/arquitetura-sistema-promotores.md`
- `docs/android-kotlin-offline-base.md`
