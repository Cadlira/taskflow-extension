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
12. Preserve o TaskFlow como produto autocontido e local-first. Não introduza backend próprio ou obrigatório, autenticação central do TaskFlow nem dependência de serviço operado pelo projeto.
13. Integrações externas opcionais devem ocorrer diretamente da extensão, por adapters, com consentimento e credenciais fornecidas pelo usuário. O funcionamento principal não pode depender delas.
14. Não introduza dependências grandes sem justificar a necessidade no design da Change.
15. Prefira composição, módulos pequenos e nomes que expressem intenção.
16. Não crie abstrações sem um consumidor ou uma evolução explicitamente prevista pela Change.

## Chrome Extension

17. Não quebre compatibilidade com Manifest V3.
18. Considere o ciclo de vida interrompível do service worker. Não use estado em memória ou timers como fonte de verdade para lembretes.
19. Solicite somente permissões Chrome exigidas pelo comportamento implementado e documente cada nova permissão.
20. Não adicione `host_permissions` ou `<all_urls>` sem necessidade aprovada na Change.
21. Mantenha popup, Side Panel e background como entrypoints finos; regras reutilizáveis devem ficar fora deles.

## Qualidade e conclusão

22. Crie ou ajuste testes junto com a implementação.
23. Antes de considerar uma implementação concluída, execute:

    ```bash
    npm run lint
    npm run typecheck
    npm run test
    npm run build
    ```

24. Não considere uma Change concluída apenas porque o código compilou; valide também os comportamentos e critérios definidos nas specs.
25. Execute `npx openspec validate <change> --type change --strict --no-interactive` para validar artefatos alterados.
26. Atualize o README ou `docs/architecture.md` quando houver mudança arquitetural ou operacional relevante.
27. Preserve acessibilidade básica, estados de erro e feedback ao usuário nas interfaces.

## Segurança e Git

28. Nunca adicione secrets, tokens, credenciais, dados pessoais ou arquivos sensíveis ao repositório.
29. Não execute mudanças destrutivas no GitHub sem necessidade explícita.
30. Não reescreva histórico compartilhado nem force push sem autorização expressa.
31. Preserve alterações existentes que não pertençam à tarefa atual.
32. Use commits pequenos e semanticamente coerentes; não misture refatorações não relacionadas.

## OpenSpec

33. Use a CLI instalada no projeto (`npm run openspec -- ...` ou `npx openspec ...`) e confirme seus comandos com `--help` quando necessário.
34. O fluxo normal é: roadmap, explore, propose, revisão humana, apply, verify, PR, revisão/aprovação, archive na mesma branch, CI final e merge.
35. Nunca execute o workflow de apply sem revisão e autorização explícita da Change.
36. Ao surgir mudança de escopo durante o apply, atualize os artefatos e solicite revisão antes de prosseguir.
37. Não crie antecipadamente pastas ou artefatos OpenSpec para itens futuros do roadmap; cada Change nasce apenas quando seu trabalho começar.
38. Depois que a implementação for aprovada no PR, execute o archive na mesma feature branch. O workflow de archive deve localizar a entrada da Change em `docs/roadmap.md`, marcá-la como `IN_PROGRESS`/`ARCHIVE` antes do comando de archive e incluir no mesmo commit final os artefatos arquivados, as specs consolidadas e a atualização definitiva do roadmap. Aguarde o CI final e só então faça merge. Não arquive diretamente na `main`.
39. Toda Change planejada deve possuir um identificador imutável em `docs/roadmap.md`. Use `TF-NNN` para itens principais e `TF-NNN.M` somente para inserir uma Change diretamente relacionada após um item existente, sem renumerar o roadmap. Novos itens principais usam o próximo `TF-NNN` livre; filhos usam o próximo sufixo inteiro livre do pai. Nunca reutilize identificadores removidos.
40. No início do `propose`, antes de criar o primeiro artefato, atualize a entrada correspondente no roadmap para status `IN_PROGRESS`, etapa `PROPOSE` e preencha `Data de início` com a data corrente no formato `YYYY-MM-DD`, caso ainda esteja vazia.
41. Ao mudar de fase, mantenha no roadmap o status e a etapa atualizados: `IN_REVIEW`/`REVIEW`, `APPROVED`/`READY_FOR_APPLY`, `IN_PROGRESS`/`APPLY`, `IN_PROGRESS`/`VERIFY` ou `IN_PROGRESS`/`ARCHIVE`.
42. No commit final do archive, ainda na feature branch, marque a Change como `DONE`, etapa `ARCHIVED`, preencha `Data de conclusão` no formato `YYYY-MM-DD`, ajuste sua `Próxima ação` para indicar conclusão e atualize a indicação da próxima Change elegível. O archive não está concluído e não deve ser reportado como bem-sucedido enquanto essa atualização não estiver incluída no diff. Ela só se torna oficial quando o commit entra na `main` pelo merge do PR.
43. Uma Change arquivada na `main` deve obrigatoriamente aparecer como `DONE` no roadmap. Se o archive chegou à `main` sem essa atualização, corrija por PR; não faça commit direto na `main`.
44. Antes do commit final do archive, valide em conjunto que a pasta ativa da Change deixou de existir, o diretório arquivado e as specs consolidadas existem e a linha correspondente no roadmap contém `DONE`, `ARCHIVED` e a data de conclusão. Qualquer divergência bloqueia o archive e o merge.
