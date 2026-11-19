# Avisar quem tem senha quando a gira é excluída (beta)

- **Chave:** `beta_avisar_exclusao_gira` · **Grupo:** Para a gira · **Situação:** em teste desde 02/11/2026 (jornadas v2)
- **O que faz:** Se a casa precisar cancelar uma gira que já tem senhas, pode avisar por e-mail, de uma vez, todo mundo que pegou senha.
- **Como pergunta (decisão do Leonardo, 04/11/2026):** nada vem marcado. Ao confirmar a exclusão de uma gira com senhas emitidas, um segundo diálogo pergunta "Avisar por e-mail as N pessoas que têm senha?", com **Enviar aviso** e **Não enviar** no mesmo peso (sem botão principal). A gira é excluída nos dois casos; o aviso sai na mesma chamada da exclusão (`DELETE …?avisar=true`), porque o servidor precisa das senhas antes de apagar a gira. Fechar o diálogo não exclui nada.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** some da tela; nada do que foi registrado é apagado.
- **Critério para sair do beta:** uso pelas casas piloto sem erro por um ciclo de giras e aprovação do dono.

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** Se a casa precisar cancelar uma gira que já tem senhas, pode avisar por e-mail, de uma vez, todo mundo que pegou senha.

**Como usar.**

1. Em Giras, exclua a gira como sempre.
2. Se ela tem senhas, depois de confirmar aparece a pergunta "Avisar por e-mail as pessoas que têm senha?", com "Enviar aviso" e "Não enviar".
3. A gira é excluída nos dois casos. Fechar a pergunta sem escolher não exclui nada.

**Quem vê.** Quem pode excluir giras. O e-mail vai para quem tinha senha.

**Ao desligar.** A pergunta some, e excluir volta a ser só a confirmação de sempre, sem aviso.

**Bom saber.**

- Nada vem marcado: a casa escolhe a cada vez se manda ou não.
