export interface BlueprintOverviewStat {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}

export interface BlueprintCard {
  title: string;
  summary: string;
  bullets: string[];
  tags?: string[];
}

export interface BlueprintDomain {
  title: string;
  summary: string;
  entities: string[];
  highlights: string[];
}

export interface BlueprintApiGroup {
  title: string;
  summary: string;
  endpoints: string[];
}

export interface BlueprintFlowStage {
  id: string;
  title: string;
  description: string;
  checkpoints: string[];
  outputs: string[];
}

export interface BlueprintWireframe {
  title: string;
  channel: 'Mobile' | 'Web';
  status: 'Implementado na base atual' | 'Estruturado para a proxima etapa';
  summary: string;
  regions: string[];
}

export const blueprintOverviewStats: BlueprintOverviewStat[] = [
  {
    label: 'Camadas centrais',
    value: '6',
  },
  {
    label: 'Dominios de dados',
    value: '5',
  },
  {
    label: 'Filas offline',
    value: '8 eventos',
    tone: 'success',
  },
  {
    label: 'Telas-chave',
    value: '16',
  },
  {
    label: 'APIs priorizadas',
    value: '26+',
  },
  {
    label: 'Logs e auditoria',
    value: '100% rastreavel',
    tone: 'warning',
  },
];

export const blueprintHighlights = [
  'Base atual: API NestJS, painel Next.js e cliente mobile Expo com cache local, fila de sincronizacao e validacao operacional.',
  'Arquitetura alvo: manter os mesmos contratos e evoluir o cliente Android para Kotlin + Jetpack Compose + Room + WorkManager.',
  'Regra critica preservada: nao existe rastreamento fora da jornada ativa, e a visita nao finaliza sem evidencias minimas.',
];

export const architectureLayers: BlueprintCard[] = [
  {
    title: 'Canal de campo',
    summary:
      'Cliente Android offline-first para o promotor, com foco em poucos toques, uso sem internet e captura obrigatoria de evidencias.',
    bullets: [
      'Tela de login com sessao persistida apos autenticacao inicial.',
      'Roteiro do dia salvo localmente com ordem, geofence e proximas acoes.',
      'Fluxo guiado de check-in, foto do antes, checklist/tempo, foto do depois e check-out.',
      'Fotos e coordenadas persistidas localmente ate a sincronizacao completa.',
    ],
    tags: ['Android Kotlin alvo', 'Base atual Expo', 'Offline-first'],
  },
  {
    title: 'Camada de sincronizacao',
    summary:
      'Motor local responsavel por fila, idempotencia, retries, reconciliacao e atualizacao automatica quando a conectividade retorna.',
    bullets: [
      'Fila local com prioridade para START_JOURNEY, CHECK_IN, UPLOAD_PHOTO e CHECK_OUT.',
      'Retry com backoff exponencial e bloqueio por dependencia entre eventos.',
      'Resolucao segura de IDs locais para IDs remotos apos o primeiro sync.',
      'Atualizacao incremental do roteiro quando supervisor republica a rota.',
    ],
    tags: ['WorkManager alvo', 'eventId idempotente', 'Reprocessamento seguro'],
  },
  {
    title: 'API de dominio',
    summary:
      'Backend NestJS com modulos isolados por dominio, autenticacao JWT, storage de evidencias, auditoria e regras operacionais centralizadas.',
    bullets: [
      'Operacoes de campo concentradas em journeys, visits, photos, gps, alerts e route-plans.',
      'Validacao de geofence, checklist e evidencias no servidor para nao depender do cliente.',
      'Auditoria por entidade e historico de status para rastreabilidade operacional.',
      'Endpoints preparados para sync incremental e consumo por painel web e mobile.',
    ],
    tags: ['NestJS', 'Prisma', 'JWT'],
  },
  {
    title: 'Dados transacionais',
    summary:
      'PostgreSQL como fonte de verdade do negocio, organizado por cadastros, planejamento, operacao, compliance e historico.',
    bullets: [
      'Entidades separadas para colaboradores, clientes, roteiros, jornadas, visitas, fotos e alertas.',
      'Indices por data, promotor, cliente, status e geofence para consultas rapidas.',
      'Historico de publicacao de roteiro e de mudancas operacionais sem quebrar contratos.',
      'Persistencia local complementar no aparelho para sessao, fila, rascunhos e arquivos.',
    ],
    tags: ['PostgreSQL', 'Storage S3/MinIO', 'Cache local'],
  },
  {
    title: 'Painel corporativo',
    summary:
      'Portal web para supervisores e administradores acompanharem operacao, cadastros, mapas, relatorios, auditoria e evidencias.',
    bullets: [
      'Dashboard, mapa operacional, visitas, evidencias, clientes, equipes e roteiros.',
      'Cadastros administrativos de promotores, supervisores, clientes, equipes e regioes.',
      'Relatorios por periodo, promotor, cliente, rota e status de sincronizacao.',
      'Tela interna de blueprint para alinhar evolucao tecnica com o produto.',
    ],
    tags: ['Next.js 16', 'Dashboard corporativo', 'Mapa + relatorios'],
  },
  {
    title: 'Observabilidade e seguranca',
    summary:
      'Camada transversal para auth, auditoria, logs, alertas, controle de acesso e governanca operacional.',
    bullets: [
      'Roles ADMIN, SUPERVISOR e PROMOTER com rotas e escopos distintos.',
      'Logs de auditoria por entidade, ator, acao e payload.',
      'Alertas de check-in fora da geofence, atraso relevante, falta de evidencia e sync pendente.',
      'Politica explicita para erros de rede, autenticacao, validacao e reconciliacao.',
    ],
    tags: ['RBAC', 'Audit trail', 'Alertas operacionais'],
  },
];

export const folderStructure = `.
|-- apps
|   |-- api
|   |   |-- prisma
|   |   |   |-- schema.prisma
|   |   |   |-- migrations
|   |   |   \`-- seed.ts
|   |   \`-- src
|   |       |-- auth
|   |       |-- collaborators
|   |       |-- promoters
|   |       |-- customers
|   |       |-- teams
|   |       |-- route-plans
|   |       |-- operations
|   |       |-- visits
|   |       |-- photos
|   |       |-- gps
|   |       |-- checklists
|   |       |-- alerts
|   |       |-- audit
|   |       |-- storage
|   |       |-- supervisor
|   |       |-- prisma
|   |       \`-- common
|   |-- web
|   |   \`-- src
|   |       |-- app
|   |       |   |-- dashboard
|   |       |   |   |-- architecture
|   |       |   |   |-- customers
|   |       |   |   |-- route-plans
|   |       |   |   |-- visits
|   |       |   |   |-- map
|   |       |   |   |-- reports
|   |       |   |   \`-- alerts
|   |       |-- components
|   |       |-- features
|   |       |   |-- admin
|   |       |   |-- promoter
|   |       |   \`-- system-blueprint
|   |       \`-- lib
|   |-- mobile
|   |   \`-- src
|   |       |-- screens
|   |       |-- components
|   |       |-- store
|   |       |-- repositories
|   |       \`-- lib
|   \`-- android-kotlin
|       |-- app
|       |   |-- src/main/java/.../data
|       |   |-- src/main/java/.../domain
|       |   |-- src/main/java/.../sync
|       |   |-- src/main/java/.../features
|       |   \`-- src/main/java/.../core
|       \`-- docs
|-- packages
|   |-- config
|   |-- types
|   \`-- ui
\`-- docs`;

export const databaseDomains: BlueprintDomain[] = [
  {
    title: 'Identidade e governanca',
    summary: 'Controle de acesso, vinculos organizacionais e rastreabilidade do que foi alterado.',
    entities: ['Company', 'User', 'Promoter', 'Team', 'TeamMember', 'RefreshToken', 'AuditLog'],
    highlights: [
      'Supervisor obrigatorio no perfil de promotor.',
      'Status de emprego e inativacao logica sem apagar historico.',
      'Auditoria pronta para auth, cadastro e operacao.',
    ],
  },
  {
    title: 'Base de clientes',
    summary: 'Cadastro mestre do PDV, agenda operacional, geofence e importacoes externas.',
    entities: ['Customer', 'CustomerSchedule', 'CustomerImportBatch', 'CustomerImportItem'],
    highlights: [
      'Latitude, longitude e raio permitido por cliente.',
      'Vinculo com promotor padrao, supervisor e rota/regiao.',
      'Preparado para integracao Winthor/CSV sem destruir dados operacionais.',
    ],
  },
  {
    title: 'Planejamento de rotas',
    summary: 'Planejamento diario, semanal e mensal com versao, publicacao e historico.',
    entities: ['RoutePlan', 'RoutePlanItem', 'RouteTemplate', 'RouteTemplateItem', 'RouteChangeLog', 'Notification'],
    highlights: [
      'Ordem de visita por promotor e por data.',
      'Publicacao versionada com notificacao ao promotor.',
      'Logs de alteracao para auditoria de replanejamento.',
    ],
  },
  {
    title: 'Execucao em campo',
    summary: 'Jornada ativa, geolocalizacao, visita, checklist, fotos e historico operacional.',
    entities: ['Journey', 'GpsLog', 'Visit', 'VisitChecklist', 'VisitChecklistAnswer', 'VisitPhoto', 'VisitStatusHistory', 'Alert'],
    highlights: [
      'Check-in e check-out com latitude/longitude, horario e status.',
      'Fotos BEFORE e AFTER com metadados, categoria e vinculo ao atendimento.',
      'Alertas para fora de geofence, sync pendente e falta de evidencia.',
    ],
  },
  {
    title: 'Persistencia local do Android',
    summary:
      'Camada proposta para Room/SQLite no app Kotlin, espelhando os dados minimos necessarios para trabalhar sem rede.',
    entities: [
      'local_sessions',
      'local_route_cache',
      'local_visit_drafts',
      'local_visit_photos',
      'sync_queue',
      'sync_dependencies',
      'location_buffer',
    ],
    highlights: [
      'Fila local por item com status PENDING, PROCESSING, FAILED e SYNCED.',
      'Arquivos de foto armazenados no filesystem com referencia cruzada no banco local.',
      'Dependencias entre check-in, fotos, checklist e checkout antes do envio.',
    ],
  },
];

export const backendModules: BlueprintCard[] = [
  {
    title: 'Cadastro e governanca',
    summary: 'Modulos administrativos para controlar acesso, equipes, promotores, clientes e relacao supervisor x rota.',
    bullets: [
      'auth, users, collaborators, promoters, teams e customers.',
      'Valida CPF/CNPJ, matricula, supervisor responsavel, status e escopo por empresa.',
      'Mantem contratos de cadastro isolados dos fluxos de atendimento.',
    ],
  },
  {
    title: 'Planejamento operacional',
    summary: 'Responsavel por gerar, publicar e versionar o roteiro que sera baixado pelo promotor.',
    bullets: [
      'route-plans, route-templates, notifications e supervisor.',
      'Agrupa clientes do dia, ordem de visita e instrucoes do supervisor.',
      'Suporta planejamento diario e recorrente sem perder historico.',
    ],
  },
  {
    title: 'Motor de atendimento',
    summary: 'Concentra as regras que nao podem depender do cliente mobile para serem confiaveis.',
    bullets: [
      'operations, visits, photos, checklists, gps e alerts.',
      'Bloqueia fechamento sem foto obrigatoria, checklist e metadados minimos.',
      'Calcula fora de geofence, atraso relevante e consistencia de jornada.',
    ],
  },
  {
    title: 'Infraestrutura transversal',
    summary: 'Suporte de dados, storage, ambiente, filtros HTTP e padroes de observabilidade.',
    bullets: [
      'prisma, storage, common, audit e env.',
      'Storage compativel com filesystem local e S3/MinIO.',
      'Idempotencia por eventId para evitar duplicidade em reconexao.',
    ],
  },
];

export const apiGroups: BlueprintApiGroup[] = [
  {
    title: 'Auth e sessao',
    summary: 'Autenticacao segura, renovacao de token e sessao offline apos o primeiro login.',
    endpoints: [
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/logout',
      'GET /api/auth/me',
    ],
  },
  {
    title: 'Cadastros corporativos',
    summary: 'CRUD de promotores, supervisores, clientes, equipes, regioes e configuracoes de geofence.',
    endpoints: [
      'GET /api/collaborators',
      'POST /api/collaborators',
      'PUT /api/collaborators/:id',
      'GET /api/customers',
      'POST /api/customers',
      'PUT /api/customers/:id',
      'GET /api/teams',
      'POST /api/teams',
    ],
  },
  {
    title: 'Roteiros e distribuicao',
    summary: 'Entrega o plano de visitas ao promotor e registra publicacoes do supervisor.',
    endpoints: [
      'GET /api/operations/route-bundle/today',
      'GET /api/route-plans',
      'POST /api/route-plans',
      'PUT /api/route-plans/:id',
      'POST /api/route-plans/:id/publish',
    ],
  },
  {
    title: 'Atendimento em campo',
    summary: 'Fluxo transacional do trabalho no PDV, sempre validado no servidor.',
    endpoints: [
      'POST /api/operations/journeys/start',
      'POST /api/operations/journeys/end',
      'POST /api/operations/journeys/track-point',
      'POST /api/operations/visits/check-in-with-photo',
      'POST /api/visits/:visitId/photos',
      'POST /api/visits/:visitId/checklist',
      'PATCH /api/visits/:visitId/notes',
      'POST /api/visits/:visitId/check-out',
    ],
  },
  {
    title: 'Supervisao, mapa e relatorios',
    summary: 'Consultas para acompanhamento do dia, evidencias, alertas, mapa e consolidacao gerencial.',
    endpoints: [
      'GET /api/supervisor/dashboard',
      'GET /api/supervisor/map',
      'GET /api/supervisor/visits',
      'GET /api/supervisor/evidences',
      'GET /api/supervisor/alerts',
      'GET /api/supervisor/reports',
      'PUT /api/supervisor/alerts/:alertId/resolve',
    ],
  },
];

export const mobileFlowStages: BlueprintFlowStage[] = [
  {
    id: '01',
    title: 'Login e abertura offline',
    description:
      'O promotor autentica uma vez online e depois consegue reabrir o app, consultar roteiro e continuar rascunhos mesmo sem internet.',
    checkpoints: [
      'Sessao protegida no storage seguro do aparelho.',
      'Roteiro do dia e notificacoes baixados para cache local.',
      'Tela de status informa ultima sincronizacao e pendencias.',
    ],
    outputs: ['session_cache', 'route_bundle_local', 'sync_health'],
  },
  {
    id: '02',
    title: 'Inicio da jornada',
    description:
      'Antes da primeira visita, o promotor inicia a jornada ativa para liberar rastreamento e operacoes de campo.',
    checkpoints: [
      'Captura latitude/longitude de inicio.',
      'Cria evento START_JOURNEY na fila local quando estiver offline.',
      'Rastreamento continua apenas durante a jornada ativa.',
    ],
    outputs: ['journey_started', 'gps_tracking_enabled'],
  },
  {
    id: '03',
    title: 'Check-in com foto obrigatoria',
    description:
      'A visita so nasce apos o promotor chegar ao cliente, validar geofence e tirar a foto obrigatoria do estabelecimento.',
    checkpoints: [
      'Valida raio permitido do cliente.',
      'Exige justificativa fora da area.',
      'Grava data/hora visual na foto e salva metadados estruturados.',
    ],
    outputs: ['visit_created', 'checkin_photo', 'location_event'],
  },
  {
    id: '04',
    title: 'Execucao do atendimento',
    description:
      'Durante o trabalho no PDV, o app guia a captura do antes, checklist/tempo e demais observacoes operacionais.',
    checkpoints: [
      'Foto BEFORE obrigatoria antes do fechamento.',
      'Checklist de limpeza, organizacao e abastecimento.',
      'Observacoes livres e tempo total calculado pelo intervalo check-in/check-out.',
    ],
    outputs: ['before_evidence', 'service_notes', 'visit_progress'],
  },
  {
    id: '05',
    title: 'Foto final e check-out',
    description:
      'A visita so encerra com a foto AFTER, coordenada final, status de conclusao e validacao completa das obrigatoriedades.',
    checkpoints: [
      'Bloqueio de encerramento se faltar foto ou checklist.',
      'Registro de latitude/longitude e horario de saida.',
      'Atualizacao de status COMPLETED, PARTIAL ou NOT_DONE.',
    ],
    outputs: ['after_evidence', 'checkout_event', 'visit_duration'],
  },
  {
    id: '06',
    title: 'Sincronizacao e reconciliacao',
    description:
      'Quando a internet retorna, o motor local envia os eventos por dependencia, recebe IDs remotos e atualiza a operacao local.',
    checkpoints: [
      'Fotos nao sobem antes do check-in existir remotamente.',
      'Checklist e checkout aguardam fotos sincronizadas.',
      'Falhas ficam visiveis para o promotor e para o supervisor.',
    ],
    outputs: ['remote_ids', 'synced_visit', 'pending_alerts'],
  },
];

export const syncRules: BlueprintCard[] = [
  {
    title: 'Ordem de envio',
    summary: 'A fila respeita a dependencia real do fluxo para impedir inconsistencias de visita.',
    bullets: [
      'START_JOURNEY -> TRACK_POINT -> CHECK_IN -> UPLOAD_PHOTO -> SUBMIT_CHECKLIST -> UPDATE_NOTES -> CHECK_OUT -> END_JOURNEY.',
      'Fotos do depois aguardam foto do antes e visita remota valida.',
      'Check-out nao sobe enquanto houver foto ou checklist pendente da mesma visita.',
    ],
  },
  {
    title: 'Idempotencia e conflito',
    summary: 'Cada evento critico sai com identificador unico para reprocessamento seguro.',
    bullets: [
      'eventId por jornada, GPS, check-in, foto, checklist e check-out.',
      'Servidor devolve o mesmo registro quando recebe um reenvio duplicado.',
      'Mudancas de roteiro usam versao para detectar republicacao do supervisor.',
    ],
  },
  {
    title: 'Persistencia local',
    summary: 'Nada do trabalho do promotor depende de RAM ou de conexao momentanea.',
    bullets: [
      'Sessao, roteiro, fila, rascunhos e historico ficam salvos no aparelho.',
      'Fotos ficam no filesystem local com referencia no banco local.',
      'Estados de sync e erros por item continuam visiveis apos fechar o app.',
    ],
  },
  {
    title: 'Tratamento de falhas',
    summary: 'A operacao precisa cair para um estado claro, recuperavel e auditavel.',
    bullets: [
      'Retry com backoff exponencial para rede e 5xx.',
      'Falha de auth invalida a sessao e exige novo login online.',
      'Itens com erro continuam listados em pendencias de sincronizacao no mobile e no painel.',
    ],
  },
];

export const wireframes: BlueprintWireframe[] = [
  {
    title: 'Login operacional',
    channel: 'Mobile',
    status: 'Implementado na base atual',
    summary: 'Acesso rapido com status de conexao, diagnostico da API e mensagem clara para o promotor.',
    regions: ['Cabecalho com identidade', 'Formulario de credenciais', 'Status de conectividade', 'Acoes de entrar e diagnosticar'],
  },
  {
    title: 'Roteiro do dia',
    channel: 'Mobile',
    status: 'Implementado na base atual',
    summary: 'Lista ordenada de clientes, busca local, status da visita e indicacao do proximo passo.',
    regions: ['Resumo da jornada', 'Busca local', 'Lista de clientes', 'Indicadores de sync pendente'],
  },
  {
    title: 'Check-in com foto',
    channel: 'Mobile',
    status: 'Implementado na base atual',
    summary: 'Fluxo guiado para chegada ao PDV com geofence, justificativa e evidencia obrigatoria.',
    regions: ['Resumo do cliente', 'Status de geofence', 'Captura de foto do estabelecimento', 'Confirmacao do check-in'],
  },
  {
    title: 'Fotos antes e depois',
    channel: 'Mobile',
    status: 'Implementado na base atual',
    summary: 'Etapas curtas para capturar evidencias BEFORE e AFTER com proxima acao sempre visivel.',
    regions: ['Instrucoes da etapa', 'Galeria local da visita', 'Botao de capturar', 'CTA de continuidade'],
  },
  {
    title: 'Checklist e fechamento',
    channel: 'Mobile',
    status: 'Implementado na base atual',
    summary: 'Checklist obrigatorio, observacoes e check-out com bloqueios explicitos se algo estiver faltando.',
    regions: ['Perguntas obrigatorias', 'Observacoes', 'Requisitos faltantes', 'Confirmacao de encerramento'],
  },
  {
    title: 'Sincronizacao pendente',
    channel: 'Mobile',
    status: 'Implementado na base atual',
    summary: 'Tela para fila local, tentativas, horario da ultima sincronizacao e erros recuperaveis.',
    regions: ['Resumo de conectividade', 'Fila de eventos', 'Estados por item', 'Acao de sincronizar agora'],
  },
  {
    title: 'Dashboard supervisor',
    channel: 'Web',
    status: 'Implementado na base atual',
    summary: 'Visao rapida do dia com KPI, mapa, equipe, alertas e atalhos operacionais.',
    regions: ['Cabecalho executivo', 'KPI cards', 'Mapa operacional', 'Alertas e atalhos'],
  },
  {
    title: 'Cadastro de clientes',
    channel: 'Web',
    status: 'Implementado na base atual',
    summary: 'Tela corporativa para geofence, importacao, observacoes e vinculo de responsavel.',
    regions: ['Filtros e busca', 'Tabela principal', 'Formulario lateral ou modal', 'Historico de importacao'],
  },
  {
    title: 'Roteiros e publicacao',
    channel: 'Web',
    status: 'Implementado na base atual',
    summary: 'Planejamento diario com edicao de ordem, contexto do promotor e publicacao versionada.',
    regions: ['Contexto do roteiro', 'Grade de paradas', 'Busca de clientes', 'Barra de acoes'],
  },
  {
    title: 'Mapa e relatorios',
    channel: 'Web',
    status: 'Implementado na base atual',
    summary: 'Monitoramento do dia com filtros por promotor, cliente, rota, evidencias e fora de geofence.',
    regions: ['Filtro por periodo', 'Mapa ou consolidado', 'Tabela de apoio', 'Cards de indicadores'],
  },
  {
    title: 'Blueprint tecnico',
    channel: 'Web',
    status: 'Estruturado para a proxima etapa',
    summary: 'Modulo interno para alinhar arquitetura, banco, APIs, sync e wireframes durante a evolucao do produto.',
    regions: ['Arquitetura por camadas', 'Estrutura de pastas', 'Banco e APIs', 'Wireframes e regras offline'],
  },
];
