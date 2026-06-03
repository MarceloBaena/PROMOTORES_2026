import {
  ChecklistItemType,
  EmploymentStatus,
  ScheduleDayOfWeek,
  UserRole,
} from '@prisma/client';

export interface SeedUserFixture {
  key: 'admin' | 'supervisor' | 'promoter_a' | 'promoter_b';
  email: string;
  name: string;
  password: string;
  role: UserRole;
  phone: string;
  cpf: string;
  employeeCode: string;
  hireDate: Date;
  region: string;
  notes: string;
  status: EmploymentStatus;
}

export interface SeedCustomerFixture {
  code: string;
  winthorCustomerCode: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
  stateRegistration: string;
  contactName: string;
  phone: string;
  email: string;
  zipCode: string;
  address: string;
  addressNumber: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  routeName: string;
  region: string;
  supervisorUserKey: 'supervisor';
  defaultPromoterUserKey: 'promoter_a' | 'promoter_b';
  visitFrequency: string;
  preferredVisitDays: string[];
  preferredVisitTimeStart: string;
  preferredVisitTimeEnd: string;
  notes: string;
}

const startOfDay = (referenceDate: Date) => {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addMinutes = (referenceDate: Date, minutes: number) => {
  const value = new Date(referenceDate);
  value.setMinutes(value.getMinutes() + minutes);
  return value;
};

const toScheduleDay = (date: Date): ScheduleDayOfWeek => {
  const days: ScheduleDayOfWeek[] = [
    ScheduleDayOfWeek.SUNDAY,
    ScheduleDayOfWeek.MONDAY,
    ScheduleDayOfWeek.TUESDAY,
    ScheduleDayOfWeek.WEDNESDAY,
    ScheduleDayOfWeek.THURSDAY,
    ScheduleDayOfWeek.FRIDAY,
    ScheduleDayOfWeek.SATURDAY,
  ];

  return days[date.getDay()];
};

export const buildSeedScenario = (referenceDate = new Date()) => {
  const routeDate = startOfDay(referenceDate);
  const scheduleDayOfWeek = toScheduleDay(routeDate);

  const users: SeedUserFixture[] = [
    {
      key: 'admin',
      email: 'admin@formula.local',
      name: 'Administrador da Distribuidora',
      password: 'Admin@123',
      role: UserRole.ADMIN,
      phone: '66992000001',
      cpf: '11111111111',
      employeeCode: 'ADM-001',
      hireDate: new Date('2024-01-10T08:00:00.000Z'),
      region: 'Matriz',
      notes: 'Usuario administrativo seed para operacao local.',
      status: EmploymentStatus.ACTIVE,
    },
    {
      key: 'supervisor',
      email: 'supervisor@formula.local',
      name: 'Supervisor Operacional',
      password: 'Supervisor@123',
      role: UserRole.SUPERVISOR,
      phone: '66992000002',
      cpf: '22222222222',
      employeeCode: 'SUP-001',
      hireDate: new Date('2024-03-18T08:00:00.000Z'),
      region: 'Rondonopolis Centro',
      notes: 'Supervisor seed responsavel pela equipe principal.',
      status: EmploymentStatus.ACTIVE,
    },
    {
      key: 'promoter_a',
      email: 'promotor.centro@formula.local',
      name: 'Promotor Centro',
      password: 'Promotor@123',
      role: UserRole.PROMOTER,
      phone: '66992000003',
      cpf: '33333333333',
      employeeCode: 'PROM-001',
      hireDate: new Date('2025-01-15T08:00:00.000Z'),
      region: 'Rondonopolis Centro',
      notes: 'Promotor seed do roteiro principal.',
      status: EmploymentStatus.ACTIVE,
    },
    {
      key: 'promoter_b',
      email: 'promotor.leste@formula.local',
      name: 'Promotor Leste',
      password: 'Promotor@123',
      role: UserRole.PROMOTER,
      phone: '66992000004',
      cpf: '44444444444',
      employeeCode: 'PROM-002',
      hireDate: new Date('2025-02-10T08:00:00.000Z'),
      region: 'Rondonopolis Leste',
      notes: 'Promotor seed secundario para painel e validacoes.',
      status: EmploymentStatus.ACTIVE,
    },
  ];

  const customers: SeedCustomerFixture[] = [
    {
      code: 'CLI-001',
      winthorCustomerCode: 'WTH-0001',
      tradeName: 'Supermercado Estrela',
      legalName: 'Estrela Comercio de Alimentos LTDA',
      cnpj: '11222333000101',
      stateRegistration: '001120001',
      contactName: 'Mariana Rocha',
      phone: '66992001001',
      email: 'estrela@clientes.formula.local',
      zipCode: '78700001',
      address: 'Av. Presidente Medici',
      addressNumber: '1200',
      district: 'Centro',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4706,
      longitude: -54.6355,
      geofenceRadiusM: 150,
      routeName: 'Rota Centro',
      region: 'Rondonopolis Centro',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_a',
      visitFrequency: 'SEMANAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '08:00',
      preferredVisitTimeEnd: '18:00',
      notes: 'Cliente seed prioritario do painel.',
    },
    {
      code: 'CLI-002',
      winthorCustomerCode: 'WTH-0002',
      tradeName: 'Mercado Boa Compra',
      legalName: 'Boa Compra Varejo LTDA',
      cnpj: '11222333000102',
      stateRegistration: '001120002',
      contactName: 'Carlos Mendes',
      phone: '66992001002',
      email: 'boacompra@clientes.formula.local',
      zipCode: '78700002',
      address: 'Rua Fernando Correa',
      addressNumber: '890',
      district: 'Centro',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4682,
      longitude: -54.6384,
      geofenceRadiusM: 150,
      routeName: 'Rota Centro',
      region: 'Rondonopolis Centro',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_a',
      visitFrequency: 'SEMANAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '08:30',
      preferredVisitTimeEnd: '18:00',
      notes: 'Base seed da rota principal.',
    },
    {
      code: 'CLI-003',
      winthorCustomerCode: 'WTH-0003',
      tradeName: 'Atacado Campo Forte',
      legalName: 'Campo Forte Distribuicao LTDA',
      cnpj: '11222333000103',
      stateRegistration: '001120003',
      contactName: 'Luciana Prado',
      phone: '66992001003',
      email: 'campoforte@clientes.formula.local',
      zipCode: '78700003',
      address: 'Av. Lions Internacional',
      addressNumber: '1550',
      district: 'Jardim Tropical',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4717,
      longitude: -54.6228,
      geofenceRadiusM: 180,
      routeName: 'Rota Centro',
      region: 'Rondonopolis Centro',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_a',
      visitFrequency: 'QUINZENAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '09:00',
      preferredVisitTimeEnd: '17:30',
      notes: 'Cliente com maior geofence no seed.',
    },
    {
      code: 'CLI-004',
      winthorCustomerCode: 'WTH-0004',
      tradeName: 'Mercadinho do Bairro',
      legalName: 'Mercadinho do Bairro LTDA',
      cnpj: '11222333000104',
      stateRegistration: '001120004',
      contactName: 'Rita Neves',
      phone: '66992001004',
      email: 'bairro@clientes.formula.local',
      zipCode: '78700004',
      address: 'Rua Cuiaba',
      addressNumber: '410',
      district: 'Vila Aurora',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4651,
      longitude: -54.6292,
      geofenceRadiusM: 120,
      routeName: 'Rota Centro',
      region: 'Rondonopolis Centro',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_a',
      visitFrequency: 'SEMANAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '10:00',
      preferredVisitTimeEnd: '18:00',
      notes: 'Cliente seed de bairro com geofence reduzida.',
    },
    {
      code: 'CLI-005',
      winthorCustomerCode: 'WTH-0005',
      tradeName: 'Hiper Alvorada',
      legalName: 'Alvorada Hipermercado SA',
      cnpj: '11222333000105',
      stateRegistration: '001120005',
      contactName: 'Joao Paulo Reis',
      phone: '66992001005',
      email: 'alvorada@clientes.formula.local',
      zipCode: '78700005',
      address: 'Av. Bandeirantes',
      addressNumber: '980',
      district: 'Centro',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4634,
      longitude: -54.6361,
      geofenceRadiusM: 200,
      routeName: 'Rota Centro',
      region: 'Rondonopolis Centro',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_a',
      visitFrequency: 'QUINZENAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '08:00',
      preferredVisitTimeEnd: '17:00',
      notes: 'Hipermercado seed para validacao de filtros.',
    },
    {
      code: 'CLI-006',
      winthorCustomerCode: 'WTH-0006',
      tradeName: 'Armazem Popular',
      legalName: 'Armazem Popular LTDA',
      cnpj: '11222333000106',
      stateRegistration: '001120006',
      contactName: 'Fernanda Costa',
      phone: '66992001006',
      email: 'armazem@clientes.formula.local',
      zipCode: '78700006',
      address: 'Rua Dom Pedro II',
      addressNumber: '145',
      district: 'Jardim Leste',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4746,
      longitude: -54.6313,
      geofenceRadiusM: 130,
      routeName: 'Rota Leste',
      region: 'Rondonopolis Leste',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_b',
      visitFrequency: 'SEMANAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '08:00',
      preferredVisitTimeEnd: '18:00',
      notes: 'Cliente da equipe leste.',
    },
    {
      code: 'CLI-007',
      winthorCustomerCode: 'WTH-0007',
      tradeName: 'Rede Ponto Certo',
      legalName: 'Ponto Certo Varejo LTDA',
      cnpj: '11222333000107',
      stateRegistration: '001120007',
      contactName: 'Patricia Silva',
      phone: '66992001007',
      email: 'pontocerto@clientes.formula.local',
      zipCode: '78700007',
      address: 'Av. Brasil',
      addressNumber: '2120',
      district: 'Jardim Atlantico',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4598,
      longitude: -54.6276,
      geofenceRadiusM: 150,
      routeName: 'Rota Leste',
      region: 'Rondonopolis Leste',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_b',
      visitFrequency: 'QUINZENAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '09:00',
      preferredVisitTimeEnd: '18:00',
      notes: 'Cliente seed para importacao e historico.',
    },
    {
      code: 'CLI-008',
      winthorCustomerCode: 'WTH-0008',
      tradeName: 'Mini Box Primavera',
      legalName: 'Primavera Comercio de Alimentos LTDA',
      cnpj: '11222333000108',
      stateRegistration: '001120008',
      contactName: 'Andressa Melo',
      phone: '66992001008',
      email: 'primavera@clientes.formula.local',
      zipCode: '78700008',
      address: 'Rua Rio Branco',
      addressNumber: '540',
      district: 'Jardim Primavera',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4772,
      longitude: -54.6408,
      geofenceRadiusM: 100,
      routeName: 'Rota Leste',
      region: 'Rondonopolis Leste',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_b',
      visitFrequency: 'SEMANAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '08:30',
      preferredVisitTimeEnd: '17:30',
      notes: 'Cliente menor usado no roteiro seed.',
    },
    {
      code: 'CLI-009',
      winthorCustomerCode: 'WTH-0009',
      tradeName: 'Atacarejo do Povo',
      legalName: 'Atacarejo do Povo LTDA',
      cnpj: '11222333000109',
      stateRegistration: '001120009',
      contactName: 'Ricardo Souza',
      phone: '66992001009',
      email: 'povo@clientes.formula.local',
      zipCode: '78700009',
      address: 'Av. Cuiaba',
      addressNumber: '3000',
      district: 'Jardim Atlantico',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4569,
      longitude: -54.6184,
      geofenceRadiusM: 220,
      routeName: 'Rota Leste',
      region: 'Rondonopolis Leste',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_b',
      visitFrequency: 'QUINZENAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '10:00',
      preferredVisitTimeEnd: '18:00',
      notes: 'Cliente com maior raio na rota leste.',
    },
    {
      code: 'CLI-010',
      winthorCustomerCode: 'WTH-0010',
      tradeName: 'Super Ideal',
      legalName: 'Super Ideal Comercio LTDA',
      cnpj: '11222333000110',
      stateRegistration: '001120010',
      contactName: 'Juliana Serra',
      phone: '66992001010',
      email: 'ideal@clientes.formula.local',
      zipCode: '78700010',
      address: 'Rua Jose Barriga',
      addressNumber: '88',
      district: 'Jardim Tropical',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4825,
      longitude: -54.6334,
      geofenceRadiusM: 140,
      routeName: 'Rota Leste',
      region: 'Rondonopolis Leste',
      supervisorUserKey: 'supervisor',
      defaultPromoterUserKey: 'promoter_b',
      visitFrequency: 'SEMANAL',
      preferredVisitDays: [scheduleDayOfWeek],
      preferredVisitTimeStart: '08:00',
      preferredVisitTimeEnd: '18:00',
      notes: 'Cliente seed final para validacoes de paginação.',
    },
  ];

  return {
    company: {
      code: 'FORMULA',
      tradeName: 'Formula Distribuidora',
      legalName: 'Formula Distribuidora de Alimentos LTDA',
      documentNumber: '12.345.678/0001-99',
      timeZone: 'America/Cuiaba',
    },
    users,
    promoters: [
      {
        userKey: 'promoter_a' as const,
        employeeCode: 'PROM-001',
        supervisorKey: 'supervisor' as const,
        hireDate: new Date('2025-01-15T08:00:00.000Z'),
        defaultJourneyStartTime: '08:00',
        defaultJourneyEndTime: '17:00',
      },
      {
        userKey: 'promoter_b' as const,
        employeeCode: 'PROM-002',
        supervisorKey: 'supervisor' as const,
        hireDate: new Date('2025-02-10T08:00:00.000Z'),
        defaultJourneyStartTime: '08:00',
        defaultJourneyEndTime: '17:00',
      },
    ],
    customers,
    schedules: customers.map((customer, index) => ({
      customerCode: customer.code,
      dayOfWeek: scheduleDayOfWeek,
      visitWindowStart: index < 5 ? '08:00' : '13:00',
      visitWindowEnd: index < 5 ? '11:30' : '17:30',
      sequenceHint: index + 1,
    })),
    checklistTemplate: {
      code: 'EXEC-BASE',
      name: 'Checklist de Execucao Padrao',
      description: 'Checklist operacional obrigatorio para auditoria da visita',
      version: 1,
      questions: [
        {
          code: 'MIX',
          label: 'Mix completo exposto',
          type: ChecklistItemType.BOOLEAN,
          required: true,
          sortOrder: 1,
        },
        {
          code: 'PRECO',
          label: 'Preco atualizado na gondola',
          type: ChecklistItemType.BOOLEAN,
          required: true,
          sortOrder: 2,
        },
        {
          code: 'RUPTURA',
          label: 'Sem ruptura critica',
          type: ChecklistItemType.BOOLEAN,
          required: true,
          sortOrder: 3,
        },
        {
          code: 'OBS',
          label: 'Observacao operacional',
          type: ChecklistItemType.TEXT,
          required: true,
          sortOrder: 4,
        },
      ],
    },
    routePlan: {
      routeDate,
      promoterKey: 'promoter_a' as const,
      supervisorKey: 'supervisor' as const,
      notes: 'Roteiro seed do dia para validacao operacional e painel web',
      items: customers.map((customer, index) => {
        const plannedStartAt = addMinutes(routeDate, 8 * 60 + index * 40);
        return {
          customerCode: customer.code,
          sequence: index + 1,
          plannedStartAt,
          plannedEndAt: addMinutes(plannedStartAt, 30),
        };
      }),
    },
  };
};
