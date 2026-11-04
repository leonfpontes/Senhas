# Avisar quem tem senha quando a gira é excluída (beta)

- **Chave:** `beta_avisar_exclusao_gira` · **Grupo:** Para a gira · **Situação:** em teste desde 02/11/2026 (jornadas v2)
- **O que faz:** Ao excluir, a casa pode mandar um e-mail para quem já pegou senha.
- **Como pergunta (decisão do Leonardo, 04/11/2026):** nada vem marcado. Ao confirmar a exclusão de uma gira com senhas emitidas, um segundo diálogo pergunta "Avisar por e-mail as N pessoas que têm senha?", com **Enviar aviso** e **Não enviar** no mesmo peso (sem botão principal). A gira é excluída nos dois casos; o aviso sai na mesma chamada da exclusão (`DELETE …?avisar=true`), porque o servidor precisa das senhas antes de apagar a gira. Fechar o diálogo não exclui nada.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** some da tela; nada do que foi registrado é apagado.
- **Critério para sair do beta:** uso pelas casas piloto sem erro por um ciclo de giras e aprovação do dono.
