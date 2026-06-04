# Mobile Base

Base reservada para evoluir o app mobile do Sales Promoters com Expo ou React Native, reaproveitando contratos de `@sales-promoters/shared` e a API pública configurada no backend.

## Localizacao operacional

O arquivo `src/locationHeartbeat.ts` prepara o envio de localizacao para a API.

Regra de seguranca do sistema: o backend aceita heartbeat somente para usuario `PROMOTOR` com visita em andamento ou roteiro publicado para o dia. Isso evita rastreamento fora da jornada ativa.

Fluxo esperado no app real:

1. Promotor faz login.
2. App confirma que existe roteiro publicado do dia ou visita em andamento.
3. App coleta GPS com permissao do aparelho.
4. App inicia `createForegroundLocationTracker` quando estiver em primeiro plano.
5. Tracker envia heartbeat automaticamente em intervalo configuravel.
6. Painel web mostra a ultima posicao em `Mapa ao vivo`.

Observacao: ligar o aparelho por si so nao deve iniciar rastreamento. O envio acontece quando o app estiver aberto/logado e dentro da jornada operacional autorizada.
