# Receber a senha de novo (beta)

- **Chave:** `beta_receber_senha_de_novo` · **Grupo:** Para o consulente · **Situação:** em teste desde 02/11/2026 (jornadas v2)
- **O que faz:** Quem perdeu ou apagou o e-mail da senha pede de novo, sozinho, no link da gira. Ninguém da casa precisa procurar a senha no WhatsApp em dia de gira.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** some da tela; nada do que foi registrado é apagado.
- **Critério para sair do beta:** uso pelas casas piloto sem erro por um ciclo de giras e aprovação do dono.

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** Quem perdeu ou apagou o e-mail da senha pede de novo, sozinho, no link da gira. Ninguém da casa precisa procurar a senha no WhatsApp em dia de gira.

**Como usar.**

1. Basta ligar.
2. No link da gira aparece "Já pegou? Receber a senha de novo". A pessoa digita o e-mail que usou e o bilhete chega de novo nesse e-mail.

**Quem vê.** O consulente, na página da gira, enquanto as senhas estão abertas ou esgotadas.

**Ao desligar.** O link some da página da gira. As senhas já emitidas não mudam.

**Bom saber.**

- Por segurança, o bilhete só vai para o e-mail que pegou a senha, e a tela não diz se aquele e-mail tem ou não senha na gira.
