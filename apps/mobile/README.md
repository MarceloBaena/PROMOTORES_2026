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
- Encerramento da visita.
- Fila persistente de sincronizacao.
- Logs locais de sync.
- Retry manual quando a internet voltar.

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
- A visita nao encerra sem check-in, before e after.
- O mapa ao vivo so envia localizacao em primeiro plano e durante jornada operacional ativa.
