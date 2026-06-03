# Arquitetura do sistema de controle de atendimento de promotores

Este documento consolida a primeira fase da arquitetura para o sistema de promotores de vendas, preservando a base ja existente no repositorio e organizando a evolucao para o app Android nativo em Kotlin.

## 1. Estado atual e alvo

Base atual no repositorio:

- `apps/api`: backend NestJS com Prisma, JWT, auditoria, storage, visitas, rotas, fotos, GPS e alertas.
- `apps/web`: painel corporativo Next.js com dashboard, mapa, clientes, evidencias, relatorios, equipes, colaboradores e roteiros.
- `apps/mobile`: cliente Expo com login, jornada, roteiro, check-in, fila offline, fotos, checklist, observacoes e checkout.

Arquitetura alvo para a proxima fase mobile:

- `apps/android-kotlin`: Android nativo com Kotlin + Jetpack Compose.
- Banco local com Room/SQLite.
- Sincronizacao em background com WorkManager.
- Camera, GPS, arquivos e fila local persistidos nativamente.
- Reuso integral dos contratos de API ja existentes na camada NestJS.

## 2. Arquitetura completa

### 2.1 Camadas

1. Canal de campo
   App do promotor com uso offline-first, foco em poucos toques e evidencias obrigatorias.
2. Motor de sincronizacao
   Fila local, retries, idempotencia, reconciliacao de IDs e atualizacao incremental do roteiro.
3. API de dominio
   Backend NestJS com regras operacionais centralizadas.
4. Dados transacionais
   PostgreSQL como fonte de verdade e storage de evidencias.
5. Painel corporativo
   Dashboard web para supervisores e administradores.
6. Observabilidade e seguranca
   Auth, RBAC, auditoria, alertas e logs.

### 2.2 Regras transversais

- O promotor precisa continuar trabalhando sem internet.
- Nao ha rastreamento fora da jornada ativa.
- Check-in exige foto obrigatoria do estabelecimento.
- Foto BEFORE e foto AFTER sao obrigatorias.
- Data/hora precisa existir visualmente na foto e em metadados estruturados.
- Checkout nao pode acontecer sem todas as etapas obrigatorias.
- Cada item precisa carregar status de sincronizacao.

## 3. Estrutura de pastas proposta

```text
.
|-- apps
|   |-- api
|   |-- web
|   |-- mobile
|   `-- android-kotlin
|-- packages
|   |-- config
|   |-- types
|   `-- ui
`-- docs
```

Detalhamento principal:

- `apps/api/src/auth`, `collaborators`, `promoters`, `customers`, `teams`, `route-plans`, `operations`, `visits`, `photos`, `gps`, `checklists`, `alerts`, `audit`, `storage`, `prisma`, `common`
- `apps/web/src/app/dashboard/architecture` para o blueprint funcional interno
- `apps/android-kotlin/app/src/main/java/.../data|domain|sync|features|core`

## 4. Modelagem do banco

### 4.1 Banco transacional do backend

Identidade e governanca:

- `Company`
- `User`
- `Promoter`
- `Team`
- `TeamMember`
- `RefreshToken`
- `AuditLog`

Clientes e agenda:

- `Customer`
- `CustomerSchedule`
- `CustomerImportBatch`
- `CustomerImportItem`

Planejamento:

- `RoutePlan`
- `RoutePlanItem`
- `RouteTemplate`
- `RouteTemplateItem`
- `RouteChangeLog`
- `Notification`

Operacao de campo:

- `Journey`
- `GpsLog`
- `Visit`
- `VisitChecklist`
- `VisitChecklistAnswer`
- `VisitPhoto`
- `VisitStatusHistory`
- `Alert`

### 4.2 Persistencia local do Android

Tabelas/colecoes propostas no app Kotlin:

- `local_sessions`
- `local_route_cache`
- `local_visit_drafts`
- `local_visit_photos`
- `sync_queue`
- `sync_dependencies`
- `location_buffer`

Campos minimos por item da fila:

- `id`
- `type`
- `payload_json`
- `route_stop_id`
- `local_visit_id`
- `status`
- `attempts`
- `last_error`
- `created_at`
- `last_attempt_at`
- `next_retry_at`

## 5. Fluxos do app promotor

1. Login e bootstrap
   Auth online inicial, sessao segura persistida e cache do roteiro do dia.
2. Inicio da jornada
   Captura coordenada inicial, cria evento local e libera rastreamento.
3. Check-in com foto
   Valida geofence, exige justificativa fora do raio e cria visita com foto do estabelecimento.
4. Execucao do atendimento
   Foto BEFORE, checklist, observacoes e tempo de atendimento.
5. Foto final e check-out
   Foto AFTER, coordenada final, status de conclusao e calculo do tempo total.
6. Sincronizacao
   Fila local reprocessa eventos por dependencia quando a internet volta.

## 6. Estrutura do backend

Cadastro e governanca:

- `auth`
- `users`
- `collaborators`
- `promoters`
- `teams`
- `customers`

Planejamento:

- `route-plans`
- `supervisor`
- `notifications` acopladas ao dominio de roteiros

Execucao:

- `operations`
- `visits`
- `photos`
- `gps`
- `checklists`
- `alerts`

Transversal:

- `prisma`
- `storage`
- `audit`
- `common`

## 7. APIs necessarias

Auth:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Cadastros:

- `GET|POST|PUT /api/collaborators`
- `GET|POST|PUT /api/customers`
- `GET|POST /api/teams`

Roteiros:

- `GET /api/operations/route-bundle/today`
- `GET|POST|PUT /api/route-plans`
- `POST /api/route-plans/:id/publish`

Atendimento:

- `POST /api/operations/journeys/start`
- `POST /api/operations/journeys/end`
- `POST /api/operations/journeys/track-point`
- `POST /api/operations/visits/check-in-with-photo`
- `POST /api/visits/:visitId/photos`
- `POST /api/visits/:visitId/checklist`
- `PATCH /api/visits/:visitId/notes`
- `POST /api/visits/:visitId/check-out`

Supervisao:

- `GET /api/supervisor/dashboard`
- `GET /api/supervisor/map`
- `GET /api/supervisor/visits`
- `GET /api/supervisor/evidences`
- `GET /api/supervisor/alerts`
- `GET /api/supervisor/reports`

## 8. Regras de sincronizacao offline/online

- Ordem de processamento:
  `START_JOURNEY -> TRACK_POINT -> CHECK_IN -> UPLOAD_PHOTO -> SUBMIT_CHECKLIST -> UPDATE_NOTES -> CHECK_OUT -> END_JOURNEY`
- Foto nao sobe antes do check-in existir remotamente.
- Checklist e checkout aguardam sincronizacao das evidencias obrigatorias.
- Todo evento critico carrega `eventId` idempotente.
- Falhas de rede usam retry com backoff exponencial.
- Falhas de auth invalidam a sessao e exigem novo login online.
- Pendencias permanecem visiveis no app e no painel.

## 9. Primeira versao das telas principais

Mobile:

- Login operacional
- Dashboard/jornada
- Roteiro do dia
- Detalhe da visita
- Check-in com foto
- Fotos BEFORE e AFTER
- Checklist e observacoes
- Checkout
- Sincronizacao pendente

Web:

- Dashboard supervisor
- Clientes
- Colaboradores
- Equipes
- Roteiros
- Mapa
- Alertas
- Evidencias
- Relatorios
- Blueprint tecnico

## 10. Wireframes funcionais

Padrao mobile:

- cabecalho curto
- contexto da visita
- indicador do que falta
- evidencia/foto/checklist
- CTA unico por etapa

Padrao web:

- page header corporativo
- cards de KPI
- grid responsivo
- tabela com fallback mobile
- filtros operacionais
- acoes explicitas de publicacao, cadastro e acompanhamento

## 11. Entrega desta etapa

Esta fase deixa pronto:

- blueprint tecnico documentado em `docs/arquitetura-sistema-promotores.md`
- modulo interno do painel em `/dashboard/architecture`
- base de navegacao atualizada para admin e supervisor
- primeira camada visual das telas e fluxos principais consolidada para evolucao
