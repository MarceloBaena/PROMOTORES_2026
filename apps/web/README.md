# @promotor/web

Portal web operacional em Next.js.

Perfis cobertos neste workspace:

- `ADMIN`: dashboard corporativo e administracao
- `SUPERVISOR`: dashboard, mapa, visitas, alertas, evidencias, clientes e roteiros diarios, semanais e mensais com templates e historico
- `PROMOTER`: workspace operacional no navegador, inclusive para uso em Android, com atualizacao automatica de rota e notificacoes operacionais

Use o README raiz em `../../README.md` como documentacao principal de setup, auth, execucao e validacao do painel.

Scripts mais usados neste workspace:

- `npm run dev -w @promotor/web`
- `npm run lint -w @promotor/web`
- `npm run typecheck -w @promotor/web`
- `npm run test -w @promotor/web`
- `npm run build -w @promotor/web`
- `npm run validate:login -w @promotor/web`
- `npm run validate:panel -w @promotor/web`

Padrao estrutural de layout para novas telas:

- use `PageContainer` em `src/components/ui/layout-primitives.tsx` como wrapper raiz de paginas e workspaces
- use `SectionCard` como container padrao de bloco operacional; ele ja aplica `section-container`
- use `ResponsiveFormGrid` para formularios em vez de grids manuais com colunas fixas
- use `ResponsiveGrid` para conjuntos de cards/atalhos/metricas quando a grade nao for uma tabela
- use `DataTable` para listas tabulares; ele ja inclui comportamento desktop/mobile e rolagem interna segura
- use `HeaderActionBar` e `FooterActionBar` para grupos de botoes em cabecalho e rodape
- evite texto operacional longo em `info-chip` e `badge`; prefira `p.hint`, `NoticeCard` ou blocos dedicados
- evite `min-width` manual em containers de pagina; se precisar de largura extra, concentre isso em rolagem interna do componente
