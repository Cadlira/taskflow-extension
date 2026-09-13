# AGENTS.md — TaskFlow

Este arquivo rege o trabalho de agentes de programação neste repositório.

## Antes de alterar

1. Leia este `AGENTS.md` por completo.
2. Identifique a Change OpenSpec ativa e leia todos os seus artefatos aplicáveis antes de implementar.
3. Trate os artefatos OpenSpec da Change atual como fonte principal do escopo funcional.
4. Não implemente funcionalidades fora do escopo definido pela Change atual.
5. Se descobrir um requisito adicional relevante, registre a necessidade ou proponha outra Change; não o implemente silenciosamente.
6. Se não houver Change aprovada para uma alteração funcional, interrompa a implementação e proponha uma Change.

## Arquitetura e código

7. Mantenha TypeScript em modo `strict`.
8. Não use `any`. Se uma integração tornar seu uso realmente inevitável, limite-o à borda, justifique-o em comentário e cubra-o com teste.
9. Mantenha regras de domínio independentes de Vue, Pinia, WXT e APIs específicas do Chrome sempre que razoável.
10. Componentes de interface não devem acessar `chrome.storage` ou `browser.storage` diretamente; use uma porta/repository apropriada.
11. Mantenha dependências direcionadas de UI/infraestrutura para aplicação/domínio, nunca do domínio para infraestrutura.
12. Não introduza backend, autenticação ou sincronização sem uma Change específica.
13. Não introduza dependências grandes sem justificar a necessidade no design da Change.
14. Prefira composição, módulos pequenos e nomes que expressem intenção.
15. Não crie abstrações sem um consumidor ou uma evolução explicitamente prevista pela Change.

## Chrome Extension

16. Não quebre compatibilidade com Manifest V3.
17. Considere o ciclo de vida interrompível do service worker. Não use estado em memória ou timers como fonte de verdade para lembretes.
18. Solicite somente permissões Chrome exigidas pelo comportamento implementado e documente cada nova permissão.
19. Não adicione `host_permissions` ou `<all_urls>` sem necessidade aprovada na Change.
20. Mantenha popup, Side Panel e background como entrypoints finos; regras reutilizáveis devem ficar fora deles.

## Qualidade e conclusão

21. Crie ou ajuste testes junto com a implementação.
22. Antes de considerar uma implementação concluída, execute:

    ```bash
    npm run lint
    npm run typecheck
    npm run test
    npm run build
    ```

23. Não considere uma Change concluída apenas porque o código compilou; valide também os comportamentos e critérios definidos nas specs.
24. Execute `npx openspec validate <change> --type change --strict --no-interactive` para validar artefatos alterados.
25. Atualize o README ou `docs/architecture.md` quando houver mudança arquitetural ou operacional relevante.
26. Preserve acessibilidade básica, estados de erro e feedback ao usuário nas interfaces.

## Segurança e Git

27. Nunca adicione secrets, tokens, credenciais, dados pessoais ou arquivos sensíveis ao repositório.
28. Não execute mudanças destrutivas no GitHub sem necessidade explícita.
29. Não reescreva histórico compartilhado nem force push sem autorização expressa.
30. Preserve alterações existentes que não pertençam à tarefa atual.
31. Use commits pequenos e semanticamente coerentes; não misture refatorações não relacionadas.

## OpenSpec

32. Use a CLI instalada no projeto (`npm run openspec -- ...` ou `npx openspec ...`) e confirme seus comandos com `--help` quando necessário.
33. O fluxo normal é explorar, propor/revisar, aplicar, verificar e arquivar.
34. Nunca execute o workflow de apply sem revisão e autorização explícita da Change.
35. Ao surgir mudança de escopo durante o apply, atualize os artefatos e solicite revisão antes de prosseguir.
