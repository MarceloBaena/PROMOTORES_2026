# Contratos da API Backend

Base URL: `/api`

## Erro padronizado

Todas as respostas de erro retornam o mesmo formato:

```json
{
  "statusCode": 400,
  "path": "/api/auth/login",
  "method": "POST",
  "requestId": "f6f873c8-52ea-479f-b178-bab4d2d57c43",
  "error": "ValidationError",
  "message": "email: Informe um email valido.",
  "details": {
    "validation": [
      "email: Informe um email valido."
    ],
    "count": 1
  },
  "timestamp": "2026-04-23T18:00:00.000Z"
}
```

## Autenticacao

### `POST /api/auth/login`
- Publico
- Rate limit aplicado

Request:

```json
{
  "email": "promotor@empresa.local",
  "password": "Promotor@123"
}
```

Response:

```json
{
  "user": {
    "id": "user_123",
    "email": "promotor@empresa.local",
    "name": "Promotor Centro",
    "role": "PROMOTER"
  },
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token"
}
```

### `POST /api/auth/refresh`
- Publico
- Exige `refreshToken` valido do tipo `refresh`

Request:

```json
{
  "refreshToken": "jwt-refresh-token"
}
```

### `POST /api/auth/logout`
- Publico
- Revoga o refresh token atual

Request:

```json
{
  "refreshToken": "jwt-refresh-token"
}
```

Response:

```json
{
  "success": true
}
```

### `GET /api/auth/me`
- JWT obrigatorio

## Clientes

### `GET /api/customers`
- Perfis: `SUPERVISOR`, `ADMIN`
- Filtros principais:
  - `search`
  - `customerCode`
  - `cnpj`
  - `city`
  - `routeName`
  - `region`
  - `supervisorUserId`
  - `status`
  - `sourceType`
  - `active`
  - `sortBy`
  - `sortDirection`
  - `page`
  - `pageSize`

Exemplo:

`GET /api/customers?search=mercado&active=true&sortBy=tradeName&sortDirection=asc&page=1&pageSize=20`

### `POST /api/customers`
- Perfis: `SUPERVISOR`, `ADMIN`

Request:

```json
{
  "code": "CLI-001",
  "legalName": "Mercado Central LTDA",
  "tradeName": "Mercado Central",
  "cnpj": "12345678000199",
  "contactName": "Carlos Silva",
  "phone": "(65) 99999-0000",
  "email": "compras@mercadocentral.local",
  "zipCode": "78000000",
  "address": "Av. Principal",
  "addressNumber": "100",
  "district": "Centro",
  "city": "Cuiaba",
  "state": "MT",
  "geofenceRadiusM": 80,
  "routeName": "Centro",
  "region": "Cuiaba Sul",
  "supervisorUserId": "user_sup_1",
  "defaultPromoterUserId": "user_prom_1",
  "visitFrequency": "SEMANAL",
  "preferredVisitDays": [
    "MONDAY",
    "WEDNESDAY"
  ],
  "preferredVisitTimeStart": "08:00",
  "preferredVisitTimeEnd": "12:00",
  "notes": "Cliente com grande fluxo",
  "status": "ACTIVE"
}
```

### `PATCH /api/customers/:id/status`

Request:

```json
{
  "status": "INACTIVE"
}
```

### `POST /api/customers/import/csv`
- Multipart
- Campo de arquivo: `file`
- Opcoes adicionais:

```json
{
  "apply": true,
  "allowCreate": true,
  "allowUpdate": true,
  "ignoreDuplicates": false,
  "fallbackSupervisorUserId": "user_sup_1",
  "fallbackDefaultPromoterUserId": "user_prom_1",
  "delimiter": ";"
}
```

## Roteiros

### `GET /api/route-plans`
- Perfis: `SUPERVISOR`, `ADMIN`

Exemplo:

`GET /api/route-plans?date=2026-04-23&promoterId=promoter_1&status=PUBLISHED&page=1&pageSize=20`

### `POST /api/route-plans`

```json
{
  "routeDate": "2026-04-23T00:00:00.000Z",
  "promoterId": "promoter_1",
  "planningView": "DAILY",
  "publishNow": false,
  "notes": "Roteiro de homologacao",
  "items": [
    {
      "customerId": "customer_1",
      "sequence": 1,
      "priority": "HIGH",
      "plannedStartAt": "2026-04-23T08:00:00.000Z",
      "plannedEndAt": "2026-04-23T09:00:00.000Z",
      "notes": "Ponta de gôndola"
    }
  ]
}
```

### `POST /api/route-plans/:id/publish`

```json
{
  "note": "Roteiro publicado para operacao"
}
```

### `GET /api/route-plans/today`
- Perfil: `PROMOTER`
- Retorna o roteiro publicado do dia

### `GET /api/route-plans/notifications`
- Perfil: `PROMOTER`
- Query:
  - `limit`
  - `unreadOnly`

## Operacao do promotor

### `POST /api/operations/visits/check-in-with-photo`
- Perfil: `PROMOTER`
- Multipart
- Campo de arquivo: `file`

Campos:
- `routeStopId`
- `checkedInAt`
- `capturedAt`
- `latitude`
- `longitude`
- `justification`
- `eventId`
- `clientGeneratedId`
- `photoEventId`
- `photoClientGeneratedId`
- `photoCapturedLatitude`
- `photoCapturedLongitude`
- `photoGpsStatus`
- `photoGpsErrorCode`
- `photoGpsErrorMessage`

### `POST /api/operations/visits/:visitId/start-service`

```json
{
  "startedAt": "2026-04-23T13:10:00.000Z",
  "eventId": "service-start-1713880200"
}
```

### `PUT /api/operations/visits/:visitId/checklist`

```json
{
  "items": [
    {
      "code": "LIMPEZA_GONDOLA",
      "label": "Limpeza da gondola",
      "type": "BOOLEAN",
      "required": true,
      "value": true
    },
    {
      "code": "OBSERVACOES",
      "label": "Observacoes",
      "type": "TEXT",
      "required": false,
      "value": "Reposicao concluida"
    }
  ],
  "notes": "Execucao conforme planejado",
  "eventId": "checklist-1713880400"
}
```

### `POST /api/operations/visits/:visitId/photos`
- Multipart
- Campo de arquivo: `file`
- Query:
  - `type`
  - `category`
  - `stage`
  - `capturedAt`
  - `capturedLatitude`
  - `capturedLongitude`
  - `gpsStatus`
  - `gpsErrorCode`
  - `gpsErrorMessage`
  - `eventId`
  - `clientGeneratedId`

### `POST /api/operations/visits/:visitId/check-out`

```json
{
  "checkedOutAt": "2026-04-23T13:40:00.000Z",
  "location": {
    "latitude": -15.6014,
    "longitude": -56.0979
  },
  "completionStatus": "COMPLETED",
  "notes": "Atendimento encerrado",
  "eventId": "checkout-1713882000"
}
```

## Sincronizacao offline

### `GET /api/sync/pull`
- Perfil: `PROMOTER`

Exemplo:

`GET /api/sync/pull?deviceId=tablet-cuiaba-01&routeDate=2026-04-23&lastPulledAt=2026-04-23T12:00:00.000Z`

### `POST /api/sync/push`
- Perfil: `PROMOTER`

```json
{
  "deviceId": "tablet-cuiaba-01",
  "pushedAt": "2026-04-23T13:20:00.000Z",
  "routeDate": "2026-04-23",
  "actions": [
    {
      "id": "check_in-1713880000000-ab12",
      "clientGeneratedId": "checkin-1713880000000-ab12",
      "type": "CHECK_IN",
      "payload": {
        "routeStopId": "stop_1",
        "checkedInAt": "2026-04-23T13:10:00.000Z",
        "location": {
          "latitude": -15.6014,
          "longitude": -56.0979
        },
        "eventId": "checkin-1713880000000-ab12"
      }
    }
  ]
}
```

## Painel do supervisor

### `GET /api/supervisor/dashboard`
### `GET /api/supervisor/map`
### `GET /api/supervisor/team`
### `GET /api/supervisor/visits`
### `GET /api/supervisor/visits/:visitId`
### `GET /api/supervisor/alerts`
### `PUT /api/supervisor/alerts/:alertId/resolve`
### `GET /api/supervisor/evidences`
### `GET /api/supervisor/reports`
### `GET /api/supervisor/audit`
### `GET /api/supervisor/sync-pendencies`

Filtros principais das visitas:
- `date`
- `promoterId`
- `supervisorId`
- `customerId`
- `search`
- `status`
- `completionStatus`
- `sortBy`
- `sortDirection`
- `page`
- `pageSize`

## Cadastros administrativos

### `GET /api/collaborators`
### `POST /api/collaborators`
### `PUT /api/collaborators/:id`
### `PATCH /api/collaborators/:id/status`
### `POST /api/collaborators/:id/reset-password`

### `GET /api/teams`
### `POST /api/teams`
### `PUT /api/teams/:id`
### `PATCH /api/teams/:id/status`
### `GET /api/teams/:id/members`
### `POST /api/teams/:id/members`
### `DELETE /api/teams/:id/members/:memberId`
