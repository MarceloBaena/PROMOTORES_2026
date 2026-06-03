# Base Android Kotlin Offline-First

Documento da primeira implementacao nativa do app promotor, seguindo a arquitetura pedida para operacao real em campo.

## Estrutura de pastas

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
|       |   |   |   |-- DashboardScreen.kt
|       |   |   |   `-- DashboardViewModel.kt
|       |   |   |-- history
|       |   |   |   |-- HistoryScreen.kt
|       |   |   |   `-- HistoryViewModel.kt
|       |   |   |-- login
|       |   |   |   |-- LoginScreen.kt
|       |   |   |   `-- LoginViewModel.kt
|       |   |   |-- route
|       |   |   |   |-- RouteScreen.kt
|       |   |   |   `-- RouteViewModel.kt
|       |   |   |-- sync
|       |   |   |   |-- SyncQueueScreen.kt
|       |   |   |   `-- SyncQueueViewModel.kt
|       |   |   `-- visit
|       |   |       |-- VisitFlowScreen.kt
|       |   |       `-- VisitFlowViewModel.kt
|       |   `-- ui
|       |       |-- components/SystemComponents.kt
|       |       `-- theme/Theme.kt
|       `-- res/values
|-- build.gradle.kts
|-- gradle.properties
`-- settings.gradle.kts
```

## Modelagem do banco

### Backend relacional

Entidades de servidor usadas por essa base:

- `User`
- `Promoter`
- `Customer`
- `RoutePlan`
- `RoutePlanItem`
- `Journey`
- `Visit`
- `VisitPhoto`
- `VisitChecklist`
- `VisitChecklistAnswer`
- `GpsLog`
- `Notification`
- `Alert`
- `AuditLog`

### Banco local Room

Entidades implementadas no Android:

- `RoutePlanEntity`
- `RouteStopEntity`
- `ChecklistQuestionEntity`
- `VisitDraftEntity`
- `VisitPhotoEntity`
- `SyncQueueEntity`
- `LocationEventEntity`

### DataStore

Chaves locais:

- `access_token`
- `refresh_token`
- `user_id`
- `user_name`
- `user_role`
- `device_id`
- `last_sync_at`

## Contratos das APIs

### Autenticacao

- `POST /api/auth/login`

### Sincronizacao

- `GET /sync/pull`
  - query: `deviceId`, `routeDate`, `lastPulledAt`, `lastKnownRouteVersion`
  - resposta: `serverTime`, `routeDate`, `routeVersion`, `hasRouteChange`, `snapshot`
- `POST /sync/push`
  - body: `deviceId`, `pushedAt`, `routeDate`, `lastPulledAt`, `actions[]`
  - resposta: `serverTime`, `acceptedActions`, `rejectedActions`, `results[]`, `snapshot`

### Evidencias e operacao

- `POST /operations/visits/check-in-with-photo`
- `POST /operations/visits/:visitId/photos`
- `POST /operations/journey/start`
- `POST /operations/journey/end`

## Fluxo offline e fila de sincronizacao

Ordem local da fila:

1. `START_JOURNEY`
2. `CHECK_IN`
3. `UPLOAD_CHECKIN_PHOTO`
4. `UPLOAD_BEFORE_PHOTO`
5. `SUBMIT_CHECKLIST`
6. `TRACK_POINT`
7. `UPDATE_NOTES`
8. `UPLOAD_AFTER_PHOTO`
9. `CHECK_OUT`
10. `END_JOURNEY`

Regras aplicadas:

- Room e a fonte principal do app
- DataStore mantem sessao e identificacao do dispositivo
- WorkManager dispara sincronizacao quando a rede volta e mantem agenda periodica de sincronizacao
- CameraX salva foto local, `PhotoStorageManager` persiste em `filesDir/visit-evidences` e o writer grava data/hora na imagem
- GPS registra latitude/longitude e valida o raio do cliente
- eventos operacionais de localizacao entram na fila como `TRACK_POINT`
- itens da fila usam `id` local e `eventId` no backend para evitar duplicidade
- se o push falhar, o item vai para retry com backoff

## Telas implementadas

- Login
- Dashboard operacional
- Roteiro do dia
- Historico local
- Fila de sincronizacao
- Fluxo completo da visita
  - check-in com foto
  - foto do antes
  - checklist dinamico
  - foto do depois
  - finalizacao

## Estado atual da base

Ja entregue nesta fase:

- projeto Android nativo com Kotlin + Compose
- arquitetura MVVM + Repository Pattern
- banco local Room com fila offline
- sessao e preferencias com DataStore
- sincronizacao em background com WorkManager
- CameraX com carimbo visual na foto
- GPS com validacao de geofence
- endpoints backend de `sync/pull` e `sync/push`
- validacoes de regra obrigatoria protegidas tambem no repository local

Pontos de evolucao seguintes:

- camada especifica de jornada ativa no Android
- upload incremental de pontos de rastreio em background
- testes instrumentados Android
- pipeline CI dedicada para build Android
