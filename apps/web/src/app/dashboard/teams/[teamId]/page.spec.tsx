import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamDetailPage from './page';

const { mockReplace, teamDetailResponse, getTeamDetailMock, updateTeamStatusMock } = vi.hoisted(
  () => ({
    mockReplace: vi.fn(),
    teamDetailResponse: {
      id: 'team-1',
      name: 'Equipe Centro',
      code: 'EQ-CENTRO',
      description: 'Equipe responsavel pela operacao da regiao central.',
      region: 'Cuiaba Centro',
      supervisorUserId: 'supervisor-1',
      supervisorName: 'Supervisor Operacional',
      supervisorEmail: 'supervisor@formula.local',
      status: 'ACTIVE',
      active: true,
      promotersCount: 2,
      createdAt: '2026-04-01T09:00:00.000Z',
      updatedAt: '2026-04-01T10:15:00.000Z',
      members: [
        {
          id: 'member-1',
          promoterId: 'promoter-record-1',
          promoterUserId: 'user-promoter-1',
          promoterName: 'Promotor Centro',
          promoterEmail: 'promotor.centro@formula.local',
          employeeCode: 'PROM-001',
          region: 'Cuiaba Centro',
          status: 'ACTIVE',
          active: true,
          supervisorUserId: 'supervisor-1',
          supervisorName: 'Supervisor Operacional',
          createdAt: '2026-04-01T09:10:00.000Z',
        },
        {
          id: 'member-2',
          promoterId: 'promoter-record-2',
          promoterUserId: 'user-promoter-2',
          promoterName: 'Promotor CPA',
          promoterEmail: 'promotor.cpa@formula.local',
          employeeCode: 'PROM-002',
          region: 'CPA',
          status: 'INACTIVE',
          active: false,
          supervisorUserId: 'supervisor-1',
          supervisorName: 'Supervisor Operacional',
          createdAt: '2026-04-01T09:12:00.000Z',
        },
      ],
    },
    getTeamDetailMock: vi.fn(),
    updateTeamStatusMock: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  useParams: () => ({ teamId: 'team-1' }),
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock('@/lib/use-hydrated', () => ({
  useHydrated: () => true,
}));

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: (
    selector: (state: {
      user: { id: string; role: 'SUPERVISOR'; name: string; email: string };
    }) => unknown,
  ) =>
    selector({
      user: {
        id: 'supervisor-1',
        role: 'SUPERVISOR',
        name: 'Supervisor Operacional',
        email: 'supervisor@formula.local',
      },
    }),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getTeamDetail: getTeamDetailMock,
    updateTeamStatus: updateTeamStatusMock,
  };
});

describe('TeamDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamDetailMock.mockResolvedValue(teamDetailResponse);
    updateTeamStatusMock.mockResolvedValue({
      id: 'team-1',
      status: 'INACTIVE',
      active: false,
      updatedAt: '2026-04-01T11:00:00.000Z',
    });
  });

  it('renderiza o wireframe simples com cabecalho, resumo, promotores e acoes finais', async () => {
    render(<TeamDetailPage />);

    await waitFor(() => {
      expect(getTeamDetailMock).toHaveBeenCalledWith('team-1');
    });

    expect(screen.getByRole('heading', { name: 'Equipe Centro' })).toBeDefined();
    expect(screen.getByText('EQ-CENTRO')).toBeDefined();
    expect(screen.getAllByRole('link', { name: 'Editar equipe' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Inativar equipe' })).toBeDefined();

    expect(screen.getByRole('heading', { name: 'Informacoes principais' })).toBeDefined();
    expect(screen.getByText('Supervisor Operacional')).toBeDefined();
    expect(screen.getByText('Cuiaba Centro')).toBeDefined();

    expect(screen.getByRole('heading', { name: 'Resumo' })).toBeDefined();
    expect(screen.getByText('Quantidade de promotores')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();

    expect(screen.getByRole('heading', { name: 'Promotores vinculados' })).toBeDefined();
    expect(screen.getByText('Promotor Centro')).toBeDefined();
    expect(screen.getByText('Promotor CPA')).toBeDefined();

    const collaboratorLinks = screen.getAllByRole('link', { name: 'Ver colaborador' });
    expect(collaboratorLinks).toHaveLength(2);
    expect(collaboratorLinks[0]?.getAttribute('href')).toBe(
      '/dashboard/collaborators/user-promoter-1',
    );

    expect(screen.getByRole('link', { name: 'Voltar' })).toBeDefined();
  });
});
