import { describe, expect, it } from 'vitest';
import {
  validateCollaboratorInput,
  validateCustomerInput,
  validateRoutePlanInput,
} from './form-validation';

describe('form validation', () => {
  it('valida os campos obrigatorios do cliente', () => {
    expect(
      validateCustomerInput({
        code: '',
        winthorCustomerCode: '',
        tradeName: '',
        legalName: '',
        cnpj: '',
        stateRegistration: '',
        contactName: '',
        phone: '',
        email: '',
        zipCode: '',
        address: '',
        addressNumber: '',
        complement: '',
        district: '',
        city: '',
        state: '',
        latitude: Number.NaN,
        longitude: Number.NaN,
        geofenceRadiusM: 10,
        routeName: '',
        region: '',
        supervisorUserId: '',
        defaultPromoterUserId: '',
        visitFrequency: '',
        preferredVisitDays: [],
        preferredVisitTimeStart: '',
        preferredVisitTimeEnd: '',
        notes: '',
        status: 'ACTIVE',
      }),
    ).toEqual([
      'Informe o codigo do cliente.',
      'Informe o nome fantasia.',
      'Informe a razao social.',
      'Informe um CNPJ valido com 14 digitos.',
      'Informe o contato principal.',
      'Informe o telefone.',
      'Informe o endereco.',
      'Informe o bairro.',
      'Informe cidade e UF.',
      'Informe a rota.',
      'Informe a regiao.',
      'Selecione o supervisor responsavel.',
      'Informe observacoes do cliente.',
      'A geofence minima precisa ser de 20 metros.',
    ]);
  });

  it('bloqueia roteiro vazio, duplicado ou sem promotor', () => {
    expect(
      validateRoutePlanInput({
        routeDate: '',
        promoterId: '',
        notes: '',
        items: [],
      }),
    ).toEqual([
      'Informe a data do roteiro.',
      'Selecione um promotor.',
      'Inclua pelo menos um cliente no roteiro.',
    ]);

    expect(
      validateRoutePlanInput({
        routeDate: '2026-03-21',
        promoterId: 'promoter-1',
        items: [
          {
            customerId: 'customer-1',
            sequence: 1,
          },
          {
            customerId: 'customer-1',
            sequence: 1,
          },
        ],
      }),
    ).toEqual([
      'Um cliente nao pode se repetir no mesmo roteiro.',
      'A sequencia precisa ser unica por parada.',
    ]);
  });

  it('valida obrigatorios e regras condicionais do colaborador', () => {
    expect(
      validateCollaboratorInput(
        {
          name: '',
          email: 'email-invalido',
          phone: '123',
          cpf: '123',
          employeeCode: '',
          role: 'PROMOTER',
          status: 'ACTIVE',
          hireDate: '',
          region: '',
          notes: '',
          supervisorId: '',
          defaultJourneyStartTime: '',
          defaultJourneyEndTime: '',
          teamPromoterIds: [],
          initialPassword: '123',
        },
        {
          requireInitialPassword: true,
        },
      ),
    ).toEqual([
      'Informe o nome completo.',
      'Informe um email valido.',
      'Informe um telefone valido.',
      'Informe um CPF valido.',
      'Informe a matricula.',
      'Informe a data de admissao.',
      'Informe a regiao.',
      'A senha inicial deve ter pelo menos 8 caracteres.',
      'Selecione o supervisor responsavel.',
    ]);
  });
});
