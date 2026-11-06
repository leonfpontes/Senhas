# Assistente de plano no site (beta do site)

- **Chave:** `NEXT_PUBLIC_ASSISTENTE_PLANO=true` (variável do frontend, não é beta do Laboratório: o site não tem casa logada) · **Situação:** em teste local desde 04/11/2026 (jornadas v2, J1 · 03, decisão do Leonardo)
- **O que faz:** na página Planos, três perguntas (giras por mês, médiuns da corrente e se precisa de financeiro, estoque ou fila de espera) e a indicação do plano mais barato que comporta as respostas, com o preço da tabela e o botão para o cadastro já com o plano.
- **De onde vem a indicação:** dos limites de cada plano (`PLANS[*].limits`), da mesma regra de `recommendPlan` que a assinatura usa e do plano mínimo dos recursos (`FEATURE_MIN_PLAN`, espelho de `_FEATURE_MIN_TIER`). Nada escrito à mão em `constants/assistentePlano.ts`.
- **Design ético:** nenhuma resposta vem marcada; o plano só aparece depois das três respostas; o Gratuito é indicado quando dá conta; sem urgência, sem "oferta"; nada é guardado.
- **Quem enxerga:** qualquer visitante de `/planos`, só onde a chave estiver ligada. Hoje: só no Docker local (`docker-compose.override.yml`, git-ignorado). **Em produção, desligada.**
- **Ao desligar:** o bloco some; a página Planos fica como sempre.
- **Critério para sair do beta:** aprovação do Leonardo depois de ver no ambiente local.
