# Mensalidade com baixa automática — como funciona o fluxo de pagamento (F-01)

Criado: 2026-10-08 · Status: **decidido em 09/10 — misto: cada casa escolhe Stripe (Stripe Connect) ou Mercado
Pago (OAuth)**; plano Pro (`mensalidade_automatica`); o GiraHub não cobra comissão · Em implementação: PR 1 (base
comum + Stripe Connect) e PR 2 (Mercado Pago) — ver §7

## 1. Hoje (no ar desde a 2.4.0)

1. A casa cadastra a **chave PIX** dela (Configurações → Área do Médium, AM-10).
2. O médium toca em "Pagar com PIX": o GiraHub monta um QR/copia-e-cola **estático** com a chave da casa e o valor.
3. O médium paga no banco dele e **envia o comprovante** pela Área (AM-12).
4. Alguém da direção confere o extrato e **confirma** o pagamento no painel.

Sem taxa nenhuma, o dinheiro cai direto na conta da casa — mas a conferência é manual e o GiraHub não sabe sozinho
que o PIX entrou (PIX estático não avisa ninguém).

## 2. Com gateway (o que o F-01 decide)

Um gateway é uma conta de recebimentos (Mercado Pago, Asaas, Stripe…) que **cria cada cobrança** e **avisa o
GiraHub quando ela é paga**. O fluxo fica assim:

1. **Uma vez só, a casa conecta a conta dela.** Em Configurações, o dirigente toca em "Conectar Mercado Pago" (por
   exemplo), entra na conta da casa no site do gateway e autoriza o GiraHub. Isso é o **OAuth**: o GiraHub recebe uma
   autorização para criar cobranças **na conta da casa**, sem nunca ver a senha. A casa pode desconectar quando quiser.
2. **O médium toca em "Pagar com PIX".** O GiraHub pede ao gateway uma cobrança na conta da casa: valor, vencimento e um
   identificador (médium + mês). O gateway devolve um **QR dinâmico** (copia-e-cola), válido para aquela cobrança.
3. **O médium paga no banco dele**, como qualquer PIX.
4. **O gateway avisa o GiraHub** (webhook) em segundos. O GiraHub confere a assinatura do aviso, acha a casa pela
   cobrança (nunca pelo que vem no aviso) e marca o mês como **pago**, com recibo. O médium vê "Paga" na hora; a
   direção vê no painel, sem comprovante e sem conferir extrato.
5. **O dinheiro fica na conta da casa no gateway** (no Mercado Pago, o PIX fica disponível na hora) e a casa transfere
   para o banco quando quiser.
6. **A taxa** do gateway é descontada da casa em cada pagamento recebido. O GiraHub **não cobra nada** e não toca no
   dinheiro (regra "custo zero"/"o dinheiro cai direto na conta do terreiro" do F-01).

Quem ainda não conectou um gateway continua no fluxo de hoje (chave estática + comprovante), lado a lado.

## 3. As três opções

| | Mercado Pago (OAuth) | Asaas | Stripe Connect |
|---|---|---|---|
| Como a casa conecta | Botão "Conectar" + login no Mercado Pago (OAuth) | Chave de API colada pela casa, ou subconta criada pelo GiraHub (modelo BaaS, com avaliação regulatória e limites no começo) | Cadastro da casa no Stripe pelo fluxo do Connect |
| Casa sem CNPJ (só CPF) | Aceita | Aceita | Aceita, com cadastro mais pesado |
| Taxa do PIX (para a casa) | Percentual por PIX recebido (os comparativos falam em ~0,99% no checkout online; conferir na conta) | Valor fixo por PIX pago: R$ 0,99 nos 3 primeiros meses, depois R$ 1,99 | Percentual; conferir na conta Stripe Brasil |
| Boleto e cartão | Sim | Sim | Sim |
| O que o GiraHub guarda | Token do OAuth (revogável pela casa) | Chave de API da casa (dá acesso à conta inteira dela) | Id da conta conectada |
| Conhecido do público | Muito (a maioria já tem conta) | Médio | Baixo entre terreiros |

Comparativo de custo para uma mensalidade de R$ 50: Mercado Pago ~R$ 0,50 (se 0,99%); Asaas R$ 1,99. Para mensalidades
abaixo de ~R$ 200, o percentual do Mercado Pago sai mais barato que o fixo do Asaas.

## 4. O que precisa ser construído (qualquer opção)

- **Guardar a credencial com criptografia** (o projeto ainda não tem um utilitário para segredo em repouso — é a
  primeira tarefa do F-02, vale para o token do OAuth também).
- Tela "Conectar/desconectar" em Configurações (permissão `FINANCEIRO:edit`, senha do dirigente, como na troca da chave
  PIX).
- Tabela `mensalidade_cobrancas` (casa, médium, mês, valor, id no gateway, status, QR, pago_em).
- Webhook com assinatura verificada e idempotente (aviso repetido não paga duas vezes).
- AM-22: na Área, "Pagar com PIX" usa a cobrança dinâmica quando a casa está conectada.

## 5. Recomendação

**Mercado Pago com OAuth**: é a conta que a maioria dos terreiros já tem ou consegue abrir com CPF, a casa autoriza com um
botão (sem colar chave), pode desconectar quando quiser, o PIX fica disponível na hora e, para mensalidades comuns, a
taxa percentual sai mais barata que a fixa. Antes de começar: abrir a conta de integrador, conferir a taxa real do PIX
online e fazer uma cobrança real de valor baixo (o OAuth só gera credenciais de produção).

## 5a. E pelo Stripe? (pergunta do dono, 09/10)

Dá, com o **Stripe Connect** — o mesmo Stripe que já cobra a assinatura do GiraHub:

1. Cada casa abre (ou conecta) uma conta Stripe dela pelo fluxo do Connect, dentro do GiraHub (cadastro com CPF ou
   CNPJ, conta bancária para o repasse). O GiraHub guarda **só o id da conta conectada** — nenhuma chave nem token
   (melhor que as outras opções: não precisa do utilitário de criptografia).
2. "Pagar com PIX" cria um **pagamento avulso por PIX na conta da casa** (cobrança direta, a casa é a vendedora), com
   QR e copia-e-cola; boleto também funciona. O aviso de pago chega pelo mesmo webhook que já existe.
3. O dinheiro cai na conta Stripe da casa e é repassado para o banco dela no cronograma padrão.

Pontos de atenção (documentação do Stripe, acessada em 09/10/2026):
- No Brasil o Stripe aceita **PIX só como pagamento avulso** (o PIX recorrente, Pix Automático, não existe no
  Brasil) — para mensalidade isso basta, porque cada mês é uma cobrança.
- PIX no Brasil aparece como **"por convite"** na tabela do Stripe. A conta do GiraHub já tem PIX ligado, mas **cada
  casa conectada também precisa ter o PIX liberado** (a capacidade `pix_payments` da conta conectada). Isso precisa
  ser testado com uma casa piloto antes de prometer.
- Taxas (para a casa): PIX avulso **1,19%**; boleto **R$ 3,45** por boleto pago. O PIX sai mais caro que o percentual
  divulgado pelo Mercado Pago, mas tudo fica num fornecedor só.
- O nome que aparece no extrato do médium é o do parceiro de PIX do Stripe (Ebanx), com o nome da casa no
  identificador.

**Comparação rápida:** Stripe Connect = mais seguro e simples para nós (sem segredo guardado, um fornecedor só) e mais
caro no PIX; Mercado Pago = mais barato e mais conhecido pelos terreiros, mas exige guardar o token de cada casa com
criptografia. **Próximo passo sugerido:** testar o Connect com uma casa piloto (abrir a conta conectada e ver se o PIX
é liberado); se for, seguir com o Stripe.

Fontes: https://docs.stripe.com/payments/pix · https://docs.stripe.com/payments/payment-methods/payment-method-support
· https://docs.stripe.com/connect/direct-charges

## 6. O que o dono decide

1. Gateway: Mercado Pago (recomendado), Asaas ou Stripe Connect.
2. Plano: baixa automática em qual plano (sugestão: Pro, junto de "escalas").
3. GiraHub cobra alguma comissão por pagamento? Recomendação: **não** (custo zero é argumento de venda; o Mercado Pago
   permitiria uma comissão do marketplace no futuro, se um dia fizer sentido).

## 7. Decisão (09/10) e o que foi construído

O dono decidiu pelo **modelo misto**: em Financeiro → Configuração → Mensalidade, card "Receber a mensalidade
automaticamente", a casa escolhe **Stripe** ou **Mercado Pago**. Plano **Pro** (`mensalidade_automatica`); sem
taxa do GiraHub. Quem não conecta segue com a chave estática + comprovante.

- **Base comum (PR 1)**: `core/secret_box.py` (segredo em repouso, Fernet com `SECRETS_ENCRYPTION_KEY` — sem chave
  nada é gravado), tabelas `mensalidade_gateways` e `mensalidade_cobrancas` (migração 091), coluna
  `mensalidade_pagamentos.origem` (gateway × direção), conectar/desconectar com senha e e-mail a todos os admins,
  "Pagar com PIX" da Área gerando a cobrança na conta da casa (AM-22), baixa idempotente pelo webhook.
- **Stripe Connect (PR 1)**: conta conectada com painel **Express** e controlador "a casa paga as taxas do Stripe,
  o Stripe responde por perdas, o Stripe coleta o cadastro". Por que Express e não Standard: no Express a
  **plataforma pede** as capacidades `pix_payments` e `boleto_payments` (no Standard é o dono da conta que liga o
  PIX no painel dele — docs.stripe.com/payments/pix, seção Connect); o cadastro hospedado aceita pessoa física (CPF)
  ou jurídica (CNPJ); e, com `fees.payer=account` + `losses.payments=stripe`, o GiraHub não paga taxa nem responde
  por saldo negativo da casa. Cobrança **direta** (a casa é a vendedora), sem `application_fee`. Webhook separado
  (`/api/v1/webhooks/stripe-connect`, segredo próprio). Passos do dono em `docs/deployment.md`.
- **Mercado Pago (PR 2)**: OAuth com `state` assinado, tokens cifrados com o `secret_box`, PIX pela API de
  pagamentos com o token da casa, webhook com `x-signature` e consulta do pagamento no Mercado Pago.

## Fontes (acessadas em 08/10/2026)

- Mercado Pago — integrar o checkout em Split de Pagamentos (OAuth, `access_token` por vendedor, comissão do marketplace):
  https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace
- Mercado Pago — quanto custa receber via Pix: https://www.mercadopago.com.br/blog/quanto-custa-receber-pagamentos-via-pix-e-codigo-qr
- Comparativo de taxas Mercado Pago 2026 (terceiro): https://www.calculadoradetaxas.com.br/public/mercado-pago
- Asaas — Pix (tarifa por pagamento): https://asaas.com/pix-asaas
- Asaas — subcontas/BaaS: https://docs.asaas.com/docs/criacao-de-subcontas
