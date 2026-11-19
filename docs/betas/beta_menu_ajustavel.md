# Menu que se ajusta ao uso (beta)

- **Chave:** `beta_menu_ajustavel` · **Grupo:** Para o painel · **Situação:** em teste desde 02/11/2026 (jornadas v2)
- **O que faz:** O menu lateral mostra o que a casa usa de verdade. Módulo que já tem dado (médiuns, mensalidades, estoque e outros) sobe sozinho para "Da casa", e o resto fica em "Ver os módulos".
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório. Sem ela, o menu é o completo.
- **Ao desligar:** o menu volta ao completo; nada é apagado.
- **Critério para sair do beta:** uso pelas casas piloto sem erro por um ciclo de giras e aprovação do dono.

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** O menu lateral mostra o que a casa usa de verdade. Módulo que já tem dado (médiuns, mensalidades, estoque e outros) sobe sozinho para "Da casa", e o resto fica em "Ver os módulos".

**Como usar.**

1. Ligue e veja o menu se arrumar pelo uso.
2. Na página Módulos, cada pessoa põe ou tira módulos do próprio menu.

**Quem vê.** Todo mundo do painel da casa. O que cada pessoa escolhe na página Módulos vale só para ela.

**Ao desligar.** O menu volta a mostrar todos os módulos. Nada é apagado.

**Bom saber.**

- Nada some de verdade: o que não está no menu continua em "Ver os módulos", com o mesmo endereço.
