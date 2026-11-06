# Retorno do consulente na porta (beta)

- **Chave:** `beta_retorno_consulente` · **Grupo:** Para a porta · **Situação:** em teste desde 06/11/2026
- **Pedido de:** Mãe Rai (conversa com a corrente em 04/11/2026). É uma necessidade comum aos terreiros.
- **O que faz:** quem chama a senha na Porta marca **Precisa voltar** e anota com qual médium e/ou
  com qual entidade a pessoa volta, mais um recado. Nas giras seguintes, quando essa pessoa aparece
  na fila, a senha dela mostra o selo **Retorno** (também no bloco "Próximo" e no topo do "Chamar").
  Tocar no selo mostra com quem ela volta, de qual gira veio o retorno e o recado.
- **Resolvido:** o botão **Marcar como resolvido** tira o selo. O toast oferece **Desfazer**, e o
  retorno volta a aparecer. Nada é apagado ao resolver (fica registrado quem resolveu, quando e em
  qual gira), e cada mudança vai para a auditoria (`config_type = "retorno_consulente"`).
- **Como acha a pessoa:** pelas chaves do cadastro no mesmo terreiro: o mesmo consulente, o mesmo
  e-mail ou o mesmo telefone. Assim, quem veio pelo link numa gira e "sem senha" na outra é
  reconhecido. Na própria gira em que foi anotado, o retorno não aparece como pendente.
- **Editar e desfazer:** "Editar atendimento" mostra o retorno anotado e deixa trocar ou tirar.
  "Desfazer" o atendimento apaga o retorno que ainda está aberto.
- **Permissões:** ver o selo e os detalhes pede `PORTA:view`; anotar (no Chamar/Editar) e marcar
  como resolvido pedem `PORTA:edit`. Nunca aparece no Modo TV.
- **Onde fica:** tabela `consulente_retornos` (migração 105). API: `retornos` e `retorno_marcado`
  nos itens de `GET /api/v1/admin/giras/{id}/door/queue`; campo `retorno` no corpo de
  `/door/tickets/{id}/attend` e `/attend-info`; `PATCH`/`DELETE /api/v1/admin/door/retornos/{id}/resolver`.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** some da tela e o campo deixa de ser gravado; os retornos já anotados continuam no
  banco e voltam ao ligar.
- **Critério para sair do beta:** uso pela casa da Mãe Rai sem erro por um ciclo de giras e aprovação do dono.
