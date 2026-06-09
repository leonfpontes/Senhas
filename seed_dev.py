"""
seed_dev.py — Seed de desenvolvimento com dados realistas.

Cria 3 tenants com 3+ meses de histórico cobrindo TODOS os módulos:
  - Giras passadas e futuras
  - Tickets (todos os status + priority_category + walk-in + sponsor + door control)
  - Médiuns + mensalidade (config, pagamentos, pendentes, isentos)
  - Associados
  - Estoque (grupos, itens, movimentações)
  - Invoices (pagas, em aberto, vencidas)
  - Feature flags
  - Audit logs (tenant + platform)

ATENÇÃO: só roda contra localhost (127.0.0.1 / localhost).
Pré-requisito: python seed_superadmin.py já executado.
"""

import sys
import random
import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal

import psycopg2
import bcrypt

import os

# ─── Guard: apenas localhost ─────────────────────────────────────────────────
DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": int(os.environ.get("DB_PORT", 5432)),
    "dbname": os.environ.get("DB_NAME", "senhas_db"),
    "user": os.environ.get("DB_USER", "senhas_user"),
    "password": os.environ.get("DB_PASSWORD", "changeme"),
}

if DB_CONFIG["host"] not in ("localhost", "127.0.0.1"):
    print("[ABORT] Este seed só pode rodar em localhost.")
    sys.exit(1)

random.seed(42)  # reproducível


# ─── Helpers ─────────────────────────────────────────────────────────────────

def uid() -> str:
    return str(uuid.uuid4())

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

def days_ago(n: int) -> datetime:
    return utcnow() - timedelta(days=n)

def days_from_now(n: int) -> datetime:
    return utcnow() + timedelta(days=n)

def months_ago(n: int) -> datetime:
    return utcnow() - timedelta(days=n * 30)

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(12)).decode()

def norm_email(email: str) -> str:
    return email.strip().lower()

ACCENT_MAP = str.maketrans({
    'á':'a','à':'a','ã':'a','â':'a','ä':'a',
    'é':'e','è':'e','ê':'e','ë':'e',
    'í':'i','ì':'i','î':'i','ï':'i',
    'ó':'o','ò':'o','õ':'o','ô':'o','ö':'o',
    'ú':'u','ù':'u','û':'u','ü':'u','ç':'c',
    'Á':'A','À':'A','Ã':'A','Â':'A','Ä':'A',
    'É':'E','È':'E','Ê':'E','Ë':'E',
    'Í':'I','Ì':'I','Î':'I','Ï':'I',
    'Ó':'O','Ò':'O','Õ':'O','Ô':'O','Ö':'O',
    'Ú':'U','Ù':'U','Û':'U','Ü':'U','Ç':'C',
})

def slugify(text: str) -> str:
    return text.lower().translate(ACCENT_MAP).replace(" ", "_").replace("-", "_")

def gen_phone() -> str:
    ddd = random.choice(["11","21","31","41","51","61","71","81","85","92"])
    return f"({ddd}) 9{random.randint(1000,9999)}-{random.randint(1000,9999)}"

def gen_email(nome: str) -> str:
    parts = nome.lower().translate(ACCENT_MAP).split()
    domain = random.choice(["gmail.com","hotmail.com","outlook.com","yahoo.com.br"])
    return f"{parts[0]}.{parts[-1]}{random.randint(10,99)}@{domain}"

def gen_cpf() -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(11))

def date_obj(dt: datetime) -> date:
    return dt.date()


# ─── Dados base ───────────────────────────────────────────────────────────────

TENANTS_DEF = [
    {
        "slug": "terreiro-caboclo-tupinamba",
        "name": "Tenda Espírita Caboclo Tupinambá",
        "desc": "Casa de Umbanda em São Gonçalo, RJ. Trabalhos de caridade desde 1952.",
        "primary_color": "#2563eb",
        "secondary_color": "#7c3aed",
        "endereco": "Rua das Acácias, 120 — São Gonçalo, RJ",
        "plan": "PRO",
        "created_days_ago": 120,
        "status": "active",
    },
    {
        "slug": "ile-axe-opo-afonja",
        "name": "Ilê Axé Opô Afonjá",
        "desc": "Terreiro tradicional de Candomblé e Umbanda em Salvador, BA. Fundado em 1910.",
        "primary_color": "#059669",
        "secondary_color": "#f59e0b",
        "endereco": "Ladeira do Gantois, 23 — Salvador, BA",
        "plan": "PREMIUM",
        "created_days_ago": 180,
        "status": "active",
    },
    {
        "slug": "fraternidade-espirita-oxala",
        "name": "Fraternidade Espírita Oxalá",
        "desc": "Terreiro em Belo Horizonte, MG. Giras abertas toda sexta-feira.",
        "primary_color": "#7c3aed",
        "secondary_color": "#ec4899",
        "endereco": "Av. Silviano Brandão, 450 — Belo Horizonte, MG",
        "plan": "BASIC",
        "created_days_ago": 90,
        "status": "active",
    },
]

PLAN_CONFIG = {
    "BASIC":   {"price": 49.90,  "max_users": 3,  "max_giras": 10,  "max_mediuns": 20},
    "PRO":     {"price": 99.90,  "max_users": 10, "max_giras": 30,  "max_mediuns": 100},
    "PREMIUM": {"price": 199.90, "max_users": 25, "max_giras": 100, "max_mediuns": 500},
}

NOMES_CONSULENTES = [
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
    "Perpétua do Socorro Lima", "Severino José de Oliveira", "Benedita Cruz Ferreira",
    "Antonieta Lima dos Santos", "Manoel Ferreira da Costa", "Zilda de Oliveira Pinto",
    "Amaro José da Silva", "Bernadete Rodrigues Lemos", "Cícero Alves Nogueira",
    "Divina de Fátima Moreira", "Evaristo dos Reis Cardoso", "Firmina Gomes Tavares",
]

NOMES_MEDIUNS = [
    "Pai Benedito", "Mãe Iracema", "Irmão João da Luz", "Mãe Joana da Cruz",
    "Irmão Pedro Alves", "Mãe Luzia dos Anjos", "Irmão Sebastião Luz",
    "Pai Raimundo", "Irmã Teresa do Carmo", "Irmão Carlos Mendes",
    "Mãe Valdete Ferreira", "Irmão Nilton Souza", "Mãe Rosaura Lima",
    "Irmão Antônio de Fátima", "Mãe Dalva Santos", "Irmão Geraldo Cruz",
    "Mãe Ivone Almeida", "Irmão Wagner de Assis", "Mãe Cleusa Rocha",
    "Irmão Adilson Marques",
]

GIRAS_TEMPLATES = [
    ("Gira de Caboclos",          "Trabalho espiritual com a linha dos Caboclos. Defumação, passes e consultas."),
    ("Gira de Pretos-Velhos",     "Sessão de atendimento com os Pretos-Velhos. Aconselhamento e cura espiritual."),
    ("Gira de Erês",              "Trabalho com a linha das crianças espirituais. Festa e limpeza de energias."),
    ("Gira de Exu e Pomba Gira",  "Trabalho na linha da esquerda. Descarrego e abertura de caminhos."),
    ("Gira de Desenvolvimento",   "Sessão exclusiva para médiuns em desenvolvimento mediúnico."),
    ("Sessão de Passes",          "Atendimento com passes magnéticos e espirituais. Aberto ao público."),
    ("Gira de Baianos",           "Trabalho com a linha dos Baianos. Axé, alegria e descarrego."),
    ("Gira de Oxóssi",            "Sessão dedicada ao Orixá das matas. Trabalhos de prosperidade e fartura."),
    ("Gira de Marinheiros",       "Sessão com a linha dos Marinheiros. Limpeza espiritual e proteção em viagens."),
    ("Festa de Iemanjá",          "Celebração especial em homenagem à Rainha do Mar. Oferendas e cânticos."),
    ("Gira de Xangô",             "Trabalho com o Orixá da Justiça. Equilíbrio e resolução de conflitos."),
    ("Gira de Ogum",              "Sessão com o Orixá dos Caminhos. Limpeza de obstáculos e proteção."),
]

PRIORITY_CATEGORIES = [None, None, None, None, "ELDERLY", "DISABILITY_OR_AUTISM",
                        "PREGNANT_LACTATING_OR_INFANT", "REDUCED_MOBILITY"]  # ~50% sem categoria

ESTOQUE_GRUPOS = [
    ("Velas e Incensos",    "Materiais de iluminação e perfumação para os trabalhos"),
    ("Ervas e Raízes",       "Plantas medicinais e sagradas utilizadas nos rituais"),
    ("Bebidas e Comidas",    "Alimentos e bebidas para as giras e oferendas"),
    ("Tecidos e Indumentária", "Roupas, ornamentos e tecidos para os trabalhos"),
    ("Utensílios Gerais",   "Materiais de uso geral do terreiro"),
]

ESTOQUE_ITENS = {
    "Velas e Incensos": [
        ("Vela Branca 7 dias",   "UN", 5,  3.50),
        ("Vela Vermelha",        "UN", 10, 2.00),
        ("Vela Preta",           "UN", 10, 2.00),
        ("Incenso Mirra",        "CX", 2,  8.90),
        ("Incenso Sândalo",      "CX", 2,  8.90),
        ("Defumador Guiné",      "PC", 3,  12.00),
    ],
    "Ervas e Raízes": [
        ("Arruda",               "MÇ", 5,  4.00),
        ("Guiné",                "MÇ", 5,  4.00),
        ("Espada de São Jorge",  "UN", 3,  15.00),
        ("Jurema Preta",         "PC", 2,  18.00),
        ("Alfazema",             "PC", 2,  9.00),
    ],
    "Bebidas e Comidas": [
        ("Cachaça Prata 1L",     "UN", 6,  12.00),
        ("Vinho Tinto 750ml",    "UN", 4,  22.00),
        ("Mel Puro 500g",        "FR", 3,  18.00),
        ("Farofa de Dendê 1kg",  "PC", 5,  8.00),
        ("Azeite de Dendê 500ml","FR", 3,  15.00),
    ],
    "Tecidos e Indumentária": [
        ("Tecido Branco 1m",     "MT", 10, 12.00),
        ("Fita Vermelha",        "RL", 5,  6.00),
        ("Guia de Contas Branca","UN", 5,  25.00),
        ("Pareo Estampado",      "UN", 3,  45.00),
    ],
    "Utensílios Gerais": [
        ("Vassoura de Palha",    "UN", 3,  28.00),
        ("Quartinha de Barro",   "UN", 5,  22.00),
        ("Pilão de Madeira",     "UN", 2,  85.00),
        ("Bacia de Louça",       "UN", 3,  35.00),
        ("Vaso Cerâmica Grande", "UN", 2,  65.00),
    ],
}

ASSOCIADO_NOMES = [
    "Cosme Ferreira Leal", "Damião Souza Lima", "Aparecida dos Anjos Melo",
    "Antônia Rosa da Paz", "Inácio Borges de Castro", "Filomena Cruz Santos",
    "Hermínio Alves Gama", "Madalena Torres Vieira", "Onofre Silva Braga",
    "Ângela Pinto Moura", "Crisanto Lopes Barros", "Eulália Freitas Cunha",
    "Hilário Tavares Dias", "Jacinta Mendes Farias", "Ladislau Costa Neves",
]


# ─── Seed principal ───────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("  Senhas — seed_dev.py  (3 tenants × 3 meses de histórico)")
    print("=" * 65)

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False

    try:
        cur = conn.cursor()

        # Verificar superadmin
        cur.execute("SELECT id FROM users WHERE email = 'superadmin@senhas.app'")
        row = cur.fetchone()
        if not row:
            print("[ABORT] Superadmin não encontrado. Rode seed_superadmin.py primeiro.")
            conn.close()
            sys.exit(1)
        superadmin_id = str(row[0])

        # Verificar conflito de slugs
        for td in TENANTS_DEF:
            cur.execute("SELECT id FROM tenants WHERE slug = %s", (td["slug"],))
            if cur.fetchone():
                print(f"[ABORT] Tenant '{td['slug']}' já existe. Limpe o banco antes de re-seedar.")
                conn.close()
                sys.exit(1)

        all_tenant_ids: list[str] = []
        pw_hash = hash_pw("senha123")
        c_idx = 0  # índice global para nomes de consulentes

        for t_def in TENANTS_DEF:
            slug         = t_def["slug"]
            plan         = t_def["plan"]
            pcfg         = PLAN_CONFIG[plan]
            t_created    = days_ago(t_def["created_days_ago"])
            tenant_id    = uid()
            all_tenant_ids.append(tenant_id)

            print(f"\n{'─'*65}")
            print(f"  Tenant: {t_def['name']}  [{plan}]")
            print(f"{'─'*65}")

            # ── 1. Tenant ─────────────────────────────────────────────────
            cur.execute("""
                INSERT INTO tenants (id, name, slug, description, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, TRUE, %s, %s)
            """, (tenant_id, t_def["name"], slug, t_def["desc"], t_created, t_created))
            print(f"  [+] tenant")

            # ── 2. TenantConfig ────────────────────────────────────────────
            enable_walk_in  = plan in ("PRO", "PREMIUM")
            enable_estoque  = plan in ("PRO", "PREMIUM")
            enable_mens_assoc = plan == "PREMIUM"
            cur.execute("""
                INSERT INTO tenant_configs (
                    id, tenant_id, primary_color, secondary_color,
                    reply_to_email, email_signature, endereco,
                    enable_bulk_operations, enable_analytics,
                    enable_walk_in, enable_estoque_log, enable_mensalidade_associado,
                    validate_associado_on_emit,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                uid(), tenant_id,
                t_def["primary_color"], t_def["secondary_color"],
                f"contato@{slug}.com.br",
                f"Axé! Que a paz esteja com você.\n— {t_def['name']}",
                t_def["endereco"],
                True, True,
                enable_walk_in, enable_estoque, enable_mens_assoc,
                plan == "PREMIUM",
                t_created, t_created,
            ))
            print(f"  [+] tenant_config")

            # ── 3. Users ───────────────────────────────────────────────────
            admin_id = uid()
            op1_id   = uid()
            op2_id   = uid()
            user_ids = [admin_id, op1_id, op2_id]

            cur.execute("""
                INSERT INTO users (id, tenant_id, email, username, password_hash, role, is_active, created_at, updated_at)
                VALUES (%s,%s,%s,%s,%s,'admin',TRUE,%s,%s)
            """, (admin_id, tenant_id, f"admin@{slug}.com.br", f"admin_{slug[:14]}", pw_hash, t_created, t_created))

            for i, (op_id, op_num) in enumerate([(op1_id, 1), (op2_id, 2)]):
                cur.execute("""
                    INSERT INTO users (id, tenant_id, email, username, password_hash, role, is_active, created_at, updated_at)
                    VALUES (%s,%s,%s,%s,%s,'operator',TRUE,%s,%s)
                """, (op_id, tenant_id, f"op{op_num}@{slug}.com.br", f"op{op_num}_{slug[:12]}", pw_hash, t_created, t_created))
            print(f"  [+] 3 users  (admin + 2 operadores)")

            # ── 4. Subscription ────────────────────────────────────────────
            sub_id = uid()
            cur.execute("""
                INSERT INTO subscriptions (
                    id, tenant_id, plan, status, max_users, max_giras_per_month,
                    max_mediuns, current_users, monthly_price, currency,
                    is_trial, billing_cycle_start, billing_cycle_end,
                    auto_renew, created_at, updated_at
                ) VALUES (%s,%s,%s,'active',%s,%s,%s,%s,%s,'BRL',FALSE,%s,%s,TRUE,%s,%s)
            """, (
                sub_id, tenant_id, plan,
                pcfg["max_users"], pcfg["max_giras"], pcfg["max_mediuns"],
                len(user_ids), pcfg["price"],
                days_ago(30), days_from_now(0),
                t_created, utcnow(),
            ))
            print(f"  [+] subscription: {plan}")

            # ── 5. Invoices — 4 meses de histórico ────────────────────────
            inv_count = 0
            for m in range(4, 0, -1):
                inv_id    = uid()
                p_start   = months_ago(m)
                p_end     = months_ago(m - 1)
                subtotal  = pcfg["price"]
                tax       = round(subtotal * 0.05, 2)
                discount  = round(subtotal * 0.10, 2) if m == 4 else 0.0
                total     = round(subtotal + tax - discount, 2)
                due       = p_end + timedelta(days=10)
                if m > 1:
                    status     = "paid"
                    paid_at    = p_end + timedelta(days=random.randint(1, 7))
                    paid_amt   = total
                    pay_method = random.choice(["pix", "credit_card"])
                else:
                    status     = random.choice(["draft", "sent"])
                    paid_at    = None
                    paid_amt   = 0.0
                    pay_method = None
                inv_num = f"INV-{slug[:8].upper()}-{p_start.year}{p_start.month:02d}"
                cur.execute("""
                    INSERT INTO invoices (
                        id, tenant_id, invoice_number, period_start, period_end,
                        subtotal, tax_amount, discount_amount, total_amount, status,
                        paid_amount, payment_method, due_date, paid_at, created_at, updated_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (
                    inv_id, tenant_id, inv_num, p_start, p_end,
                    subtotal, tax, discount, total, status,
                    paid_amt, pay_method, due, paid_at, p_start, utcnow(),
                ))
                inv_count += 1
            print(f"  [+] {inv_count} invoices (3 pagas + 1 em aberto)")

            # ── 6. Feature Flags ───────────────────────────────────────────
            flags = [
                ("email_notifications", True),
                ("analytics_dashboard", True),
                ("custom_branding",      True),
                ("export_pdf",           plan in ("PRO", "PREMIUM")),
                ("bulk_ticket_emission", plan in ("PRO", "PREMIUM")),
                ("api_webhooks",         plan == "PREMIUM"),
            ]
            for feat, enabled in flags:
                cur.execute("""
                    INSERT INTO feature_flags (id, tenant_id, feature, enabled, description, created_at, updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)
                """, (uid(), tenant_id, feat, enabled, feat.replace("_", " ").title(), t_created, utcnow()))
            print(f"  [+] {len(flags)} feature flags")

            # ── 7. Consulentes ─────────────────────────────────────────────
            num_cons = 20 if plan == "PREMIUM" else (15 if plan == "PRO" else 10)
            c_ids: list[str] = []
            c_emails: list[str] = []
            for _ in range(num_cons):
                c_id   = uid()
                nome   = NOMES_CONSULENTES[c_idx % len(NOMES_CONSULENTES)]
                c_idx += 1
                email  = gen_email(nome)
                phone  = gen_phone()
                c_created = days_ago(random.randint(5, t_def["created_days_ago"]))
                cur.execute("""
                    INSERT INTO consulentes (id, tenant_id, nome, email, telefone, cpf, created_at, updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """, (c_id, tenant_id, nome, email, phone, gen_cpf(), c_created, c_created))
                c_ids.append(c_id)
                c_emails.append(email)
            print(f"  [+] {num_cons} consulentes")

            # ── 8. Associados (PREMIUM valida email) ───────────────────────
            num_assoc = 8 if plan == "PREMIUM" else (5 if plan == "PRO" else 0)
            assoc_emails: list[str] = []
            for ai in range(num_assoc):
                nome  = ASSOCIADO_NOMES[ai % len(ASSOCIADO_NOMES)]
                email = c_emails[ai] if ai < len(c_emails) else gen_email(nome)
                assoc_emails.append(email)
                isento = (ai % 5 == 0)  # 1 em 5 é isento
                cur.execute("""
                    INSERT INTO associados (id, tenant_id, nome, email, email_normalized, telefone, mensalidade_isento, created_at, updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (uid(), tenant_id, nome, email, norm_email(email), gen_phone(), isento, t_created, utcnow()))
            if num_assoc:
                print(f"  [+] {num_assoc} associados")

            # ── 9. Médiuns ─────────────────────────────────────────────────
            num_mediuns = 12 if plan == "PREMIUM" else (8 if plan == "PRO" else 5)
            m_ids: list[str] = []
            m_names: list[str] = []
            for mi in range(num_mediuns):
                m_id   = uid()
                nome   = NOMES_MEDIUNS[mi % len(NOMES_MEDIUNS)]
                is_ate = (mi % 3 != 0)      # 2/3 são médiuns de atendimento
                isento = (mi % 4 == 0)      # 1 em 4 é isento de mensalidade
                bday   = date(
                    random.randint(1955, 2000),
                    random.randint(1, 12),
                    random.randint(1, 28)
                )
                cur.execute("""
                    INSERT INTO mediuns (
                        id, tenant_id, nome, is_atendimento, is_active,
                        mensalidade_isento, telefone, email, data_nascimento,
                        cidade, created_at, updated_at
                    ) VALUES (%s,%s,%s,%s,TRUE,%s,%s,%s,%s,%s,%s,%s)
                """, (
                    m_id, tenant_id, nome, is_ate,
                    isento, gen_phone(), gen_email(nome.replace("Pai ","").replace("Mãe ","").replace("Irmão ","").replace("Irmã ","")),
                    bday,
                    random.choice(["São Gonçalo","Salvador","Belo Horizonte","Campinas","São Paulo"]),
                    t_created, utcnow(),
                ))
                m_ids.append(m_id)
                m_names.append(nome)
            print(f"  [+] {num_mediuns} médiuns")

            # ── 10. MensalidadeConfig + Pagamentos ─────────────────────────
            if plan in ("PRO", "PREMIUM"):
                valor_mensal = Decimal("50.00") if plan == "PRO" else Decimal("80.00")
                cur.execute("""
                    INSERT INTO mensalidade_configs (
                        id, tenant_id, valor_mensal, dia_vencimento, ativo,
                        email_relatorio_ativo, valor_mensal_associado, dia_vencimento_associado,
                        created_at, updated_at
                    ) VALUES (%s,%s,%s,10,TRUE,FALSE,%s,10,%s,%s)
                """, (uid(), tenant_id, valor_mensal, valor_mensal * Decimal("0.5"), t_created, utcnow()))

                # Pagamentos dos últimos 3 meses para cada médium
                pay_count = 0
                for m_id in m_ids:
                    # Verificar se o médium é isento
                    cur.execute("SELECT mensalidade_isento FROM mediuns WHERE id = %s", (m_id,))
                    (isento,) = cur.fetchone()
                    if isento:
                        # Isento: cria registro ISENTO para o mês atual
                        mes_ref = date(utcnow().year, utcnow().month, 1)
                        cur.execute("""
                            INSERT INTO mensalidade_pagamentos (
                                id, tenant_id, mediun_id, mes_referencia,
                                status, created_at, updated_at
                            ) VALUES (%s,%s,%s,%s,'ISENTO',%s,%s)
                        """, (uid(), tenant_id, m_id, mes_ref, utcnow(), utcnow()))
                        pay_count += 1
                        continue
                    for months_back in range(3, 0, -1):
                        ref_dt  = utcnow() - timedelta(days=months_back * 30)
                        mes_ref = date(ref_dt.year, ref_dt.month, 1)
                        # Situações: pago, pendente, ou registra nada (sem histórico)
                        roll = random.random()
                        if roll < 0.70:
                            status   = "PAGO"
                            pago_em  = ref_dt + timedelta(days=random.randint(1, 9))
                        elif roll < 0.85:
                            status   = "PENDENTE"
                            pago_em  = None
                        else:
                            continue  # sem registro — será calculado como pendente no sistema
                        cur.execute("""
                            INSERT INTO mensalidade_pagamentos (
                                id, tenant_id, mediun_id, mes_referencia,
                                status, valor_pago, data_pagamento, created_at, updated_at
                            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        """, (
                            uid(), tenant_id, m_id, mes_ref,
                            status,
                            float(valor_mensal) if status == "PAGO" else None,
                            pago_em, utcnow(), utcnow(),
                        ))
                        pay_count += 1
                print(f"  [+] mensalidade_config + {pay_count} pagamentos")

            # ── 11. Estoque (PRO+) ─────────────────────────────────────────
            if enable_estoque:
                grupo_ids: dict[str, str] = {}
                item_ids:  list[str]      = []
                for gn, gd in ESTOQUE_GRUPOS:
                    g_id = uid()
                    grupo_ids[gn] = g_id
                    cur.execute("""
                        INSERT INTO estoque_grupos (id, tenant_id, nome, descricao, created_at, updated_at)
                        VALUES (%s,%s,%s,%s,%s,%s)
                    """, (g_id, tenant_id, gn, gd, t_created, utcnow()))

                total_itens = 0
                total_movs  = 0
                for gn, itens in ESTOQUE_ITENS.items():
                    g_id = grupo_ids[gn]
                    for (nome_item, unidade, estoque_min, custo) in itens:
                        i_id = uid()
                        item_ids.append(i_id)
                        cur.execute("""
                            INSERT INTO estoque_itens (
                                id, tenant_id, grupo_id, nome, unidade_medida,
                                estoque_minimo, custo_unitario, created_at, updated_at
                            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        """, (i_id, tenant_id, g_id, nome_item, unidade, estoque_min, custo, t_created, utcnow()))
                        total_itens += 1

                        # Movimentações: 2-4 entradas + 1-3 saídas ao longo de 3 meses
                        for e in range(random.randint(2, 4)):
                            mv_date = days_ago(random.randint(1, 90))
                            cur.execute("""
                                INSERT INTO estoque_movimentacoes (
                                    id, tenant_id, item_id, usuario_id,
                                    tipo, quantidade, motivo, data_movimentacao, created_at, updated_at
                                ) VALUES (%s,%s,%s,%s,'entrada',%s,%s,%s,%s,%s)
                            """, (
                                uid(), tenant_id, i_id, random.choice(user_ids),
                                random.randint(5, 30),
                                random.choice(["Compra mensal", "Doação recebida", "Reposição de estoque"]),
                                mv_date, utcnow(), utcnow(),
                            ))
                            total_movs += 1

                        for s in range(random.randint(1, 3)):
                            mv_date = days_ago(random.randint(1, 60))
                            cur.execute("""
                                INSERT INTO estoque_movimentacoes (
                                    id, tenant_id, item_id, usuario_id,
                                    tipo, quantidade, motivo, data_movimentacao, created_at, updated_at
                                ) VALUES (%s,%s,%s,%s,'saida',%s,%s,%s,%s,%s)
                            """, (
                                uid(), tenant_id, i_id, random.choice(user_ids),
                                random.randint(1, 5),
                                random.choice(["Uso na gira", "Distribuição para médiuns", "Consumo ritual"]),
                                mv_date, utcnow(), utcnow(),
                            ))
                            total_movs += 1

                print(f"  [+] estoque: {len(ESTOQUE_GRUPOS)} grupos, {total_itens} itens, {total_movs} movimentações")

            # ── 12. Giras — 3 meses de histórico + 2 futuras ──────────────
            # Distribuição: ~10 giras passadas cobrindo ~3 meses + 2 futuras
            gira_schedule = []
            # Passadas: 1 por semana nos últimos 90 dias
            for week in range(12, 0, -1):
                days_offset = week * 7 + random.randint(0, 3)
                g_nome, g_desc = random.choice(GIRAS_TEMPLATES)
                g_start  = days_ago(days_offset)
                g_start  = g_start.replace(hour=19, minute=0, second=0, microsecond=0)
                g_end    = g_start + timedelta(hours=random.randint(2, 4))
                gira_schedule.append((g_nome, g_desc, g_start, g_end, False))

            # Futuras
            for fw in [7, 21]:
                g_nome, g_desc = random.choice(GIRAS_TEMPLATES)
                g_start = days_from_now(fw).replace(hour=19, minute=0, second=0, microsecond=0)
                gira_schedule.append((g_nome, g_desc, g_start, None, True))

            g_ids: list[str]  = []
            g_dates: list[datetime] = []
            for (g_nome, g_desc, g_start, g_end, is_active) in gira_schedule:
                g_id = uid()
                g_ids.append(g_id)
                g_dates.append(g_start)
                max_tix = random.choice([None, 30, 50, 80])
                cur.execute("""
                    INSERT INTO giras (
                        id, tenant_id, nome, descricao, data_inicio, data_fim,
                        is_active, max_tickets, created_at, updated_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (
                    g_id, tenant_id, g_nome, g_desc, g_start, g_end,
                    is_active, max_tix,
                    g_start - timedelta(days=7), g_start - timedelta(days=7),
                ))
            print(f"  [+] {len(g_ids)} giras  (12 passadas + 2 futuras)")

            # ── 13. SenhaControls ──────────────────────────────────────────
            for g_id in g_ids:
                prox = random.randint(1, 5)
                cur.execute("""
                    INSERT INTO senha_controls (
                        id, tenant_id, gira_id, proximo_numero, version,
                        total_emitido, slots_returned, created_at, updated_at
                    ) VALUES (%s,%s,%s,%s,0,%s,0,%s,%s)
                """, (uid(), tenant_id, g_id, prox, prox - 1, t_created, utcnow()))

            # ── 14. Tickets ────────────────────────────────────────────────
            total_tickets = 0
            # Pesos por status: completado mais comum, emitidos apenas em giras ativas
            for gi, (g_id, g_start) in enumerate(zip(g_ids, g_dates)):
                is_past   = (g_start < utcnow())
                num_tix   = random.randint(8, 25) if is_past else random.randint(1, 5)
                is_active_gira = not is_past

                for t_num in range(1, num_tix + 1):
                    c_id      = random.choice(c_ids)
                    issuer_id = random.choice(user_ids + [None, None])  # alguns sem issuer

                    if is_past:
                        status = random.choices(
                            ["emitted","called","completed","cancelled","no_show"],
                            weights=[0.05, 0.05, 0.65, 0.10, 0.15], k=1
                        )[0]
                    else:
                        status = random.choices(
                            ["emitted","cancelled"],
                            weights=[0.90, 0.10], k=1
                        )[0]

                    # Door control: chamado_em / finalizado_em
                    chamado_em    = None
                    finalizado_em = None
                    checkin_em    = None
                    atendido_em   = None
                    medium_nome   = None
                    cambone_nome  = None

                    if status in ("called", "completed", "no_show") and is_past:
                        chamado_em = g_start + timedelta(minutes=random.randint(30, 180))
                    if status in ("completed", "no_show") and chamado_em:
                        finalizado_em = chamado_em + timedelta(minutes=random.randint(10, 45))
                    if status == "completed" and chamado_em and m_ids:
                        checkin_em  = chamado_em - timedelta(minutes=random.randint(5, 20))
                        atendido_em = chamado_em + timedelta(minutes=random.randint(2, 8))
                        medium_nome  = random.choice(m_names) if m_names else None
                        cambone_nome = random.choice(m_names) if len(m_names) > 1 else None

                    # Priority category e flags
                    priority = random.choice(PRIORITY_CATEGORIES)
                    is_walkin   = (not is_past) and (random.random() < 0.15) and enable_walk_in
                    is_sponsor  = random.random() < 0.08

                    obs = None
                    if status == "cancelled":
                        obs = random.choice([
                            "Consulente não pôde comparecer",
                            "Solicitou cancelamento",
                            "Duplicidade",
                        ])
                    elif status == "no_show":
                        obs = "Não compareceu à gira"
                    elif status == "completed" and random.random() < 0.2:
                        obs = random.choice([
                            "Atendimento tranquilo",
                            "Necessita retorno na próxima gira",
                            "Trabalho realizado com sucesso",
                        ])

                    tk_created = g_start - timedelta(days=random.randint(0, 3))

                    cur.execute("""
                        INSERT INTO tickets (
                            id, tenant_id, gira_id, consulente_id, emitido_por_id,
                            numero, status, chamado_em, finalizado_em, observacoes,
                            is_walk_in, is_sponsor, priority_category,
                            checkin_em, atendido_em, medium_nome, cambone_nome,
                            created_at, updated_at
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (
                        uid(), tenant_id, g_id, c_id, issuer_id,
                        t_num, status, chamado_em, finalizado_em, obs,
                        is_walkin, is_sponsor, priority,
                        checkin_em, atendido_em, medium_nome, cambone_nome,
                        tk_created, tk_created,
                    ))
                    total_tickets += 1

            print(f"  [+] {total_tickets} tickets  (priority, walk-in, sponsor, door control)")

            # ── 15. Audit Logs ─────────────────────────────────────────────
            audit_rows = [
                ("login",   "User",       admin_id,  admin_id),
                ("create",  "Gira",       random.choice(g_ids), admin_id),
                ("update",  "TenantConfig", tenant_id, admin_id),
                ("login",   "User",       op1_id,    op1_id),
                ("create",  "Ticket",     random.choice(c_ids), op1_id),
                ("read",    "Ticket",     random.choice(c_ids), op2_id),
                ("update",  "Ticket",     random.choice(c_ids), admin_id),
                ("delete",  "Ticket",     random.choice(c_ids), admin_id),
                ("logout",  "User",       op2_id,    op2_id),
                ("create",  "Consulente", random.choice(c_ids), op1_id),
            ]
            for (action, res_type, res_id, u_id) in audit_rows:
                log_date = days_ago(random.randint(0, 90))
                cur.execute("""
                    INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s::json,%s)
                """, (
                    uid(), tenant_id, u_id, action, res_type, res_id,
                    '{"source": "admin_dashboard"}', log_date,
                ))
            print(f"  [+] {len(audit_rows)} audit logs")

        # ── Platform audit logs ────────────────────────────────────────────
        print(f"\n{'─'*65}")
        print(f"  Platform audit logs")
        print(f"{'─'*65}")
        for _ in range(15):
            log_date = days_ago(random.randint(0, 90))
            cur.execute("""
                INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, created_at)
                VALUES (%s,NULL,%s,%s,%s,%s,%s::json,%s)
            """, (
                uid(), superadmin_id,
                random.choice(["login","create","update","delete"]),
                random.choice(["Tenant","Subscription","User","FeatureFlag"]),
                random.choice(all_tenant_ids),
                '{"actor": "superadmin"}',
                log_date,
            ))
        print(f"  [+] 15 platform audit logs")

        conn.commit()

        # ── Resumo ─────────────────────────────────────────────────────────
        print(f"\n{'='*65}")
        print(f"  SEED CONCLUÍDO!")
        print(f"{'='*65}")
        print()
        print(f"  3 tenants | 3+ meses de dados | todos os módulos")
        print()
        print(f"  Credenciais:")
        print(f"    superadmin@senhas.app          / superadmin123  [SUPER_ADMIN]")
        for td in TENANTS_DEF:
            s = td["slug"]
            print(f"    admin@{s}.com.br")
            print(f"      └─ senha: senha123  [admin]   operadores: op1@... op2@...")
        print()
        print(f"  Planos:")
        for td in TENANTS_DEF:
            print(f"    {td['name'][:42]:<42} {td['plan']}")
        print()
        print(f"  Módulos populados por tenant:")
        print(f"    ✓ tenants + configs + subscriptions + invoices")
        print(f"    ✓ feature flags + consulentes + associados + médiuns")
        print(f"    ✓ giras (12 passadas + 2 futuras)")
        print(f"    ✓ tickets (todos status, priority_category, walk-in, sponsor, door)")
        print(f"    ✓ mensalidade (config + pagamentos: pago/pendente/isento)  [PRO+]")
        print(f"    ✓ estoque (grupos + itens + movimentações)                 [PRO+]")
        print(f"    ✓ audit logs (tenant + platform)")
        print(f"{'='*65}")

    except Exception as exc:
        conn.rollback()
        print(f"\n[ERRO] Seed falhou: {exc}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
