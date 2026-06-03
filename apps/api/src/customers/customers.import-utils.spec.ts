import {
  deepSanitize,
  parseCsvBuffer,
  sanitizeStorageString,
} from './customers.import-utils';

describe('customers.import-utils', () => {
  it('detecta delimitador ponto e virgula e normaliza cabecalhos com espacos', () => {
    const csv = Buffer.from(
      ' Codigo ; Razao Social ; Nome Fantasia ; Cidade \r\nCLI-001;Mercado Alfa LTDA;Mercado Alfa;Cuiaba\r\n',
      'utf-8',
    );

    const parsed = parseCsvBuffer(csv);

    expect(parsed.delimiter).toBe(';');
    expect(parsed.originalHeaders).toEqual([
      'Codigo',
      'Razao Social',
      'Nome Fantasia',
      'Cidade',
    ]);
    expect(parsed.normalizedHeaders).toEqual([
      'codigo',
      'razao_social',
      'nome_fantasia',
      'cidade',
    ]);
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        cellsCount: 4,
        extraValues: [],
        values: {
          codigo: 'CLI-001',
          razao_social: 'Mercado Alfa LTDA',
          nome_fantasia: 'Mercado Alfa',
          cidade: 'Cuiaba',
        },
      },
    ]);
  });

  it('suporta UTF-8 com BOM, delimitador virgula e quebra de linha windows', () => {
    const csv = Buffer.from(
      '\uFEFFcustomer_code,legal_name,trade_name,city\r\nCLI-002,Distribuidora Beta LTDA,Beta,Campo Grande\r\n',
      'utf-8',
    );

    const parsed = parseCsvBuffer(csv);

    expect(parsed.delimiter).toBe(',');
    expect(parsed.rows[0]).toEqual({
      rowNumber: 2,
      cellsCount: 4,
      extraValues: [],
      values: {
        customer_code: 'CLI-002',
        legal_name: 'Distribuidora Beta LTDA',
        trade_name: 'Beta',
        city: 'Campo Grande',
      },
    });
  });

  it('preserva campos com quebra de linha dentro de aspas', () => {
    const csv = Buffer.from(
      'customer_code,trade_name,notes\nCLI-003,Loja Central,"Primeira linha\nSegunda linha"\n',
      'utf-8',
    );

    const parsed = parseCsvBuffer(csv);

    expect(parsed.rows[0]?.values.notes).toBe('Primeira linha\nSegunda linha');
  });

  it('decodifica CSV UTF-16 LE com BOM sem vazar caracteres nulos', () => {
    const raw =
      '\uFEFFcustomer_code;trade_name;city\r\nCLI-004;Loja UTF16;Varzea Grande\r\n';
    const csv = Buffer.from(raw, 'utf16le');

    const parsed = parseCsvBuffer(csv);

    expect(parsed.delimiter).toBe(';');
    expect(parsed.originalHeaders).toEqual([
      'customer_code',
      'trade_name',
      'city',
    ]);
    expect(parsed.rows[0]).toEqual({
      rowNumber: 2,
      cellsCount: 3,
      extraValues: [],
      values: {
        customer_code: 'CLI-004',
        trade_name: 'Loja UTF16',
        city: 'Varzea Grande',
      },
    });
  });

  it('detecta TAB e ignora coluna vazia extra no final do cabecalho', () => {
    const csv = Buffer.from(
      'customer_code\ttrade_name\tcity\t\r\nCLI-005\tLoja TAB\tCuiaba\t\r\n',
      'utf-8',
    );

    const parsed = parseCsvBuffer(csv);

    expect(parsed.delimiter).toBe('\t');
    expect(parsed.originalHeaders).toEqual([
      'customer_code',
      'trade_name',
      'city',
    ]);
    expect(parsed.normalizedHeaders).toEqual([
      'customer_code',
      'trade_name',
      'city',
    ]);
    expect(parsed.rows[0]).toEqual({
      rowNumber: 2,
      cellsCount: 3,
      extraValues: [],
      values: {
        customer_code: 'CLI-005',
        trade_name: 'Loja TAB',
        city: 'Cuiaba',
      },
    });
  });

  it('faz fallback para windows-1252 preservando caracteres especiais comuns do cadastro', () => {
    const csv = Buffer.from(
      'customer_code;trade_name;city\r\nCLI-006;Mercado São José;Cuiabá\r\n',
      'latin1',
    );

    const parsed = parseCsvBuffer(csv);

    expect(parsed.rows[0]).toEqual({
      rowNumber: 2,
      cellsCount: 3,
      extraValues: [],
      values: {
        customer_code: 'CLI-006',
        trade_name: 'Mercado São José',
        city: 'Cuiabá',
      },
    });
  });

  it('reporta colunas excedentes por linha para validacao posterior', () => {
    const csv = Buffer.from(
      'customer_code;trade_name;city\r\nCLI-007;Mercado Extra;Cuiaba;coluna extra\r\n',
      'utf-8',
    );

    const parsed = parseCsvBuffer(csv);

    expect(parsed.rows[0]).toEqual({
      rowNumber: 2,
      cellsCount: 4,
      extraValues: ['coluna extra'],
      values: {
        customer_code: 'CLI-007',
        trade_name: 'Mercado Extra',
        city: 'Cuiaba',
      },
    });
  });

  it('falha quando o CSV possui aspas abertas sem fechamento', () => {
    const csv = Buffer.from(
      'customer_code,trade_name,city\nCLI-008,"Mercado Incompleto,Cuiaba\n',
      'utf-8',
    );

    expect(() => parseCsvBuffer(csv)).toThrow(
      'CSV invalido: aspas abertas sem fechamento.',
    );
  });

  it('remove BOM, nulos, controles problematicos e surrogates invalidos', () => {
    expect(
      sanitizeStorageString(
        '\uFEFFCli\0ente\u0007 \uD83D\uDE80 ok \uD800quebrado\uDC00',
      ),
    ).toBe('Cliente 🚀 ok quebrado');
  });

  it('sanitiza objetos e arrays recursivamente', () => {
    expect(
      deepSanitize({
        '\uD800cabecalho': 'Cli\0ente',
        nested: ['A\u0007', '\uFEFFB', '\uD800'],
      }),
    ).toEqual({
      cabecalho: 'Cliente',
      nested: ['A', 'B', ''],
    });
  });
});
