# Sistema de E-mail

Envio de e-mails com dual-provider para alta disponibilidade.

---

## Arquitetura

```
Emissão de Senha
       │
       ▼
  EmailService (Interface)
       │
       ├── Tenta Brevo (primário)
       │       │
       │       ├── Sucesso → Retorna ✅
       │       │
       │       └── Falha ──┐
       │                   │
       │                   ▼
       └── Tenta Resend (fallback)
               │
               ├── Sucesso → Retorna ✅
               │
               └── Falha → Log error, ticket emitido sem email
```

---

## Providers

### Brevo (SendinBlue) — Provider Primário

| Item | Valor |
|------|-------|
| API | REST v3 |
| Endpoint | `https://api.brevo.com/v3/smtp/email` |
| Auth | Header `api-key: {BREVO_API_KEY}` |
| Limite free | 300 emails/dia |
| SLA | 99.9% |

**Configuração (.env):**
```env
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=noreply@senhas.app
BREVO_SENDER_NAME=Sistema de Senhas
```

### Resend — Provider Fallback

| Item | Valor |
|------|-------|
| API | REST v1 |
| Endpoint | `https://api.resend.com/emails` |
| Auth | Header `Authorization: Bearer {RESEND_API_KEY}` |
| Limite free | 100 emails/dia |
| SLA | 99.9% |

**Configuração (.env):**
```env
RESEND_API_KEY=re_...
```

---

## Interface Base

```python
class EmailService(ABC):
    """Interface abstrata para providers de email."""

    @abstractmethod
    async def send_email(
        self,
        to: str,
        subject: str,
        html_content: str,
        plain_text: str | None = None,
    ) -> bool:
        """Envia email. Retorna True se sucesso."""
        ...

    @abstractmethod
    async def is_healthy(self) -> bool:
        """Verifica se o provider está respondendo."""
        ...
```

---

## Implementação: Brevo

```python
class BrevoEmailService(EmailService):
    def __init__(self, api_key: str, sender_email: str, sender_name: str):
        self.api_key = api_key
        self.sender_email = sender_email
        self.sender_name = sender_name
        self.base_url = "https://api.brevo.com/v3/smtp/email"

    async def send_email(self, to, subject, html_content, plain_text=None):
        payload = {
            "sender": {"email": self.sender_email, "name": self.sender_name},
            "to": [{"email": to}],
            "subject": subject,
            "htmlContent": html_content,
        }
        if plain_text:
            payload["textContent"] = plain_text

        # POST usando httpx ou aiohttp
        response = await self._post(payload)
        return response.status_code == 201

    async def is_healthy(self):
        # GET /v3/account para verificar API key
        ...
```

---

## Implementação: Resend

```python
class ResendEmailService(EmailService):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.resend.com/emails"

    async def send_email(self, to, subject, html_content, plain_text=None):
        payload = {
            "from": "noreply@senhas.app",
            "to": [to],
            "subject": subject,
            "html": html_content,
        }
        if plain_text:
            payload["text"] = plain_text

        response = await self._post(payload)
        return response.status_code == 200
```

---

## Template de E-mail

O template HTML é gerado por `ticket_emission.py`:

```python
def generate_ticket_email_html(
    consulente_nome: str,
    ticket_numero: int,
    gira_nome: str,
    gira_data: str,
    tenant_name: str,
    primary_color: str = "#6B46C1",
) -> str:
    """Gera HTML do email com informações da senha."""
    return f"""
    <div style="font-family: Arial; max-width: 600px; margin: 0 auto;">
        <h1 style="color: {primary_color}">Sua Senha foi Emitida!</h1>
        <p>Olá {consulente_nome},</p>
        <div style="background: {primary_color}; color: white; padding: 20px; text-align: center;">
            <h2>Senha Nº {ticket_numero}</h2>
        </div>
        <p><strong>Gira:</strong> {gira_nome}</p>
        <p><strong>Data:</strong> {gira_data}</p>
        <p><strong>Terreiro:</strong> {tenant_name}</p>
        <hr>
        <p style="font-size: 12px; color: #666;">
            E-mail enviado automaticamente pelo Sistema de Senhas.
            Guarde este e-mail como comprovante.
        </p>
    </div>
    """
```

**Versão plain-text** também é gerada para clients que não suportam HTML.

---

## Fluxo de Envio

```python
async def _send_ticket_email(ticket, consulente, gira, tenant):
    """Tenta enviar email com fallback automático."""
    html = generate_ticket_email_html(
        consulente_nome=consulente.nome,
        ticket_numero=ticket.numero,
        gira_nome=gira.nome,
        gira_data=gira.data_inicio.strftime("%d/%m/%Y %H:%M"),
        tenant_name=tenant.name,
    )

    # 1. Tenta Brevo
    try:
        brevo = BrevoEmailService(settings.BREVO_API_KEY, ...)
        if await brevo.send_email(consulente.email, subject, html):
            return "brevo"
    except Exception as e:
        logger.warning(f"Brevo failed: {e}")

    # 2. Fallback: Resend
    try:
        resend = ResendEmailService(settings.RESEND_API_KEY)
        if await resend.send_email(consulente.email, subject, html):
            return "resend"
    except Exception as e:
        logger.error(f"Resend also failed: {e}")

    # 3. Ambos falharam — ticket emitido, email pendente
    return None
```

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
