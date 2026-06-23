# PromotorPro Mobile Flutter

Aplicativo Flutter offline-first para operacao de campo dos promotores.

## O que esta implementado

- Login do promotor usando a API existente.
- Download do roteiro mobile em `/mobile/snapshot`.
- Persistencia local em SQLite.
- Lista de clientes liberados no roteiro.
- Inicio de atendimento offline.
- Captura de check-in, foto antes e foto depois.
- Registro de data/hora e GPS quando disponivel.
- Encerramento bloqueado sem as fotos obrigatorias.
- Fila local persistente de sincronizacao.
- Upload idempotente de visita e fotos usando `clientGeneratedId`.
- Heartbeat de localizacao para o mapa ao vivo enquanto houver roteiro aberto.

## Comandos

Na pasta `apps/mobile_flutter`:

```powershell
flutter pub get
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://promotores-2026-api.vercel.app
```

## Observacao importante no Windows

O Gradle/CMake do Android pode falhar quando o projeto esta dentro de pasta com caracteres especiais, acentos ou caracteres nao latinos, como OneDrive com nome internacional.

Se isso acontecer, compile a partir de uma copia temporaria em caminho simples:

```powershell
robocopy . C:\PromotorFlutterWork /E /XD build .dart_tool
cd C:\PromotorFlutterWork
flutter pub get
flutter build apk --release --dart-define=API_BASE_URL=https://promotores-2026-api.vercel.app
```

O APK gerado fica em:

```text
build\app\outputs\flutter-apk\app-release.apk
```

Neste workspace, a ultima build tambem foi copiada para:

```text
artifacts\android\promotorpro-flutter-release.apk
```
