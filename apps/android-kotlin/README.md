# Promotor Android Kotlin

Base nativa do app Android offline-first para promotores, alinhada com a arquitetura solicitada:

- Kotlin
- Jetpack Compose
- MVVM
- Repository Pattern
- Room como fonte local principal
- DataStore para sessao e preferencias
- WorkManager para sincronizacao offline/online
- CameraX para captura de fotos
- GPS para validacao por geofence

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

## Entidades locais e modelagem

Room:

- `RoutePlanEntity`
- `RouteStopEntity`
- `ChecklistQuestionEntity`
- `VisitDraftEntity`
- `VisitPhotoEntity`
- `SyncQueueEntity`
- `LocationEventEntity`

DataStore:

- `access_token`
- `refresh_token`
- `user_id`
- `user_name`
- `user_role`
- `last_sync_at`
- `device_id`

Campos de negocio mais relevantes:

- cliente: latitude, longitude, raio permitido
- visita: check-in, check-out, status, justificativa fora da area, notas
- foto: tipo `CHECKIN`, `BEFORE`, `AFTER`, caminho local, latitude, longitude, carimbo visual
- fila: `type`, `payloadJson`, `status`, `attempts`, `lastError`, `nextRetryAt`

## Contratos das APIs

Autenticacao:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Sincronizacao:

- `GET /sync/pull`
  - entrada: `deviceId`, `routeDate`, `lastPulledAt`, `lastKnownRouteVersion`
  - saida: `serverTime`, `routeDate`, `routeVersion`, `hasRouteChange`, `snapshot`
- `POST /sync/push`
  - entrada: `deviceId`, `pushedAt`, `routeDate`, `actions[]`
  - saida: `acceptedActions`, `rejectedActions`, `results[]`, `snapshot`

Operacao:

- `POST /operations/visits/check-in-with-photo`
- `POST /operations/visits/:visitId/photos`
- `PUT /operations/visits/:visitId/checklist`
- `POST /operations/visits/:visitId/check-out`
- `POST /operations/journey/start`
- `POST /operations/journey/end`

## Fluxo offline e fila de sincronizacao

Fila local:

1. `START_JOURNEY`
2. `CHECK_IN`
3. `UPLOAD_CHECKIN_PHOTO`
4. `UPLOAD_BEFORE_PHOTO`
5. `SUBMIT_CHECKLIST`
6. `UPDATE_NOTES`
7. `UPLOAD_AFTER_PHOTO`
8. `CHECK_OUT`
9. `END_JOURNEY`

Regras:

- check-in depende de jornada ativa
- upload de foto depende de visita local criada
- checklist depende da foto do antes
- check-out depende da foto do check-in, do antes, do depois e checklist concluido
- WorkManager reprocessa a fila quando a rede volta
- `eventId` evita duplicidade na API

## Telas do app promotor

- Login
- Dashboard operacional
- Roteiro do dia
- Detalhe da visita
- Check-in com foto obrigatoria
- Foto antes
- Execucao do atendimento
- Foto depois
- Checkout
- Pendencias de sincronizacao

## Estado desta primeira implementacao

Ja incluido no modulo:

- projeto Android nativo com Gradle e Compose
- base de dados Room
- sessao via DataStore
- fila offline com WorkManager
- integracao de CameraX e geofence no modulo `core`
- ViewModels e telas principais do fluxo operacional
- checklist dinamico persistido localmente a partir do `sync/pull`

Validacao do modulo Android depende de SDK/Gradle Android disponiveis no ambiente.
