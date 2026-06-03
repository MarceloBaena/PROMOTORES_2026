import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChecklistItemDto, SyncPullQueryDto } from './operations.dto';

describe('Operations DTO contracts', () => {
  it('rejeita value nao booleano quando o checklist for BOOLEAN', () => {
    const instance = plainToInstance(ChecklistItemDto, {
      code: 'LIMPEZA',
      label: 'Limpeza',
      type: 'BOOLEAN',
      required: true,
      value: 'sim',
    });

    const errors = validateSync(instance);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('value');
  });

  it('rejeita value vazio quando o checklist for TEXT', () => {
    const instance = plainToInstance(ChecklistItemDto, {
      code: 'OBS',
      label: 'Observacao',
      type: 'TEXT',
      required: true,
      value: '   ',
    });

    const errors = validateSync(instance);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('value');
  });

  it('rejeita routeDate fora do formato yyyy-mm-dd no pull de sync', () => {
    const instance = plainToInstance(SyncPullQueryDto, {
      routeDate: '23/04/2026',
    });

    const errors = validateSync(instance);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('routeDate');
  });
});
