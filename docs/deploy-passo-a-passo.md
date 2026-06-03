# Deploy Passo a Passo

Este guia e para colocar o projeto no ar sem enrolacao.

Se voce quiser pensar do jeito mais simples possivel, o sistema tem 4 pecas:

1. banco de dados
2. storage das fotos
3. backend API
4. painel web

E, se quiser instalar no tablet/celular:

5. app Android

## Caminho mais simples

Para teste real de campo, o caminho mais facil e este:

- 1 banco PostgreSQL
- 1 bucket S3 compativel ou MinIO
- 1 servidor Linux para API + painel web
- 1 dominio com HTTPS
- 1 conta Expo para gerar APK

## O que voce precisa ter antes

### Infra minima

- servidor Linux ou Windows Server com Node.js 22+
- npm 10+
- PostgreSQL acessivel
- storage para fotos
- internet liberada para o app acessar a API

### Dados tecnicos que voce precisa saber

- URL do banco
- URL da API publica
- URL do painel web
- URL publica do storage
- segredos JWT

## Onde configurar

Arquivos base:

- `apps/api/.env.example`
- `apps/web/.env.local.example`
- `apps/mobile/.env.example`

Voce vai criar os arquivos reais de ambiente a partir deles.

## Passo 1: preparar a API

Crie `apps/api/.env`.

O minimo para producao e:

```env
NODE_ENV=production
PORT=3333
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/BANCO
JWT_ACCESS_SECRET=troque-isto-por-um-segredo-forte
JWT_REFRESH_SECRET=troque-isto-por-outro-segredo-forte
JWT_ACCESS_EXPIRES_IN_SECONDS=900
JWT_REFRESH_EXPIRES_IN_SECONDS=2592000
AUTH_RATE_LIMIT_WINDOW_MS=60000
AUTH_RATE_LIMIT_MAX_ATTEMPTS=5
STORAGE_DRIVER=s3
STORAGE_BUCKET=promotor-prod
STORAGE_ENDPOINT=https://SEU-STORAGE
STORAGE_ACCESS_KEY=SUA-CHAVE
STORAGE_SECRET_KEY=SEU-SEGREDO
STORAGE_PUBLIC_BASE_URL=https://SEU-STORAGE-PUBLICO
```

Se for usar filesystem local para fotos, troque por:

```env
STORAGE_DRIVER=local
```

## Passo 2: preparar o painel web

Crie `apps/web/.env.local`.

```env
NEXT_PUBLIC_API_BASE_URL=https://api.seudominio.com/api
```

## Passo 3: preparar o app mobile

Crie `apps/mobile/.env`.

```env
EXPO_PUBLIC_API_BASE_URL=https://api.seudominio.com/api
```

Regra importante:

- no mobile, nunca use `localhost`
- nunca use IP local se o APK vai ser instalado em aparelho fora da sua rede

## Passo 4: instalar dependencias

Na raiz do projeto:

```bash
npm install
```

## Passo 5: gerar pacotes compartilhados

```bash
npm run build:packages
```

## Passo 6: preparar o banco

Gerar Prisma Client:

```bash
npm run db:generate
```

Aplicar migrations em producao:

```bash
npm run db:deploy
```

Se quiser dados iniciais:

```bash
npm run db:seed
```

Observacao:

- `db:seed` so deve ser usado se voce realmente quiser popular base inicial
- para producao real, use so se fizer sentido para seu ambiente

## Passo 7: validar antes de subir

Rode na raiz:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Se isso falhar, nao faca deploy ainda.

## Passo 8: subir a API

Build:

```bash
npm run build -w @promotor/api
```

Start producao:

```bash
npm run start:prod -w @promotor/api
```

Quando estiver no ar, teste:

- `https://api.seudominio.com/api`
- login real
- upload de foto
- leitura de roteiro

## Passo 9: subir o painel web

Build:

```bash
npm run build -w @promotor/web
```

Start:

```bash
npm run start -w @promotor/web
```

Se voce quiser hospedar o painel especificamente no Netlify, use o guia dedicado:

- [Deploy do Painel no Netlify](C:/Users/Marcelo%20Baena/OneDrive%20-%20浮光浅夏/Área%20de%20Trabalho/Projeto-Promotor/docs/deploy-netlify.md)

Quando estiver no ar, teste:

- login
- cadastro de cliente
- cadastro de promotor
- publicacao de roteiro
- visualizacao de visita

## Passo 10: gerar APK Android

O projeto mobile usa Expo e ja esta preparado para build Android.

Arquivos importantes:

- `apps/mobile/app.json`
- `apps/mobile/eas.json`

O perfil `preview` gera APK instalavel.

Primeiro, confira a configuracao publica:

```bash
npm run mobile:config:check
```

Depois gere o APK:

```bash
npm run mobile:build:apk
```

Para isso funcionar, voce precisa estar logado no Expo:

```bash
npx eas-cli login
```

O resultado sera um APK instalavel para teste interno.

## Passo 11: instalar no tablet/celular

Depois que o build terminar:

1. baixe o APK
2. envie para o tablet
3. instale manualmente
4. abra o app
5. teste login
6. teste baixar roteiro
7. teste visita offline
8. teste sincronizacao

## Checklist final de teste

### Supervisor/Admin

- consegue logar
- consegue cadastrar promotor
- consegue cadastrar cliente
- consegue criar roteiro
- consegue publicar roteiro
- consegue ver visita no painel
- consegue ver fotos
- consegue ver auditorias

### Promotor

- consegue logar
- consegue baixar roteiro
- consegue abrir cliente
- consegue fazer check-in com foto
- consegue fazer foto before
- consegue registrar execucao
- consegue fazer foto after
- consegue encerrar visita
- consegue continuar offline
- consegue sincronizar depois

## O que mais costuma dar problema

### 1. O app nao loga

Normalmente e um destes:

- API fora do ar
- `EXPO_PUBLIC_API_BASE_URL` errado
- HTTPS faltando
- JWT mal configurado

### 2. O APK instala mas nao funciona

Normalmente e um destes:

- o app aponta para `localhost`
- o celular nao alcanca a API
- a API esta em rede interna
- CORS ou proxy mal configurado

### 3. Foto nao sobe

Normalmente e um destes:

- storage mal configurado
- bucket inexistente
- URL publica do storage errada
- permissao de camera negada

### 4. Painel abre, mas nao mostra dados

Normalmente e um destes:

- `NEXT_PUBLIC_API_BASE_URL` errado
- API com erro de autenticacao
- migrations nao aplicadas

## Caminho recomendado sem complicar

Se voce quer fazer do jeito mais seguro para homologacao:

1. subir PostgreSQL
2. subir storage
3. configurar `apps/api/.env`
4. rodar `npm run db:deploy`
5. subir API
6. configurar `apps/web/.env.local`
7. subir painel web
8. configurar `apps/mobile/.env`
9. gerar APK com `npm run mobile:build:apk`
10. testar em aparelho real

## Resumo em linguagem de jumento digital

Pensa assim:

- o banco guarda os dados
- o storage guarda as fotos
- a API faz o meio de campo
- o painel e a tela do supervisor
- o APK e a tela do promotor

Entao a ordem certa e:

1. ligar banco
2. ligar storage
3. configurar API
4. rodar migrations
5. subir API
6. configurar painel
7. subir painel
8. configurar mobile
9. gerar APK
10. instalar no aparelho

Se a API nao estiver publica e acessivel, o resto todo sofre.
