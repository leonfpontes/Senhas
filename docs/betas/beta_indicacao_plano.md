# Indicação do plano pelo uso (beta)

- **Chave:** `beta_indicacao_plano` · **Grupo:** Para o painel · **Situação:** em teste desde 02/11/2026 (jornadas v2, J1 · 09)
- **O que faz:** em Conta e plano, uma frase com o uso real do mês ("Neste mês a casa fez 3 giras e cadastrou 12 médiuns. Pelo uso, o Basic dá conta.") — a mesma regra de `recommendPlan` que o resumo do teste grátis já usa.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório, e só quem vê Conta e plano.
- **Ao desligar:** a frase some; nada muda no plano.
- **Critério para sair do beta:** uso pelas casas piloto sem erro por um ciclo de cobrança e aprovação do dono.

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** Em Conta e plano, uma frase mostra o uso do mês, com quantas giras a casa fez e quantos médiuns cadastrou, e diz qual plano dá conta desse uso. Ajuda a não pagar a mais e a não ficar sem espaço.

**Como usar.**

1. Basta ligar e abrir Conta e plano › Plano e assinatura.

**Quem vê.** Quem vê Conta e plano.

**Ao desligar.** A frase some. Nada muda no plano nem na cobrança.

**Bom saber.**

- É só uma indicação. O plano só muda se a casa escolher mudar.
