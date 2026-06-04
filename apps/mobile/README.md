# Mobile Base

Base reservada para evoluir o app mobile do Sales Promoters com Expo ou React Native, reaproveitando contratos de `@sales-promoters/shared` e a API pública configurada no backend.

## Localizacao operacional

O arquivo `src/locationHeartbeat.ts` prepara o envio de localizacao para a API.

Regra de seguranca do sistema: o backend aceita heartbeat somente para usuario `PROMOTOR` com visita em andamento. Isso evita rastreamento fora da jornada ativa.

Fluxo esperado no app real:

1. Promotor faz login.
2. Promotor inicia/check-in em uma visita.
3. App coleta GPS com permissao do aparelho.
4. App chama `sendLocationHeartbeat`.
5. Painel web mostra a ultima posicao em `Mapa ao vivo`.
