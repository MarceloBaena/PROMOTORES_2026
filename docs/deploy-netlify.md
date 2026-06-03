# Deploy do Painel no Netlify

Este projeto pode usar o Netlify para hospedar o painel web em `apps/web`.

Importante:

- o Netlify hospeda bem o painel `Next.js`
- a API `NestJS` em `apps/api` deve continuar em outro servidor ou plataforma
- o app mobile continua apontando para a URL publica da API

## O que vai para o Netlify

Somente:

- `apps/web`

Nao envie para o Netlify:

- `apps/api`
- `apps/mobile`
- `apps/android-kotlin`

## Arquivos que ja ficaram prontos no repositorio

- [netlify.toml](C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/netlify.toml)
- [package.json](C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/package.json)

O build configurado para o Netlify ficou:

```toml
[build]
command = "npm run build:web"
publish = "apps/web/.next"
```

## Variavel obrigatoria no Netlify

No painel do Netlify, crie:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.seudominio.com/api
```

Troque `https://api.seudominio.com/api` pela URL publica real da sua API.

## Configuracao da API para aceitar o painel

Na API, o `CORS_ORIGIN` precisa aceitar o dominio do Netlify.

Exemplo:

```env
CORS_ORIGIN=https://seu-site.netlify.app,https://painel.seudominio.com
UPLOAD_BASE_URL=https://api.seudominio.com
```

Sem isso, o painel sobe mas o login e as chamadas autenticadas vao falhar.

## Como configurar no painel do Netlify

Quando importar o repositório:

1. `Add new site`
2. `Import an existing project`
3. escolha GitHub
4. selecione este repositorio

Na configuracao do site:

1. deixe o repositório apontando para a raiz
2. em `Package directory`, informe `apps/web`
3. mantenha o `Build command` como `npm run build:web`
4. mantenha o `Publish directory` como `apps/web/.next`
5. configure `NEXT_PUBLIC_API_BASE_URL`

## Ordem certa para nao se enrolar

1. publicar a API primeiro
2. validar login e endpoints pela URL publica da API
3. configurar `NEXT_PUBLIC_API_BASE_URL` no Netlify
4. subir o painel
5. testar login, dashboard, clientes, roteiros e detalhe de visita

## Checklist rapido depois do deploy

- o painel abre pela URL do Netlify
- o login funciona
- o dashboard carrega sem erro 401/500
- clientes listam
- roteiros listam
- visitas abrem
- fotos carregam
- auditoria abre

## Se der erro depois do deploy

Os 4 erros mais comuns sao:

1. `NEXT_PUBLIC_API_BASE_URL` ainda esta com `localhost`
2. `CORS_ORIGIN` nao inclui o dominio do Netlify
3. a API esta sem HTTPS publico
4. `UPLOAD_BASE_URL` da API nao aponta para a URL publica correta
