# Bilhete sem internet (beta)

- **Chave:** `beta_bilhete_offline` · **Grupo:** Para o consulente · **Situação:** em teste desde 02/11/2026 (jornadas v2)
- **O que faz:** Depois de pegar a senha, o bilhete fica guardado no celular da pessoa. Se ela chegar no portão sem sinal ou sem internet, o número aparece do mesmo jeito.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** some da tela; nada do que foi registrado é apagado.
- **Critério para sair do beta:** uso pelas casas piloto sem erro por um ciclo de giras e aprovação do dono.

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** Depois de pegar a senha, o bilhete fica guardado no celular da pessoa. Se ela chegar no portão sem sinal ou sem internet, o número aparece do mesmo jeito.

**Como usar.**

1. Basta ligar. Ao pegar a senha, a pessoa vê "Esta senha fica guardada neste celular e abre até sem internet".
2. Sem sinal, ela abre o GiraHub no mesmo celular e no mesmo navegador, e a senha guardada aparece.

**Quem vê.** O consulente, no celular em que pegou a senha. O bilhete fica só no aparelho dele, e nada novo vai para o servidor.

**Ao desligar.** As senhas novas deixam de ser guardadas no celular. As que já estavam guardadas somem sozinhas quando a gira passa.

**Bom saber.**

- O celular guarda até 5 bilhetes, só de giras que ainda não passaram.
