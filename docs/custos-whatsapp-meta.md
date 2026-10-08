# WhatsApp pela API oficial da Meta — custos e caminho (P-02)

Criado: 2026-10-08 · Status: **levantamento para a decisão do dono** (P-02) · Destrava: F-03

## 1. Como a Meta cobra (desde 1º/07/2025)

- Cobra **por mensagem de modelo (template) entregue**, conforme a **categoria** do modelo e o país do número de quem
  recebe. Não há mensalidade da Meta nem custo de servidor (a Cloud API é hospedada pela própria Meta).
- **Grátis:**
  - qualquer resposta dentro da **janela de 24 h** que abre quando a pessoa manda mensagem para o número do GiraHub;
  - modelos **utilitários** enviados dentro dessa janela;
  - tudo por 72 h quando a pessoa chega por anúncio "Clique para o WhatsApp" (não se aplica a nós por enquanto).
- **Pago:** mensagem que o GiraHub **inicia** (lembrete, aviso) fora da janela, sempre com modelo aprovado pela Meta.
- Utilitário e autenticação ficam mais baratos com volume mensal; marketing não tem desconto por volume.
- No Brasil, desde 1º/07/2026 empresas elegíveis passam a ser cobradas **em reais** (fatura do Facebook Brasil); a
  migração é obrigatória até 30/06/2027.

## 2. Preço por mensagem no Brasil (cartão de preços em vigor)

| Categoria | Para quê no GiraHub | Preço (US$) | Em reais (aprox.) |
|---|---|---|---|
| Utilitária | Senha emitida, "sua vez está chegando", lembrete da gira, escala, mensalidade vencendo | 0,0068 | ~R$ 0,035 a 0,04 |
| Marketing | Convite para gira aberta, novidades, promoções | 0,0625 | ~R$ 0,32 a 0,34 |
| Autenticação | Código de login (não usamos: o login é por e-mail) | conferir no cartão | — |
| Resposta dentro da janela de 24 h | Qualquer conversa que a pessoa começou | grátis | grátis |

Os sites de terceiros divergem nos valores em reais; o valor oficial está no cartão de preços (CSV/PDF) da página de
preços da Meta e deve ser conferido quando a conta for criada.

## 3. Quanto custaria para um terreiro (estimativas)

| Uso | Conta | Custo por mês |
|---|---|---|
| Senha por WhatsApp, com o **consulente começando a conversa** (toca em "Receber minha senha no WhatsApp", o app abre com a mensagem pronta e ele envia) | tudo dentro da janela de 24 h | **R$ 0** |
| Mesma senha, com o GiraHub iniciando (150 consulentes × 4 giras × 2 avisos) | 1.200 utilitárias × R$ 0,037 | ~R$ 44 |
| Lembretes da corrente (30 médiuns × 6 avisos: véspera, escala, mensalidade) | 180 utilitárias × R$ 0,037 | ~R$ 7 |
| Convite de gira aberta para 200 consulentes, 2 vezes no mês | 400 marketing × R$ 0,33 | ~R$ 132 |

Para a plataforma: 100 terreiros só com lembretes da corrente ≈ R$ 700/mês; com a senha iniciada pelo consulente, o
custo da fila é zero. **O desenho do produto decide o custo:** fluxos em que a pessoa começa a conversa são grátis;
marketing é caro e deve ser pago à parte.

## 4. O que é preciso para começar (além do dinheiro)

1. **Verificação do negócio na Meta** (Business Manager) com os documentos da empresa — **precisa do CNPJ** da empresa
   responsável pelo GiraHub (o mesmo que ainda falta nos Termos).
2. **Um número dedicado** (chip novo ou fixo) que não esteja em uso no app WhatsApp.
3. Nome de exibição aprovado ("GiraHub") e **modelos aprovados** um a um (texto fixo com campos: "Olá, {{1}}! Sua senha
   na {{2}} é {{3}}.").
4. Limite inicial de envio por dia (sobe conforme a qualidade e o volume); opt-in claro de quem recebe e "sair" fácil.
5. Integração direta com a Cloud API (sem intermediário/BSP, que cobra 10% a 35% em cima) — webhook no backend, fila de
   envio no agendador, respeitando as preferências de aviso já existentes (AM-15).

## 5. Recomendação

- **Fase 1 (barata):** senha por WhatsApp com o consulente iniciando a conversa (custo zero) e lembretes utilitários da
  corrente como **adicional pago** (ex.: "WhatsApp da casa", R$ 14,90/mês com até 300 mensagens; acima disso, R$ 0,06
  cada), ou incluído no Premium com o mesmo limite.
- **Marketing** (convite para lista de consulentes) só como pacote pago separado, se houver procura.
- Antes de tudo: CNPJ e verificação do negócio na Meta — sem isso a API não sai do modo de teste.

## 6. O que o dono decide

1. Abrir a conta da Meta (Business Manager + verificação com o CNPJ) e o número dedicado.
2. Modelo de cobrança: adicional pago (recomendado) ou incluído em plano, e o preço.
3. Ordem: senha por WhatsApp (consulente inicia) primeiro, lembretes da corrente depois.

## Fontes (acessadas em 08/10/2026)

- Meta — preços da WhatsApp Business Platform (cobrança por mensagem, janelas grátis, cobrança em reais no Brasil):
  https://developers.facebook.com/docs/whatsapp/pricing
- Tabela por país (terceiros, valores do Brasil): https://flowcall.co/blog/whatsapp-business-api-pricing-2026 ·
  https://www.messagecentral.com/blog/whatsapp-business-api-pricing-in-brazil ·
  https://www.engagelab.com/blog/whatsapp-business-api-pricing
