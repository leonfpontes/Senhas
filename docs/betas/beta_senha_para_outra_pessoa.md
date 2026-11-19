# Senha para outra pessoa (beta)

- **Chave:** `beta_senha_para_outra_pessoa` · **Grupo:** Para o consulente · **Situação:** em teste desde 02/11/2026 (jornadas v2)
- **O que faz:** Um filho pode pegar a senha para a mãe, e um vizinho para quem não tem celular. Quem preenche põe o nome de quem vai, e a senha chega no e-mail de quem preencheu.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** some da tela; nada do que foi registrado é apagado.
- **Critério para sair do beta:** uso pelas casas piloto sem erro por um ciclo de giras e aprovação do dono.

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** Um filho pode pegar a senha para a mãe, e um vizinho para quem não tem celular. Quem preenche põe o nome de quem vai, e a senha chega no e-mail de quem preencheu.

**Como usar.**

1. No formulário da gira aparece "Para quem é a senha?", com "Para mim" já escolhido e "Para outra pessoa".
2. Em "Para outra pessoa", o nome é o de quem vai (é o nome chamado na porta) e o e-mail é o de quem está preenchendo.
3. A senha chega nesse e-mail. É só mostrar ou encaminhar para quem vai.

**Quem vê.** O consulente, no link da gira.

**Ao desligar.** A pergunta some do formulário. As senhas já tiradas para outra pessoa continuam valendo.

**Bom saber.**

- O limite de senhas por e-mail é o mesmo que a casa já configurou na gira.
