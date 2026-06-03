# Auditoria Tecnica e Visual

Data: 2026-03-24

## Escopo auditado

- Web App Next.js (`apps/web`)
- App mobile Expo (`apps/mobile`)
- Contratos e segregacao de permissao na API NestJS (`apps/api`)

## Mapa atual

### Web

- Rotas publicas
  - `/`: login web
- Rotas supervisor/admin
  - `/dashboard`
  - `/dashboard/map`
  - `/dashboard/team`
  - `/dashboard/visits`
  - `/dashboard/visits/[visitId]`
  - `/dashboard/evidences`
  - `/dashboard/customers`
  - `/dashboard/route-plans`
  - `/dashboard/alerts`
  - `/dashboard/reports`
  - `/dashboard/collaborators`
  - `/dashboard/collaborators/new`
  - `/dashboard/collaborators/[collaboratorId]`
- Rotas promotor
  - `/workspace`

### Layouts e shell

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/dashboard/layout.tsx`
- `apps/web/src/app/workspace/layout.tsx`
- `apps/web/src/components/app-shell.tsx`

### Componentes web atuais

- `apps/web/src/components/login-form.tsx`
- `apps/web/src/components/page-states.tsx`
- `apps/web/src/components/status-badge.tsx`
- `apps/web/src/components/promoter-workspace.tsx`
- `apps/web/src/components/collaborator-form.tsx`
- `apps/web/src/components/operational-map.tsx`
- `apps/web/src/components/dashboard-map.tsx`

### Hooks / stores / services web

- Hook unico identificado: `apps/web/src/lib/use-hydrated.ts`
- Store de sessao: `apps/web/src/lib/auth-store.ts`
- Regras de roteamento por perfil: `apps/web/src/lib/auth-routing.ts`
- Cliente de API e auth refresh: `apps/web/src/lib/api.ts`
- Validacao de formularios: `apps/web/src/lib/form-validation.ts`
- Fluxo operacional do promotor: `apps/web/src/lib/promoter-workflow.ts`

### Estilos web

- Arquivo central unico: `apps/web/src/app/globals.css`

### Mobile

- Orquestrador principal: `apps/mobile/src/promoter-app.tsx`
- Telas:
  - `login-screen.tsx`
  - `dashboard-screen.tsx`
  - `clients-screen.tsx`
  - `visit-detail-screen.tsx`
  - `check-in-screen.tsx`
  - `photos-screen.tsx`
  - `checklist-screen.tsx`
  - `notes-screen.tsx`
  - `checkout-screen.tsx`
  - `history-screen.tsx`
  - `sync-screen.tsx`
- UI compartilhada mobile:
  - `apps/mobile/src/components/mobile-ui.tsx`

### API e perfis

- Auth: `apps/api/src/auth`
- Supervisor/Admin: `apps/api/src/supervisor`
- Promotor operacional: `apps/api/src/operations`, `apps/api/src/visits`, `apps/api/src/route-plans`, `apps/api/src/journeys`
- Admin de colaboradores: `apps/api/src/collaborators`

## Segregacao atual por perfil

- `PROMOTER`
  - Web: `/workspace`
  - Mobile: app Expo
  - API: rotas de operacao protegidas por `@Roles(UserRole.PROMOTER)`
- `SUPERVISOR`
  - Web: `/dashboard/*`
  - API: `@Roles(UserRole.SUPERVISOR, UserRole.ADMIN)` no modulo supervisor
- `ADMIN`
  - Web: `/dashboard/*` com modulo adicional de colaboradores
  - API: `@Roles(UserRole.ADMIN)` em colaboradores

## Inconsistencias e riscos encontrados

### 1. Arquitetura visual existe, mas ainda e acoplada por pagina

Onde:

- `apps/web/src/app/globals.css`
- `apps/web/src/app/dashboard/**/*.tsx`
- `apps/web/src/components/app-shell.tsx`

Problema:

- Existe um conjunto de classes reutilizadas (`hero-card`, `section-card`, `toolbar`, `table-wrap`), mas a composicao real ainda e feita manualmente em cada pagina.
- Varias telas repetem header, filtros, busca com icone, tabela, cards e acoes com pequenas variacoes.
- O padrao visual depende de markup repetido, nao de componentes estruturais.

Impacto:

- Alto custo para evoluir o sistema inteiro.
- Responsividade inconsistente.
- Mudanca de estilo exige tocar em muitas telas.

Correcao proposta:

- Extrair camada de componentes padronizados: `PageHeader`, `StatsCard`, `SectionCard`, `DataTable`, `FilterBar`, `FormField`, `EmptyState`, `ConfirmDialog`, `PhotoUploader`, `ActionBar`.

### 2. Login web tem linguagem e composicao de landing page

Onde:

- `apps/web/src/app/page.tsx`

Problema:

- Split layout com bloco visual promocional, grid de cards informativos e copy de apresentacao.
- A entrada do sistema corporativo parece mais uma vitrine do que um acesso operacional.

Impacto:

- Ruim para contexto corporativo.
- Polui o foco do usuario.
- Enfraquece a coerencia com o restante do produto.

Correcao proposta:

- Transformar o login em acesso corporativo objetivo, com contexto operacional, status de ambiente e ajuda curta.

### 3. Sidebar e topbar nao formam um shell responsivo real

Onde:

- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/app/globals.css`

Problema:

- Em telas menores, o layout apenas empilha blocos.
- Nao existe drawer responsivo, navegacao compacta ou comportamento mobile-first.
- O shell mistura navegação, status de ambiente, perfil e logout no mesmo componente.

Impacto:

- Uso ruim em tablets e celulares.
- Dashboard de supervisor/admin perde clareza.

Correcao proposta:

- Separar `AppShell`, `Sidebar`, `Topbar` e navegação mobile.
- Centralizar o schema de menu e permissao.

### 4. Tabelas nao estao adaptadas para mobile

Onde:

- `apps/web/src/app/globals.css`
- paginas de `team`, `visits`, `customers`, `map`, `reports`, `collaborators`

Problema:

- O padrao atual usa `overflow-x: auto` e `min-width` fixa.
- Isso preserva o desktop, mas nao entrega leitura operacional no celular.

Impacto:

- Filtro e consulta ficam lentos no campo.
- O usuario precisa arrastar horizontalmente para entender informacao essencial.

Correcao proposta:

- Criar `DataTable` com fallback mobile em `MobileListCard`.
- Manter tabela no desktop e cards compactos no mobile.

### 5. Confirmacoes sensiveis ainda usam `window.confirm`

Onde:

- `apps/web/src/app/dashboard/collaborators/page.tsx`
- `apps/web/src/app/dashboard/collaborators/[collaboratorId]/page.tsx`

Problema:

- Dialog nativo inconsistente com a interface.
- Experiencia fraca no mobile web.
- Baixa clareza para acoes irreversiveis ou sensiveis.

Impacto:

- Risco de erro operacional.
- UX pobre em administracao.

Correcao proposta:

- Substituir por `ConfirmDialog` padronizado.

### 6. Fluxo do promotor no web esta funcional, mas concentrado demais em um unico componente

Onde:

- `apps/web/src/components/promoter-workspace.tsx`

Problema:

- O componente tem mais de mil linhas e concentra carregamento, rastreio, check-in, checklist, foto, notas, checkout e renderizacao.
- A composicao de UI e a logica de negocio estao fortemente acopladas.

Impacto:

- Risco alto ao evoluir check-in/check-out.
- Testabilidade baixa.
- Dificulta padronizacao de componentes.

Correcao proposta:

- Extrair subcomponentes e blocos de etapa.
- Introduzir `PhotoUploader`, `ActionBar` mobile e cards operacionais reutilizaveis.

### 7. App mobile tem boa base operacional, mas o orquestrador esta monolitico

Onde:

- `apps/mobile/src/promoter-app.tsx`

Problema:

- Navegacao manual, sync, auth, jornada, fotos, checklist e checkout ficam no mesmo arquivo.
- A UI das telas e consistente, mas a orquestracao esta centralizada demais.

Impacto:

- Alto custo de manutencao.
- Risco ao mexer em offline, fila e auth.

Correcao proposta:

- Preservar logica funcional.
- Reduzir acoplamento do orquestrador e consolidar componentes mobile reutilizaveis.

### 8. Estrutura de pastas no web ainda e centrada em rotas, nao em dominios

Onde:

- `apps/web/src/app`
- `apps/web/src/components`
- `apps/web/src/lib`

Problema:

- Paginas carregam dados e montam UI diretamente.
- Componentes compartilhados e componentes de dominio ficam misturados.
- Nao existe separacao clara entre supervisor, admin e promotor.

Impacto:

- Baixa escalabilidade da base.
- Mais chance de duplicacao.

Correcao proposta:

- Introduzir organizacao por dominio/perfil:
  - `features/admin`
  - `features/supervisor`
  - `features/promoter`
  - `components/ui`
  - `components/layout`

### 9. Permissoes funcionais estao corretas, mas o front nao centraliza visibilidade e intencao de acesso

Onde:

- `apps/web/src/lib/auth-routing.ts`
- `apps/web/src/components/app-shell.tsx`
- layouts `dashboard` e `workspace`

Problema:

- As guardas basicas funcionam, mas menu, layout e visibilidade ainda dependem de filtros locais.
- Nao existe um mapa unico de modulos por perfil.

Impacto:

- Facilidade de regressao quando novos modulos forem adicionados.

Correcao proposta:

- Centralizar definicao de modulos, rotas e visibilidade por perfil.

### 10. Formularios administrativos ainda usam combinacao de grid generico e campos ad hoc

Onde:

- `customers/page.tsx`
- `route-plans/page.tsx`
- `collaborator-form.tsx`

Problema:

- Repeticao de labels, help text, erros e espacamentos.
- Falta de padrao unico de campo.

Impacto:

- Experiencia desigual entre modulos.
- Maior custo para manter validacao e acessibilidade.

Correcao proposta:

- Criar `FormField` reutilizavel e alinhar formularios a um mesmo padrão.

## O que sera corrigido na refatoracao

### Base arquitetural

- Criacao de uma camada de componentes corporativos padronizados.
- Reorganizacao dos componentes compartilhados em `layout`, `ui` e `features` por perfil.
- Centralizacao do mapa de navegacao/permissao.

### Fluxos

- Login com foco operacional.
- Dashboards supervisor/admin com cabeçalhos, filtros e tabelas padronizados.
- Workspace do promotor reorganizado em etapas claras.
- Formularios administrativos alinhados ao mesmo padrão.

### Responsividade

- Tabelas com modo mobile em cards.
- Barras de acao mais objetivas.
- Melhor leitura em telas pequenas.
- Navegacao mais clara para uso em campo.

## Impacto esperado

- Menor duplicacao estrutural.
- Menor risco de regressao visual.
- Melhor manutencao por modulo e por perfil.
- Melhor uso em celular sem parecer desktop comprimido.
- Produto com cara de plataforma operacional real, nao de pagina de apresentacao.

## Ordem de execucao da refatoracao

1. Base visual compartilhada e shell
2. Login
3. Dashboard supervisor/admin
4. Modulos tabulares e formularios administrativos
5. Workspace do promotor no web
6. Ajustes de responsividade
7. Revisao final de permissoes, lint, typecheck, testes e build
