# Área do Médium (beta)

- **Chave:** `beta_area_medium` · **Grupo:** Para a corrente · **Situação:** no Laboratório desde 19/11/2026
  (antes era o piloto liberado pela plataforma, desde 07/10/2026)
- **Quem liga:** a própria casa, em Configurações › Laboratório. A plataforma só marca o terreiro como beta tester
  (decisão do dono, 19/11/2026: nada de chave por funcionalidade no backoffice).
- **Também precisa:** plano com `area_medium` (Basic ou superior). O Laboratório mostra a beta em qualquer plano e
  avisa "Precisa do plano Basic ou superior" quando falta; o gate de plano continua valendo no uso
  (`check_plan_feature`, `GET /admin/subscription` com `features.area_medium = false`).
- **O que faz:** a Área do Médium inteira (cards AM-00 a AM-28, `docs/plano-area-do-medium.md`): login próprio do
  médium, agenda, avisos e estudos, escalas e confirmações, mensalidade com PIX e comprovante, ficha, aniversários.
  Liga a aba **Área do Médium** em Configurações, onde a casa configura o que o médium vê e pode pausar a Área
  (`tenant_configs.area_medium_ativa`, "Área do Médium ligada").
- **Onde a checagem fica:** `services/medium_area.area_medium_liberada()` (lê `beta_ligada`), usada por
  `require_medium`, `check_plan_feature("area_medium")` e `/admin/subscription`. Os agendadores de lembretes
  da Área filtram com `laboratorio.condicao_beta_ligada(BETA_AREA_MEDIUM)`.
- **Migração 110 (`110_betas_so_no_laboratorio`):** quem tinha `tenants.area_medium_liberada = true` virou beta
  tester com a beta ligada, então nada mudou para essas casas (ex.: TUCCCO). A coluna saiu.
- **Ao desligar:** os médiuns perdem o acesso na hora (403 em `/api/v1/medium/*`, `areas.medium = null`), a aba
  some e os lembretes param. Nada é apagado.
- **Testes:** `backend/tests/integration_pg/test_area_medium_chave.py`, `test_laboratorio.py` e as suítes AM-*
  (a fábrica `create_tenant(area_medium_liberada=True)` cria beta tester + beta ligada).
- **Critério para sair do beta:** casas piloto usando a Área com a corrente por um ciclo de mensalidade sem erro e
  aprovação do dono. Ao promover, tirar a checagem de `area_medium_liberada()` (fica só o plano).

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** Cada médium da corrente ganha um lugar só dele no GiraHub, com login e senha próprios. Lá ele vê a agenda das giras e das atividades da casa, os avisos e os estudos que a direção publica, as escalas em que está e a própria mensalidade, com o PIX da casa e o envio do comprovante. A casa escolhe o que aparece.

**Como usar.**

1. Ligue aqui. Logo aparece a aba Área do Médium em Configurações.
2. Nessa aba, escolha o que o médium vê (agenda, avisos, mensalidade) e escreva a mensagem de boas-vindas e o WhatsApp da casa.
3. Em Médiuns, use "Convidar todos para a Área" ou convide um por um no cadastro. Cada médium recebe um link no e-mail, cria a senha e entra.
4. Avisos, estudos, atividades e escalas continuam sendo feitos nos módulos de sempre. O médium vê tudo na Área dele.

**Quem vê.** Quem cuida das Configurações liga e desliga. Os médiuns convidados veem só a própria Área: não entram no painel da casa e não veem dado de outro médium. Precisa do plano Basic ou superior.

**Ao desligar.** Os médiuns deixam de entrar na Área na mesma hora, a aba some das Configurações e os e-mails de lembrete da Área param. Nada é apagado: convites, contas dos médiuns, avisos, escalas e configurações ficam guardados e voltam como estavam quando a casa ligar de novo.

**Bom saber.**

- Para pausar a Área por uns dias sem mexer no Laboratório, use "Área do Médium ligada" dentro da própria aba.
- Quem já usava a Área antes do Laboratório continua com ela ligada. Nada mudou para essas casas.
