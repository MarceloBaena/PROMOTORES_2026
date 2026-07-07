# Promotores 2026 Mobile

App Expo/React Native para Android com operacao offline-first.

## O que funciona offline

- Sessao salva depois do primeiro login online.
- Snapshot local de roteiro, clientes e itens de rota em SQLite.
- Inicio de atendimento.
- Check-in com foto.
- Foto before.
- Anotacoes de execucao.
- Foto after.
- Foto de check-out.
- Encerramento da visita.
- Fila persistente de sincronizacao.
- Logs locais de sync.
- Retry manual quando a internet voltar.
- Mapa operacional no app com clientes posicionados quando houver latitude/longitude.
- Abertura de navegacao externa para o cliente selecionado.

## Comandos

```bash
npm run typecheck
npm run start
npm run prebuild:android
npm run android
```

## APK de teste

Para gerar APK via EAS:

```bash
npx eas build -p android --profile preview
```

Para build local, instale Android Studio/Android SDK e rode:

```bash
npm run prebuild:android
npm run android
```

## Regras importantes

- O primeiro login precisa de internet para baixar o roteiro.
- Depois do download, o app reabre e trabalha com SQLite mesmo sem internet.
- Fotos sao copiadas para o armazenamento local do app.
- A visita nao encerra sem check-in, before, after e check-out.
- Quando o cliente tiver fornecedores vinculados, todos precisam ser concluidos com foto antes, foto depois e respostas obrigatorias antes do check-out final.
- Se o promotor marcar que o fornecedor nao recebeu mercadoria, o sistema permite concluir esse fornecedor sem fotos antes/depois e sem abastecimento.
- O mapa ao vivo so envia localizacao em primeiro plano e durante jornada operacional ativa.
- O mapa do roteiro precisa de internet para carregar as ruas, mas a lista de clientes continua disponivel mesmo sem sinal.
- Clientes sem latitude/longitude continuam aparecendo no roteiro, mas sem marcador no mapa ate o cadastro ser completado.
