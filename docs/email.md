# Sistema de E-mail

Envio de e-mails com dois providers (Resend primário, Brevo de reserva) por uma fila em memória.

---

## Arquitetura

Todo e-mail passa pela fila em memória `services/email/email_queue.py` (`email_queue.enqueue(EmailQueueItem(message=EmailMessage(...)))`),
iniciada no lifespan de `main.py` — um worker por processo, um envio a cada 200 ms (≤ 5/s).

```
EmailMessage (to_email, subject, html_body, text_body?, reply_to?)
       │
       ▼
  email_queue (asyncio.Queue, até 500 itens — acima disso o enqueue DESCARTA e loga)
       │
       ├── Resend (primário) ── sucesso → grava provider/id no ticket (se houver ticket_id)
       │
       └── 429 ou falha → Brevo (reserva) ── sucesso → grava "brevo"
                                     └── falha → loga erro, grava "failed"
```

A fila é em memória: o que estiver nela num deploy/restart se perde. Quem enfileira muitos e-mails de uma vez
(agendadores) espera a fila esvaziar (`email_queue.qsize()`, ver o agendador da Área abaixo).

---

## Providers

### Resend — Provider Primário

| Item | Valor |
|------|-------|
| Classe | `ResendEmailService` (`services/email/resend_fallback.py` — o nome do arquivo é histórico) |
| Endpoint | `https://api.resend.com/emails` |
| Config | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (padrão `noreply@girahub.com.br`) |
| Limite do plano gratuito | 3.000 e-mails/mês e 100/dia |

### Brevo — Provider de Reserva

| Item | Valor |
|------|-------|
| Classe | `BrevoEmailService` (`services/email/brevo_provider.py`) |
| Endpoint | `https://api.brevo.com/v3/smtp/email` |
| Config | `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME` |
| Limite do plano gratuito | 300 e-mails/dia |

Sem a chave de um provider, ele é pulado (log de aviso).

---

## Interface Base

`services/email/base.py`: `EmailMessage` (dataclass com `to_email`, `subject`, `html_body`, `text_body`,
`reply_to`) e `EmailService` (`send_async(message) -> bool`, `send_batch`). Os templates ficam em
`services/email/templates/` e devolvem HTML com CSS inline; todo texto variável passa por `html.escape`.

---

## E-mails da Área do Médium — lembretes e avisos (AM-15)

Agendador `services/medium_lembrete_scheduler.py` (a cada 15 min; chave `0x6769726168756206`), regras em
`services/medium_lembretes.py`, textos em `services/email/templates/medium_lembretes.py`. Só para terreiros com a
chave do piloto (`tenants.area_medium_liberada`), o plano `area_medium` e a Área ligada pela casa.

| Tipo | Para quem | Quando (Brasília) | Assunto |
|---|---|---|---|
| Mensalidade D-3 / D+3 (D-29) | médium com o mês em aberto e sem comprovante (não isento); casa pode desligar | 9–20 h | `<terreiro>: sua mensalidade vence em 3 dias` / `<terreiro>: lembrete da mensalidade` |
| Chave PIX trocada | médiuns não isentos (sem a chave no e-mail) | 7–22 h, até 2 dias depois | `<terreiro>: a chave PIX da mensalidade mudou` |
| Escala nova | quem entrou na escala de algo de depois de amanhã em diante (um e-mail com todos os dias) | 7–22 h | `<terreiro>: você está na escala` |
| Véspera | quem está na escala ou disse "Vou" para amanhã (grupo, função, horário, local) | 18–22 h | `<terreiro>: lembrete para amanhã` |
| D-2 | na escala, sem "Vou / Não vou" | 10–20 h | `<terreiro>: responda se você vai` |
| Falta | marcado ausente, sem motivo, dentro do prazo da casa (o texto do motivo nunca vai) | 9–21 h | `<terreiro>: sentimos sua falta` |
| Aviso da casa | público do aviso com "Avisar por e-mail também" | 7–22 h, até 3 dias depois | `<terreiro>: novo aviso da casa` |
| Cancelamento | quem estava na escala de uma atividade cancelada | 7–22 h, até 2 dias depois | `<terreiro>: uma atividade foi cancelada` |
| Troca pedida (AM-27) | o colega chamado para ir no lugar (primeiro nome de quem pediu, recado) | 7–22 h, até 2 dias depois | `<terreiro>: pedido de troca na escala` |
| Resposta da troca (AM-27) | quem pediu: o colega aceitou (falta a direção), não pode, a direção recusou ou cancelou | 7–22 h, até 2 dias depois | `<terreiro>: resposta ao seu pedido de troca` |
| Troca aprovada (AM-27) | os dois (nome do substituto só com o opt-in do D-07 quando a direção escolheu) | 7–22 h, até 2 dias depois | `<terreiro>: troca na escala confirmada` |
| Resumo do dia | administradores ativos (comprovantes para conferir, ausências avisadas, motivos novos — só contagens, só quando há algo) | 8–12 h, um por terreiro por dia | `Resumo do dia na Área do Médium — <terreiro>` |

- **Discretos** (LGPD art. 11, §6.8 do plano): assunto e prévia (texto escondido do topo) só com o nome do
  terreiro, nunca o nome da atividade nem o título do aviso; vocabulário do glossário da Área.
- **Uma vez só** com 2 workers: marca em `medium_lembretes_enviados` gravada antes de enfileirar
  (`INSERT … ON CONFLICT DO NOTHING RETURNING`).
- **Descadastro**: rodapé com "Desligar estes avisos" e "Desligar todos os e-mails da Área"
  (`/descadastro/<token>?tipo=…`); o médium também muda no Perfil da Área. O cabeçalho `List-Unsubscribe` ainda
  não é enviado (o `EmailMessage` não tem cabeçalhos).
- **No celular também (AM-16)**: cada um desses lembretes do médium também sai como notificação (Web Push) para
  os aparelhos em que ele ligou as notificações, com liga/desliga próprio por tipo; e-mail e celular são
  independentes e a marca é a mesma (uma vez só). Texto do push ainda mais curto (sem nome de atividade/aviso,
  valor ou motivo) em `services/medium_push.py`. Sem as chaves VAPID, só e-mail. O descadastro do rodapé só
  desliga e-mail. Push não tem custo por envio — reduz a pressão do R-08 conforme os médiuns ligam.

### Volume estimado (risco R-08 do plano)

Não há acesso aos números de produção daqui; a estimativa usa hipóteses e deve ser conferida com a consulta
abaixo antes de ligar a Área para todos.

Por médium com acesso à Área, por mês, com tudo ligado:

| Tipo | E-mails/mês |
|---|---|
| Mensalidade (D-3 sempre; D+3 para quem não pagou, ~1/3) | ~1,3 |
| Escala nova (um por publicação) | ~1 |
| Véspera (2 faxinas + 2 giras com função) | ~4 |
| D-2 sem resposta (~1/3 das escalas) | ~1,3 |
| Falta (convite) | ~0,3 |
| Avisos com e-mail (casa usa ~2/mês) | ~2 |
| Cancelamento e troca do PIX | ~0,1 |
| **Total** | **~10** |

Mais o resumo do admin: até ~20 dias com algo × 2 admins ≈ 40/mês por terreiro.

- Piloto (3–4 casas, ~30 médiuns com acesso cada): 4 × (30 × 10 + 40) ≈ **1.400/mês** — cabe nos 3.000/mês do
  Resend gratuito, mas divide a cota com as senhas emitidas aos consulentes (o maior volume) e com os demais
  e-mails do sistema.
- Pico diário: um aviso por e-mail numa casa de 60 médiuns + a véspera de uma gira com 30 na escala = 90 e-mails no
  mesmo dia, perto do teto de 100/dia do Resend; o que passar volta 429 e sai pelo Brevo (300/dia).
- Ligando para todos os terreiros, o volume cresce ~10 × médiuns com acesso: 300 médiuns já dão ~3.000/mês só de
  lembretes — antes disso, plano pago do Resend, push (AM-16) como canal principal ou lembretes mais agregados.

Consulta para medir (por terreiro, últimos 30 dias):

```sql
SELECT tenant_id, tipo, count(*)
  FROM medium_lembretes_enviados
 WHERE enviado_em >= now() - interval '30 days'
 GROUP BY tenant_id, tipo ORDER BY tenant_id, tipo;
```

### Médium encerrou o acesso (AM-14)

Fora do agendador: `POST /api/v1/medium/meus-dados/encerrar` enfileira, depois do commit, um e-mail para cada
administrador ATIVO do terreiro (`medium_lembretes.emails_dos_admins`), texto em
`services/email/templates/medium_acesso_encerrado.py`. Assunto `<primeiro nome> encerrou o acesso à Área do
Médium`; corpo só com o primeiro nome, o terreiro e a data, explicando que o cadastro continua com a casa e que dá
para convidar de novo (Médiuns → Acesso à Área). Volume desprezível (um por encerramento).

---

## Reenvio de E-mail

Consulentes podem solicitar reenvio via:

```
POST /api/v1/public/{tenant_id}/resend-email
{
  "email": "joao@example.com"
}
```

**Rate limit**: 2 reenvios por hora por email.

---

## Health Check

O endpoint `/api/v1/admin/health` verifica ambos os providers:

```json
{
  "status": "healthy",
  "services": {
    "database": "ok",
    "brevo": "ok",
    "resend": "ok"
  }
}
```

Se um provider estiver indisponível, status muda para `"degraded"` (não `"unhealthy"`), pois o fallback garante entrega.

---

## Métricas

| Métrica | Target | Alcançado |
|---------|--------|-----------|
| Taxa de entrega | > 99% | > 99.5% |
| Latência média | < 2s | ~1s |
| Fallback activation | < 1% | < 0.5% |
| Template rendering | < 50ms | ~10ms |
