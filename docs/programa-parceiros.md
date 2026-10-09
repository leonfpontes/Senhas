# Programa de Parceiros GiraHub (C-06)

Last Updated: 2026-10-09

Página pública `/parceiros` (convite + formulário de interesse) e lista dos pedidos na plataforma
(`/platform/parceiros`). **Tudo atrás da chave `NEXT_PUBLIC_PARCEIROS_PUBLICADO`**, desligada por padrão no
código e **ligada em produção desde 2026-10-09**, quando o dono aprovou os números abaixo (ver "Decisões do dono").

## Regras (o que a página promete)

| Item | Regra | Onde mudar |
|---|---|---|
| Quem pode | Lojas de artigos religiosos, dirigentes e médiuns, criadores de conteúdo do axé, federações e associações | `QUEM_PODE` |
| Terreiro indicado | Teste grátis normal + **20% de desconto nos 3 primeiros meses** de qualquer plano pago, com o cupom do parceiro | `DESCONTO_PCT`, `DESCONTO_MESES` |
| Parceiro | **20% de comissão recorrente** sobre o que o terreiro pagar, **por 12 meses** | `COMISSAO_PCT`, `COMISSAO_MESES` |
| Pagamento | PIX todo mês, até o dia **10** do mês seguinte, a partir de **R$ 30** acumulados (abaixo disso acumula) | `PAGAMENTO_ATE_DIA`, `PAGAMENTO_MINIMO` |
| Resposta ao pedido | Até **2 dias úteis**, com cupom e material | `RESPOSTA_DIAS_UTEIS` |
| Base da comissão | Só pagamentos efetivamente recebidos; estornos e reembolsos descontam; teste grátis não conta | `REGULAMENTO` |
| Autoindicação | O terreiro do próprio parceiro não conta | `REGULAMENTO` |
| Proibido | Spam e anúncio com a marca GiraHub em buscadores | `REGULAMENTO` |
| Encerramento | GiraHub pode encerrar com aviso de **30 dias**; comissões já devidas são pagas | `AVISO_ENCERRAMENTO_DIAS` |
| Material | Link e cupom próprios, display A4 com QR para o balcão, textos prontos para WhatsApp e Instagram | `MATERIAL` |

Todas as constantes ficam em `frontend/src/constants/parceiros.ts`. Os valores em reais da página
(exemplo "Um terreiro no plano Pro rende R$ 15,80 por mês para você" e a comissão por plano) são
calculados dos preços de `frontend/src/constants/plans.ts` — mudou o preço lá, a página acompanha.

## Economia por terreiro indicado (1º ano)

Premissas: o terreiro assina com o cupom e fica 12 meses no plano (depois do teste grátis, que não gera
receita nem comissão). Preço cheio mensal `P`; desconto de 20% nos meses 1–3; comissão de 20% sobre o
valor pago nos meses 1–12. Taxas do Stripe não estão incluídas (incidem igual com ou sem parceria).

- Receita de tabela no ano: `12 P`
- Desconto do terreiro: `3 × 20% × P = 0,6 P` (5% da receita de tabela)
- Receita efetivamente paga: `11,4 P`
- Comissão do parceiro: `20% × 11,4 P = 2,28 P` (19% da receita de tabela; 20% da receita paga)
- **Custo total do programa: `2,88 P` = 24% da receita de tabela do 1º ano**
- Receita líquida do GiraHub: `9,12 P` = 76% da receita de tabela

| Plano | Preço/mês | Receita de tabela (12 m) | Desconto (3 m) | Comissão (12 m) | Custo total | Custo % da receita de tabela | Receita líquida GiraHub |
|---|---:|---:|---:|---:|---:|---:|---:|
| Basic | R$ 49 | R$ 588,00 | R$ 29,40 | R$ 111,72 | R$ 141,12 | 24% | R$ 446,88 |
| Pro | R$ 79 | R$ 948,00 | R$ 47,40 | R$ 180,12 | R$ 227,52 | 24% | R$ 720,48 |
| Premium | R$ 99 | R$ 1.188,00 | R$ 59,40 | R$ 225,72 | R$ 285,12 | 24% | R$ 902,88 |

Comissão mensal do parceiro por terreiro: Basic R$ 9,80 (R$ 7,84 nos 3 meses com desconto), Pro
R$ 15,80 (R$ 12,64), Premium R$ 19,80 (R$ 15,84).

Leitura: o custo só existe quando o terreiro paga (é custo de aquisição por sucesso). Do 2º ano em diante
o terreiro indicado paga preço cheio e não há comissão — em 24 meses o custo cai para 12% da receita de
tabela. Com o mínimo de R$ 30 para o PIX, um parceiro com um único terreiro Basic recebe a cada ~4 meses.

## Decisões do dono

- **2026-10-09: números aprovados** (20% de desconto × 3 meses para o terreiro; 20% de comissão × 12 meses para o
  parceiro; mínimo R$ 30; pagamento até o dia 10) e **página publicada**: `NEXT_PUBLIC_PARCEIROS_PUBLICADO=true` no
  ambiente `Hostinger` do GitHub.
- Ainda em aberto: comissão sobre o valor bruto pago (como está) ou líquido da taxa do Stripe; como registrar o
  pagamento a pessoa física (recibo/RPA) — conferir com a contabilidade. Cupom continua manual no Stripe até o $-05.

## Operação (até o $-05)

1. Pedido chega pelo formulário → linha em `parceiro_interesses` (status `novo`) e e-mail para o
   `ALERT_EMAIL` com o link `/platform/parceiros?pedido=<id>` (reply-to = e-mail do interessado).
2. Equipe conversa (status `em_contato`), aprova (`aprovado`) ou recusa (`recusado`) na plataforma e
   anota o cupom e as observações (chave PIX, material enviado).
3. **Cupom manual no Stripe**: cupom de 20% com duração "repetir por 3 meses" + código promocional com o
   nome anotado na plataforma. O checkout do GiraHub ainda não aceita código promocional
   (`stripe_service.create_checkout_session` sem `allow_promotion_codes`): até o $-05, o terreiro avisa o
   cupom no "Como conheceu" do cadastro ou pelo suporte, e a equipe aplica o cupom à assinatura no painel
   do Stripe.
4. Comissão calculada à mão pelas faturas pagas no Stripe com aquele cupom, paga por PIX até o dia 10.

Fica para depois (C-06 completo / $-05): cupom no cadastro e no checkout, relatório de conversões por
cupom na plataforma, display A4 em PDF gerado com QR para `/cadastro?cupom=X`.

## Onde está no código

- Página: `frontend/src/pages/parceiros.tsx` (+ `components/landing/ParceiroForm.tsx`,
  `components/landing/ParceirosChamada.tsx`); 404 com a chave desligada (`getStaticProps → notFound`).
- API pública: `POST /api/v1/public/parceiros/interesse` (`backend/src/api/v1/public/parceiros.py`).
- Plataforma: `GET/PATCH /api/v1/platform/parceiros*` (`backend/src/api/v1/platform/parceiros.py`) e
  `frontend/src/pages/platform/parceiros.tsx`.
- Tabela: `parceiro_interesses` (migração `084_parceiros`).
