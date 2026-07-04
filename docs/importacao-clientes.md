# Modelo de importacao de clientes

Use o arquivo `modelo-importacao-clientes.csv` como base para cadastrar ou atualizar clientes em lote.

## Colunas aceitas

- `codigo`: codigo numerico do cliente. Se o mesmo codigo ja existir na empresa/filial selecionada, o cliente sera atualizado.
- `nome`: nome do cliente. Campo obrigatorio.
- `documento`: CNPJ ou documento do cliente. Campo opcional.
- `representante` ou `vendedor`: nome do vendedor/representante comercial que atende o cliente.
- `endereco`: rua, avenida ou logradouro.
- `numero`: numero do endereco.
- `bairro`: bairro do cliente.
- `cidade`: cidade do cliente.
- `uf`: estado com duas letras, por exemplo `MT`.
- `fornecedores` ou `suppliers`: opcional. Informe nomes, nomes fantasia, documentos ou IDs dos fornecedores separados por ponto e virgula, por exemplo `"FORNECEDOR A; FORNECEDOR B"`.
- `atividades` ou `activities`: opcional. Informe os nomes, codigos numericos ou IDs das atividades separados por ponto e virgula, por exemplo `"Reposicao; Precificacao"`.

## Como usar no Excel

1. Abra o arquivo `modelo-importacao-clientes.csv` no Excel.
2. Preencha uma linha por cliente.
3. Mantenha os nomes das colunas exatamente como estao.
4. Salve como CSV.
5. No painel web, entre em `Importacao`, selecione a empresa/filial e envie o arquivo.

## Observacoes importantes

- Nao apague a primeira linha, pois ela e o cabecalho.
- Para atualizar um cliente existente, mantenha o mesmo `codigo`.
- Para criar um cliente novo, use um codigo ainda nao usado na empresa/filial.
- O campo `documento` pode ficar vazio.
- Se um fornecedor informado nao for encontrado, o cliente continua sendo importado e o resultado retorna um aviso para corrigir depois.
- Se uma atividade informada nao for encontrada, o cliente continua sendo importado e o resultado retorna um aviso para corrigir depois.
