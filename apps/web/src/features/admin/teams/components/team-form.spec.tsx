import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamForm } from './team-form';

describe('TeamForm', () => {
  it('envia a equipe com supervisor e promotores selecionados', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <TeamForm
        mode="create"
        supervisors={[
          {
            id: 'supervisor-1',
            name: 'Supervisor Centro',
            email: 'supervisor.centro@formula.local',
            employeeCode: 'SUP-001',
            region: 'Centro',
          },
        ]}
        promoters={[
          {
            id: 'promoter-1',
            name: 'Promotor Centro',
            email: 'promotor.centro@formula.local',
            employeeCode: 'PROM-001',
            region: 'Centro',
            status: 'ACTIVE',
            active: true,
            supervisorName: 'Supervisor Centro',
          },
          {
            id: 'promoter-2',
            name: 'Promotor Norte',
            email: 'promotor.norte@formula.local',
            employeeCode: 'PROM-002',
            region: 'Norte',
            status: 'INACTIVE',
            active: false,
            supervisorName: 'Supervisor Centro',
          },
        ]}
        saving={false}
        cancelHref="/dashboard/teams"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nome da equipe'), {
      target: { value: 'Equipe Centro' },
    });
    fireEvent.change(screen.getByLabelText('Codigo da equipe'), {
      target: { value: 'EQ-CENTRO' },
    });
    fireEvent.change(screen.getByLabelText('Supervisor responsavel'), {
      target: { value: 'supervisor-1' },
    });
    fireEvent.click(screen.getByLabelText(/Promotor Centro/i));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar equipe' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Equipe Centro',
        code: 'EQ-CENTRO',
        supervisorUserId: 'supervisor-1',
        promoterIds: ['promoter-1'],
      }),
    );
  });

  it('filtra a lista de promotores pela busca local', async () => {
    render(
      <TeamForm
        mode="create"
        supervisors={[]}
        promoters={[
          {
            id: 'promoter-1',
            name: 'Promotor Centro',
            email: 'promotor.centro@formula.local',
            employeeCode: 'PROM-001',
            region: 'Centro',
            status: 'ACTIVE',
            active: true,
            supervisorName: 'Supervisor Centro',
          },
          {
            id: 'promoter-2',
            name: 'Promotor Norte',
            email: 'promotor.norte@formula.local',
            employeeCode: 'PROM-002',
            region: 'Norte',
            status: 'ACTIVE',
            active: true,
            supervisorName: 'Supervisor Norte',
          },
        ]}
        saving={false}
        cancelHref="/dashboard/teams"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.change(screen.getByLabelText('Buscar promotor'), {
      target: { value: 'Norte' },
    });

    expect(screen.getByText('Promotor Norte')).toBeTruthy();
    expect(screen.queryByText('Promotor Centro')).toBeNull();
  });
});
