"""
Seed completo - Popula o banco com dados realistas para testar todas as interfaces.
Terreiros de Umbanda com giras, consulentes, tickets, billing, feature flags, etc.

Uso: python seed_full.py
Requer: psycopg2-binary, bcrypt
"""
import psycopg2
import bcrypt
import uuid
import random
from datetime import datetime, timezone, timedelta

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "senhas_db",
    "user": "senhas_user",
    "password": "senhas_secure_password",
}

def uid():
    return str(uuid.uuid4())

def now():
    return datetime.now(timezone.utc)

def days_ago(n):
    return now() - timedelta(days=n)

def days_from_now(n):
    return now() + timedelta(days=n)

def hash_password(pw):
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(12)).decode()

# ── Terreiros (Tenants) ────────────────────────────────────────────────
TENANTS = [
    {"slug": "ile-axe-opo-afonja",   "name": "Ilê Axé Opô Afonjá",              "desc": "Terreiro tradicional de Candomblé e Umbanda em Salvador, BA. Fundado em 1910."},
    {"slug": "tenda-espirita-caboclo-tupinamba", "name": "Tenda Espírita Caboclo Tupinambá", "desc": "Casa de Umbanda em São Gonçalo, RJ. Trabalhos de caridade desde 1952."},
    {"slug": "casa-pai-benedito",    "name": "Casa de Pai Benedito de Aruanda", "desc": "Terreiro de Umbanda Sagrada em Campinas, SP. Atendimento quinzenal."},
    {"slug": "ile-ase-iyemonja",     "name": "Ilê Asé Iyemanjá Ogunté",          "desc": "Centro de Umbanda e Candomblé em Recife, PE. Foco em desenvolvimento mediúnico."},
    {"slug": "fraternidade-oxala",   "name": "Fraternidade Espírita Oxalá",      "desc": "Terreiro em Belo Horizonte, MG. Giras abertas toda sexta-feira."},
]

# ── Nomes realistas de consulentes ─────────────────────────────────────
CONSULENTE_NOMES = [
    "Maria das Graças Silva", "José Carlos Oliveira", "Ana Paula Santos",
    "Pedro Henrique Costa", "Francisca de Souza", "Antônio Marcos Pereira",
    "Lúcia Helena Rodrigues", "Carlos Eduardo Lima", "Tereza Cristina Almeida",
    "Manoel da Silva Neto", "Rosângela Aparecida Dias", "Francisco de Assis Ferreira",
    "Sandra Regina Martins", "Sebastião Alves da Cruz", "Cláudia Maria Nascimento",
    "Raimundo Nonato Barbosa", "Eliane de Fátima Moreira", "Gilberto Santos Araújo",
    "Ivanilda Conceição Ribeiro", "Valdir José de Carvalho", "Mariana Souza Batista",
    "Edson Luiz Correia", "Jurema Aparecida Vieira", "Dalva Maria Teixeira",
    "Wellington da Silva Rocha", "Ivone de Jesus Gomes", "Roberto Carlos Mendes",
    "Aparecida de Lourdes Freitas", "Josefa Oliveira Monteiro", "Ademir Pinto de Souza",
    "Neuza Maria Gomes Cardoso", "Valnei Rodrigues Pinto", "Sônia Helena Ramos",
    "Marcos Aurélio Fernandes", "Isaura de Cássia Campos", "Benedito Luiz Moraes",
    "Cleusa Aparecida Brito", "Geraldo Magalhães Duarte", "Joselita Santos Nogueira",
    "Nilton César de Andrade", "Fátima de Cássia Lopes", "Osvaldo da Cruz Pereira",
    "Regina Célia Machado", "Adilson Gonçalves Farias", "Marilene dos Santos Rosa",
    "Luiz Fernando Tavares", "Elza Maria Cavalcanti", "Wagner Souza de Almeida",
    "Perpétua do Socorro Lima", "Severino José de Oliveira",
]

EMAILS_DOMAIN = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.br", "uol.com.br"]

def gen_email(nome):
    parts = nome.lower().split()
    first = parts[0].replace("á","a").replace("ã","a").replace("â","a").replace("é","e").replace("ê","e").replace("í","i").replace("ó","o").replace("ô","o").replace("ú","u").replace("ç","c")
    last = parts[-1].replace("á","a").replace("ã","a").replace("â","a").replace("é","e").replace("ê","e").replace("í","i").replace("ó","o").replace("ô","o").replace("ú","u").replace("ç","c")
    domain = random.choice(EMAILS_DOMAIN)
    return f"{first}.{last}{random.randint(10,99)}@{domain}"

def gen_phone():
    ddd = random.choice(["11","21","31","41","51","61","71","81","85","92"])
    return f"({ddd}) 9{random.randint(1000,9999)}-{random.randint(1000,9999)}"

def gen_cpf():
    return "".join([str(random.randint(0,9)) for _ in range(11)])

# ── Giras (por tipo de trabalho) ───────────────────────────────────────
GIRAS_TEMPLATES = [
    {"nome": "Gira de Caboclos",         "desc": "Trabalho espiritual com a linha dos Caboclos. Defumação, passes e consultas.", "local": "Salão Principal"},
    {"nome": "Gira de Pretos-Velhos",    "desc": "Sessão de atendimento com os Pretos-Velhos. Aconselhamento e cura espiritual.", "local": "Salão Principal"},
    {"nome": "Gira de Erês",             "desc": "Trabalho com a linha das crianças espirituais. Festa e limpeza de energias.", "local": "Salão Principal"},
    {"nome": "Gira de Exu e Pomba Gira", "desc": "Trabalho na linha da esquerda. Descarrego e abertura de caminhos.", "local": "Terreiro Externo"},
    {"nome": "Gira de Oxóssi",           "desc": "Sessão dedicada ao Orixá das matas. Trabalhos de prosperidade e fartura.", "local": "Salão Principal"},
    {"nome": "Gira de Desenvolvimento",  "desc": "Sessão exclusiva para médiuns em desenvolvimento mediúnico.", "local": "Sala de Estudos"},
    {"nome": "Sessão de Passes",         "desc": "Atendimento com passes magnéticos e espirituais. Aberto ao público.", "local": "Salão Principal"},
    {"nome": "Gira de Baianos",          "desc": "Trabalho com a linha dos Baianos. Axé, alegria e descarrego.", "local": "Salão Principal"},
    {"nome": "Gira de Marinheiros",      "desc": "Sessão com a linha dos Marinheiros. Limpeza espiritual e proteção em viagens.", "local": "Terreiro Externo"},
    {"nome": "Festa de Iemanjá",         "desc": "Celebração especial em homenagem à Rainha do Mar. Oferendas e cânticos.", "local": "Praia / Terreiro"},
]

# ── Planos ─────────────────────────────────────────────────────────────
PLAN_CONFIG = {
    "BASIC":      {"price": 49.90,  "max_users": 3,  "max_giras": 10},
    "PRO":        {"price": 99.90,  "max_users": 10, "max_giras": 30},
    "PREMIUM":    {"price": 199.90, "max_users": 25, "max_giras": 100},
}


def main():
    print("=" * 60)
    print("  Senhas - Seed Completo (dados realistas)")
    print("=" * 60)

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False

    try:
        cur = conn.cursor()

        # ── Verificar superadmin existe ────────────────────────────
        cur.execute("SELECT id FROM users WHERE email = 'superadmin@senhas.app'")
        sa_row = cur.fetchone()
        if not sa_row:
            print("[!] Super admin não encontrado. Rode seed_superadmin.py primeiro.")
            return
        superadmin_id = str(sa_row[0])
        print(f"[OK] Super admin encontrado: {superadmin_id}")

        all_tenant_ids = []
        all_user_ids = {}     # tenant_id -> [user_ids]
        all_gira_ids = {}     # tenant_id -> [gira_ids]
        all_consulente_ids = {}  # tenant_id -> [consulente_ids]

        consulente_idx = 0  # índice global para distribuir nomes

        for i, t_data in enumerate(TENANTS):
            print(f"\n{'─'*50}")
            print(f"  Tenant {i+1}/{len(TENANTS)}: {t_data['name']}")
            print(f"{'─'*50}")

            # ── 1. Tenant ──────────────────────────────────────────
            tenant_id = uid()
            all_tenant_ids.append(tenant_id)
            created_days_ago = random.randint(30, 180)
            tenant_created = days_ago(created_days_ago)

            cur.execute("""
                INSERT INTO tenants (id, name, slug, description, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, TRUE, %s, %s)
                ON CONFLICT (slug) DO NOTHING
            """, (tenant_id, t_data["name"], t_data["slug"], t_data["desc"], tenant_created, tenant_created))
            print(f"  [+] Tenant: {t_data['slug']}")

            # ── 2. Tenant Config ───────────────────────────────────
            colors = [
                ("#6366f1", "#ec4899"),  # indigo / pink
                ("#059669", "#f59e0b"),  # emerald / amber
                ("#2563eb", "#7c3aed"),  # blue / violet
                ("#dc2626", "#f97316"),  # red / orange
                ("#0891b2", "#6366f1"),  # cyan / indigo
            ]
            pc, sc = colors[i % len(colors)]
            config_id = uid()
            cur.execute("""
                INSERT INTO tenant_configs (id, tenant_id, primary_color, secondary_color, logo_url,
                    reply_to_email, email_signature, enable_bulk_operations, enable_analytics, enable_webhooks,
                    created_at, updated_at)
                VALUES (%s, %s, %s, %s, NULL, %s, %s, %s, %s, %s, %s, %s)
            """, (config_id, tenant_id, pc, sc,
                  f"contato@{t_data['slug']}.com.br",
                  f"Axé! Que a paz esteja com você.\n— {t_data['name']}",
                  True, True, i == 4,  # só o último tem webhooks
                  tenant_created, tenant_created))
            print(f"  [+] Config criada")

            # ── 3. Users (admin + operadores) ──────────────────────
            user_ids = []
            slug = t_data["slug"]
            admin_names = [
                (f"admin@{slug}.com.br", f"admin_{slug[:12]}", "ADMIN"),
            ]
            operator_names = [
                (f"operador1@{slug}.com.br", f"op1_{slug[:12]}", "OPERATOR"),
                (f"operador2@{slug}.com.br", f"op2_{slug[:12]}", "OPERATOR"),
            ]
            pw_hash = hash_password("senha123")

            for email, uname, role in admin_names + operator_names:
                u_id = uid()
                user_ids.append(u_id)
                cur.execute("""
                    INSERT INTO users (id, tenant_id, email, username, password_hash, role, is_active, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE, %s, %s)
                """, (u_id, tenant_id, email, uname, pw_hash, role, tenant_created, tenant_created))

            all_user_ids[tenant_id] = user_ids
            print(f"  [+] {len(user_ids)} users (1 admin + 2 operadores)")

            # ── 4. Subscription ────────────────────────────────────
            plans = ["BASIC", "PRO", "PREMIUM", "PRO", "PREMIUM"]
            plan = plans[i]
            cfg = PLAN_CONFIG[plan]
            sub_id = uid()
            is_trial = (i == 0)  # primeiro terreiro está em trial
            trial_end = days_from_now(14) if is_trial else None
            sub_status = "ACTIVE"
            if i == 3:
                sub_status = "SUSPENDED"  # 4º terreiro suspenso

            billing_start = days_ago(30)
            billing_end = days_from_now(0)

            cur.execute("""
                INSERT INTO subscriptions (id, tenant_id, plan, status, max_users, max_giras_per_month,
                    current_users, monthly_price, currency, is_trial, trial_ends_at,
                    billing_cycle_start, billing_cycle_end, auto_renew, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'BRL', %s, %s, %s, %s, %s, %s, %s)
            """, (sub_id, tenant_id, plan, sub_status, cfg["max_users"], cfg["max_giras"],
                  len(user_ids), cfg["price"], is_trial, trial_end,
                  billing_start, billing_end, True,
                  tenant_created, now()))
            print(f"  [+] Subscription: {plan} ({sub_status})" + (" [TRIAL]" if is_trial else ""))

            # ── 5. Invoices ────────────────────────────────────────
            num_invoices = random.randint(2, 5)
            for inv_i in range(num_invoices):
                inv_id = uid()
                months_ago = num_invoices - inv_i
                p_start = days_ago(months_ago * 30)
                p_end = days_ago((months_ago - 1) * 30)
                subtotal = cfg["price"]
                tax = round(subtotal * 0.05, 2)
                discount = round(subtotal * 0.1, 2) if inv_i == 0 else 0.0
                total = round(subtotal + tax - discount, 2)
                due = p_end + timedelta(days=10)

                if inv_i < num_invoices - 1:
                    inv_status = "PAID"
                    paid_at = p_end + timedelta(days=random.randint(1, 8))
                    paid_amount = total
                    payment_method = random.choice(["pix", "credit_card", "bank_transfer"])
                else:
                    # última invoice: pendente ou overdue
                    inv_status = random.choice(["SENT", "OVERDUE"])
                    paid_at = None
                    paid_amount = 0.0
                    payment_method = None

                inv_number = f"INV-{t_data['slug'][:8].upper()}-{2026}{months_ago:02d}"

                cur.execute("""
                    INSERT INTO invoices (id, tenant_id, invoice_number, period_start, period_end,
                        subtotal, tax_amount, discount_amount, total_amount, status,
                        paid_amount, payment_method, due_date, paid_at, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (inv_id, tenant_id, inv_number, p_start, p_end,
                      subtotal, tax, discount, total, inv_status,
                      paid_amount, payment_method, due, paid_at, p_start, now()))

            print(f"  [+] {num_invoices} invoices")

            # ── 6. Feature Flags ───────────────────────────────────
            feature_pool = [
                ("bulk_ticket_emission", "Permite emissão em lote de senhas"),
                ("email_notifications", "Notificações por email aos consulentes"),
                ("sms_notifications", "Notificações por SMS"),
                ("custom_branding", "Personalização visual do terreiro"),
                ("analytics_dashboard", "Painel de analytics avançado"),
                ("api_webhooks", "Integração via webhooks"),
                ("export_pdf", "Exportação de relatórios em PDF"),
                ("multi_language", "Suporte a múltiplos idiomas"),
            ]
            num_flags = random.randint(3, 6)
            chosen_flags = random.sample(feature_pool, num_flags)
            for feat, desc in chosen_flags:
                ff_id = uid()
                enabled = random.choice([True, True, True, False])  # 75% enabled
                expires = days_from_now(random.randint(30, 180)) if (not enabled and random.random() < 0.3) else None
                cur.execute("""
                    INSERT INTO feature_flags (id, tenant_id, feature, enabled, expires_at, description, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (ff_id, tenant_id, feat, enabled, expires, desc, tenant_created, now()))
            print(f"  [+] {num_flags} feature flags")

            # ── 7. Consulentes ─────────────────────────────────────
            num_consulentes = random.randint(8, 15)
            c_ids = []
            for _ in range(num_consulentes):
                c_id = uid()
                c_ids.append(c_id)
                nome = CONSULENTE_NOMES[consulente_idx % len(CONSULENTE_NOMES)]
                consulente_idx += 1
                email = gen_email(nome)
                phone = gen_phone()
                cpf = gen_cpf()
                c_created = days_ago(random.randint(7, created_days_ago))
                cur.execute("""
                    INSERT INTO consulentes (id, tenant_id, nome, email, telefone, cpf, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (c_id, tenant_id, nome, email, phone, cpf, c_created, c_created))
            all_consulente_ids[tenant_id] = c_ids
            print(f"  [+] {num_consulentes} consulentes")

            # ── 8. Giras ───────────────────────────────────────────
            num_giras = random.randint(4, 7)
            g_ids = []
            chosen_giras = random.sample(GIRAS_TEMPLATES, num_giras)
            for g_i, g_data in enumerate(chosen_giras):
                g_id = uid()
                g_ids.append(g_id)
                # Giras passadas e futuras
                if g_i < num_giras - 2:
                    # Passada
                    g_start = days_ago(random.randint(3, 60))
                    g_end = g_start + timedelta(hours=random.randint(2, 4))
                    g_active = False
                else:
                    # Futura / Ativa
                    g_start = days_from_now(random.randint(1, 30))
                    g_end = None
                    g_active = True

                cur.execute("""
                    INSERT INTO giras (id, tenant_id, nome, descricao, data_inicio, data_fim, local, is_active, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (g_id, tenant_id, g_data["nome"], g_data["desc"],
                      g_start, g_end, g_data["local"], g_active,
                      g_start - timedelta(days=7), g_start - timedelta(days=7)))
            all_gira_ids[tenant_id] = g_ids
            print(f"  [+] {num_giras} giras")

            # ── 9. SenhaControl (1 por gira) ───────────────────────
            for g_id in g_ids:
                sc_id = uid()
                prox = random.randint(1, 30)
                cur.execute("""
                    INSERT INTO senha_controls (id, tenant_id, gira_id, proximo_numero, version, total_emitido, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (sc_id, tenant_id, g_id, prox, 0, prox - 1, tenant_created, now()))
            print(f"  [+] {len(g_ids)} senha_controls")

            # ── 10. Tickets ────────────────────────────────────────
            total_tickets = 0
            statuses = ["EMITTED", "CALLED", "COMPLETED", "CANCELLED", "NO_SHOW"]
            status_weights = [0.15, 0.10, 0.50, 0.10, 0.15]

            for g_id in g_ids:
                num_tickets = random.randint(5, 20)
                for t_num in range(1, num_tickets + 1):
                    tk_id = uid()
                    c_id = random.choice(c_ids)
                    issuer_id = random.choice(user_ids)
                    status = random.choices(statuses, weights=status_weights, k=1)[0]

                    chamado_em = None
                    finalizado_em = None
                    if status in ("CALLED", "COMPLETED", "NO_SHOW"):
                        chamado_em = days_ago(random.randint(0, 30))
                    if status in ("COMPLETED", "NO_SHOW"):
                        finalizado_em = chamado_em + timedelta(minutes=random.randint(10, 45)) if chamado_em else None

                    obs = None
                    if status == "CANCELLED":
                        obs = random.choice([
                            "Consulente não pôde comparecer",
                            "Solicitou cancelamento por telefone",
                            "Duplicidade de senha",
                        ])
                    elif status == "NO_SHOW":
                        obs = "Não compareceu à gira"

                    tk_created = days_ago(random.randint(0, 45))
                    cur.execute("""
                        INSERT INTO tickets (id, tenant_id, gira_id, consulente_id, emitido_por_id,
                            numero, status, chamado_em, finalizado_em, observacoes, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (tk_id, tenant_id, g_id, c_id, issuer_id,
                          t_num, status, chamado_em, finalizado_em, obs,
                          tk_created, tk_created))
                    total_tickets += 1

            print(f"  [+] {total_tickets} tickets")

            # ── 11. Audit Logs ─────────────────────────────────────
            audit_actions = ["CREATE", "READ", "UPDATE", "DELETE", "LOGIN", "LOGOUT"]
            resource_types = ["Ticket", "Gira", "Consulente", "User", "TenantConfig"]
            num_logs = random.randint(15, 40)
            for _ in range(num_logs):
                al_id = uid()
                action = random.choice(audit_actions)
                res_type = random.choice(resource_types)
                res_id = random.choice(c_ids + g_ids + user_ids) if random.random() > 0.2 else None
                u_id = random.choice(user_ids)
                details = None
                if action == "CREATE":
                    details = '{"source": "admin_dashboard"}'
                elif action == "UPDATE":
                    details = '{"fields_changed": ["status", "nome"]}'
                elif action == "LOGIN":
                    details = '{"ip": "192.168.1.' + str(random.randint(1,254)) + '"}'

                log_created = days_ago(random.randint(0, created_days_ago))
                cur.execute("""
                    INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s::json, %s, %s)
                """, (al_id, tenant_id, u_id, action, res_type, res_id, details, log_created, log_created))
            print(f"  [+] {num_logs} audit logs")

        # ── Platform-level audit logs (tenant_id = NULL) ───────────
        print(f"\n{'─'*50}")
        print(f"  Platform audit logs (cross-tenant)")
        print(f"{'─'*50}")
        platform_actions = ["CREATE", "UPDATE", "DELETE", "LOGIN"]
        for _ in range(20):
            al_id = uid()
            action = random.choice(platform_actions)
            res_type = random.choice(["Tenant", "User", "Subscription", "FeatureFlag"])
            res_id = random.choice(all_tenant_ids) if random.random() > 0.3 else None
            details = '{"actor": "superadmin", "context": "platform_management"}'
            log_created = days_ago(random.randint(0, 90))
            cur.execute("""
                INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, created_at, updated_at)
                VALUES (%s, NULL, %s, %s, %s, %s, %s::json, %s, %s)
            """, (al_id, superadmin_id, action, res_type, res_id, details, log_created, log_created))
        print(f"  [+] 20 platform audit logs")

        conn.commit()

        # ── Resumo ─────────────────────────────────────────────────
        print(f"\n{'='*60}")
        print(f"  SEED COMPLETO!")
        print(f"{'='*60}")
        print(f"  Tenants:        {len(TENANTS)}")
        print(f"  Users/tenant:   3 (1 admin + 2 operadores)")
        print(f"  Total users:    {len(TENANTS) * 3} + 1 superadmin")
        print(f"  Planos:         BASIC, PRO, PREMIUM, PRO, PREMIUM")
        print(f"")
        print(f"  Credenciais de teste:")
        print(f"    Super Admin:  superadmin@senhas.app / superadmin123")
        print(f"    Admin tenant: admin@<slug>.com.br / senha123")
        print(f"    Operador:     operador1@<slug>.com.br / senha123")
        print(f"")
        print(f"  Slugs dos terreiros:")
        for t in TENANTS:
            print(f"    - {t['slug']}")
        print(f"{'='*60}")

    except Exception as e:
        conn.rollback()
        print(f"\n[ERRO] Seed falhou: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
