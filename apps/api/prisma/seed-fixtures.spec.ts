import {
  ChecklistItemType,
  ScheduleDayOfWeek,
  UserRole,
} from '@prisma/client';
import { buildSeedScenario } from './seed-fixtures';

describe('buildSeedScenario', () => {
  it('gera o conjunto minimo de dados de desenvolvimento exigido', () => {
    const scenario = buildSeedScenario(new Date('2026-03-21T10:30:00.000Z'));

    expect(scenario.company.code).toBe('FORMULA');
    expect(scenario.users).toHaveLength(4);
    expect(scenario.users.filter((user) => user.role === UserRole.ADMIN)).toHaveLength(1);
    expect(
      scenario.users.filter((user) => user.role === UserRole.SUPERVISOR),
    ).toHaveLength(1);
    expect(
      scenario.users.filter((user) => user.role === UserRole.PROMOTER),
    ).toHaveLength(2);
    expect(scenario.promoters).toHaveLength(2);
    expect(scenario.customers).toHaveLength(10);
    expect(scenario.schedules).toHaveLength(10);
    expect(scenario.checklistTemplate.questions).toHaveLength(4);
    expect(scenario.routePlan.items).toHaveLength(10);
  });

  it('gera roteiro no inicio do dia e agenda coerente com a data de referencia', () => {
    const scenario = buildSeedScenario(new Date('2026-03-23T18:15:00.000Z'));

    expect(scenario.routePlan.routeDate.getHours()).toBe(0);
    expect(scenario.routePlan.routeDate.getMinutes()).toBe(0);
    expect(scenario.routePlan.routeDate.getSeconds()).toBe(0);
    expect(scenario.routePlan.routeDate.getMilliseconds()).toBe(0);
    expect(scenario.schedules[0]?.dayOfWeek).toBe(ScheduleDayOfWeek.MONDAY);
    expect(scenario.checklistTemplate.questions[0]).toMatchObject({
      code: 'MIX',
      type: ChecklistItemType.BOOLEAN,
      required: true,
      sortOrder: 1,
    });
  });
});
