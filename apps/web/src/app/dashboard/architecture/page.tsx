import { NoticeCard } from '@/components/ui/notice-card';
import { PageContainer, ResponsiveGrid } from '@/components/ui/layout-primitives';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatsCard } from '@/components/ui/stats-card';
import {
  apiGroups,
  architectureLayers,
  backendModules,
  blueprintHighlights,
  blueprintOverviewStats,
  databaseDomains,
  folderStructure,
  mobileFlowStages,
  syncRules,
  wireframes,
} from '@/features/system-blueprint/blueprint';

const toneMap = {
  default: undefined,
  success: 'success',
  warning: 'warning',
} as const;

export default function ArchitecturePage() {
  return (
    <PageContainer className="blueprint-page">
      <PageHeader
        eyebrow="Blueprint"
        title="Arquitetura, banco, fluxos e primeira camada visual do sistema"
        description="Referencia viva para evoluir o sistema de promotores sem perder o foco em offline-first, usabilidade de campo, contratos estaveis e rastreabilidade."
        meta={
          <>
            <span className="badge badge-in-progress">Base atual em producao tecnica</span>
            <span className="badge badge-partial">Android Kotlin como alvo da proxima fase</span>
            <span className="badge badge-completed">
              Sem dependencia de internet no atendimento
            </span>
          </>
        }
      />

      <NoticeCard
        title="Estado atual x arquitetura alvo"
        description="O repositorio ja possui API NestJS, painel Next.js e um cliente mobile Expo com fila offline. O blueprint abaixo organiza a evolucao para o app Android Kotlin, preservando os contratos de API, as regras operacionais e o que ja esta funcional hoje."
      />

      <section className="stats-grid">
        {blueprintOverviewStats.map((item) => (
          <StatsCard
            key={item.label}
            label={item.label}
            tone={item.tone ? toneMap[item.tone] : undefined}
            value={item.value}
          />
        ))}
      </section>

      <SectionCard
        title="Principios de decisao"
        description="Premissas que seguram a operacao real em campo e orientam a evolucao tecnica."
      >
        <div className="stack">
          {blueprintHighlights.map((item) => (
            <article key={item} className="list-card">
              <strong>{item}</strong>
            </article>
          ))}
        </div>
      </SectionCard>

      <section className="split-grid split-grid-wide">
        <SectionCard
          title="Arquitetura completa por camada"
          description="Leitura de alto nivel do produto, do promotor em campo ate a governanca corporativa."
        >
          <ResponsiveGrid className="blueprint-card-grid" minItemWidth="18rem">
            {architectureLayers.map((layer) => (
              <article key={layer.title} className="blueprint-panel">
                <div className="blueprint-panel-header">
                  <strong>{layer.title}</strong>
                  {layer.tags?.length ? (
                    <div className="blueprint-chip-row">
                      {layer.tags.map((tag) => (
                        <span key={tag} className="blueprint-chip">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <p className="hint">{layer.summary}</p>
                <ul className="blueprint-list">
                  {layer.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            ))}
          </ResponsiveGrid>
        </SectionCard>

        <SectionCard
          title="Estrutura de pastas proposta"
          description="Separacao para sustentar o estado atual e abrir caminho para o cliente Android nativo sem baguncar o monorepo."
        >
          <pre className="blueprint-tree">{folderStructure}</pre>
        </SectionCard>
      </section>

      <section className="split-grid split-grid-wide">
        <SectionCard
          title="Modelagem do banco"
          description="Dominios de dados da plataforma, incluindo a persistencia local planejada para o Android Kotlin."
        >
          <ResponsiveGrid className="blueprint-card-grid" minItemWidth="17rem">
            {databaseDomains.map((domain) => (
              <article key={domain.title} className="blueprint-panel">
                <div className="blueprint-panel-header">
                  <strong>{domain.title}</strong>
                </div>
                <p className="hint">{domain.summary}</p>
                <div className="blueprint-chip-row">
                  {domain.entities.map((entity) => (
                    <span key={entity} className="blueprint-chip">
                      {entity}
                    </span>
                  ))}
                </div>
                <ul className="blueprint-list">
                  {domain.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </article>
            ))}
          </ResponsiveGrid>
        </SectionCard>

        <SectionCard
          title="Estrutura do backend"
          description="Como os modulos do servidor ficam distribuidos para manter camadas limpas e regras de negocio centralizadas."
        >
          <div className="stack">
            {backendModules.map((module) => (
              <article key={module.title} className="blueprint-panel">
                <div className="blueprint-panel-header">
                  <strong>{module.title}</strong>
                </div>
                <p className="hint">{module.summary}</p>
                <ul className="blueprint-list">
                  {module.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="split-grid split-grid-wide">
        <SectionCard
          title="Fluxo do app promotor"
          description="Sequencia operacional ideal para atendimento em campo, com travas explicitas e foco em usabilidade."
        >
          <div className="stack">
            {mobileFlowStages.map((stage) => (
              <article key={stage.id} className="blueprint-panel blueprint-stage">
                <div className="list-card-header">
                  <span className="badge badge-in-progress">Etapa {stage.id}</span>
                  <span className="hint">{stage.outputs.join(' | ')}</span>
                </div>
                <strong>{stage.title}</strong>
                <p className="hint">{stage.description}</p>
                <ul className="blueprint-list">
                  {stage.checkpoints.map((checkpoint) => (
                    <li key={checkpoint}>{checkpoint}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="APIs necessarias"
          description="Conjunto minimo de endpoints para cadastros, roteiro, execucao, sync e supervisao."
        >
          <div className="stack">
            {apiGroups.map((group) => (
              <article key={group.title} className="blueprint-panel">
                <div className="blueprint-panel-header">
                  <strong>{group.title}</strong>
                </div>
                <p className="hint">{group.summary}</p>
                <ul className="blueprint-list">
                  {group.endpoints.map((endpoint) => (
                    <li key={endpoint}>
                      <code>{endpoint}</code>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="Sincronizacao offline-first"
        description="Regras de orquestracao online/offline para manter o promotor trabalhando e o servidor consistente."
      >
        <ResponsiveGrid className="blueprint-card-grid" minItemWidth="16rem">
          {syncRules.map((rule) => (
            <article key={rule.title} className="blueprint-panel">
              <div className="blueprint-panel-header">
                <strong>{rule.title}</strong>
              </div>
              <p className="hint">{rule.summary}</p>
              <ul className="blueprint-list">
                {rule.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </ResponsiveGrid>
      </SectionCard>

      <SectionCard
        title="Wireframes funcionais"
        description="Primeira versao das telas principais, priorizando leitura corporativa no painel e fluxo de poucos toques no promotor."
      >
        <ResponsiveGrid className="blueprint-wireframe-grid" minItemWidth="17rem">
          {wireframes.map((frame) => (
            <article key={`${frame.channel}-${frame.title}`} className="blueprint-wireframe">
              <div className="list-card-header">
                <span className="badge badge-completed">{frame.channel}</span>
                <span className="blueprint-wireframe-status">{frame.status}</span>
              </div>
              <strong>{frame.title}</strong>
              <p className="hint">{frame.summary}</p>
              <div className="blueprint-wireframe-screen">
                {frame.regions.map((region, index) => (
                  <div
                    key={region}
                    className={
                      index === 0
                        ? 'blueprint-wireframe-slot blueprint-wireframe-slot-accent'
                        : 'blueprint-wireframe-slot'
                    }
                  >
                    {region}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </ResponsiveGrid>
      </SectionCard>
    </PageContainer>
  );
}
