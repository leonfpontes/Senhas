# Lembrete no dia da gira (beta)

- **Chave:** `beta_lembrete_dia_gira` · **Grupo:** Para a gira · **Situação:** em teste desde 02/11/2026 (jornadas v2)
- **O que faz:** No dia da gira, de manhã, quem tem senha recebe um e-mail com o número da senha, o horário e o recado da casa. Quem não puder ir libera a vaga pelo próprio e-mail, e ela fica para outra pessoa.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** some da tela; nada do que foi registrado é apagado.
- **Critério para sair do beta:** uso pelas casas piloto sem erro por um ciclo de giras e aprovação do dono.

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** No dia da gira, de manhã, quem tem senha recebe um e-mail com o número da senha, o horário e o recado da casa. Quem não puder ir libera a vaga pelo próprio e-mail, e ela fica para outra pessoa.

**Como usar.**

1. Basta ligar. O envio é automático, a partir das 8h (horário de Brasília) do dia da gira.
2. O que estiver em "Recados" no cadastro da gira vai junto no lembrete.

**Quem vê.** Quem tem senha emitida para a gira. Cada pessoa recebe um e-mail só.

**Ao desligar.** Os lembretes param a partir do próximo envio. Nada muda nas senhas.

**Bom saber.**

- Gira que começa em menos de 2 horas não recebe lembrete.
- Acompanhante não recebe e-mail próprio: o lembrete vai para quem pegou a senha.
