# AGENTS.md

## Fonte unica

Este repositorio `C:\Promotor` e a fonte oficial do sistema Promotores 2026.

Nao desenvolver em copias paralelas como `Projeto-Promotor` sem antes migrar a mudanca para este monorepo.

## Objetivo do projeto

Sistema de acompanhamento de promotor de vendas para distribuidora de alimentos, com app mobile offline-first, painel web administrativo e backend API.

## Regras permanentes

- Sempre corrigir erros antes de prosseguir.
- Sempre rodar typecheck e build ao final de tarefa relevante.
- Nao deixar TODO em fluxo principal.
- Nao usar mock em caminho critico.
- Nao quebrar contratos de API.
- Preservar separacao de camadas.
- Preferir solucoes simples, robustas e legiveis.
- Atualizar README quando alterar setup, comandos ou arquitetura.
- Tratar erro de rede, autenticacao, validacao e sincronizacao explicitamente.
- Nao implementar rastreamento fora da jornada ativa.
- Garantir que visita nao seja concluida sem evidencias minimas.
