# Repetir a gira em outra data (beta)

- **Chave:** `beta_repetir_gira` · **Grupo:** Para a gira · **Situação:** em teste desde 02/11/2026 (jornadas v2)
- **O que faz:** Para a gira que se repete toda semana ou todo mês, você cria a próxima a partir de uma que já existe, sem preencher tudo de novo.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** some da tela; nada do que foi registrado é apagado.
- **Critério para sair do beta:** uso pelas casas piloto sem erro por um ciclo de giras e aprovação do dono.

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** Para a gira que se repete toda semana ou todo mês, você cria a próxima a partir de uma que já existe, sem preencher tudo de novo.

**Como usar.**

1. Em Giras, no cartão da gira, abra "Mais ações" e escolha "Repetir em outra data".
2. O cadastro abre já preenchido com o nome, a descrição, os recados, o local, as orientações da corrente, a quantidade de senhas e os acompanhantes.
3. Escolha a nova data e o horário, confira e salve.

**Quem vê.** Quem pode criar giras.

**Ao desligar.** A opção some do menu da gira. As giras criadas assim continuam normais.

**Bom saber.**

- Só a configuração é copiada. Senhas, fila e atendimentos da gira antiga não vão para a nova.
- Os horários de atendimento por faixa não são copiados. Se a gira usa, configure de novo.
