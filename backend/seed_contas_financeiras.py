"""
seed_contas_financeiras.py — Seed de Contas a Pagar / Contas a Receber.

Popula as tabelas:
  - categorias_financeiras   (categorias padrão por tenant)
  - contas_bancarias         (contas bancárias por tenant)
  - contas_financeiras       (lançamentos dos últimos 3 meses + próximos 2 meses)

Pré-requisito: seed_dev.py já executado (tenants PRO/PREMIUM precisam existir).
ATENÇÃO: só roda contra localhost.
"""

import os
import sys
import uuid
import random
from datetime import datetime, timezone, date, timedelta

import psycopg2

# ─── Guard: apenas localhost ──────────────────────────────────────────────────

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "localhost"),
    "port":     int(os.environ.get("DB_PORT", 5432)),
    "dbname":   os.environ.get("DB_NAME", "senhas_db"),
    "user":     os.environ.get("DB_USER", "senhas_user"),
    "password": os.environ.get("DB_PASSWORD", "senhas_secure_password"),
}

if DB_CONFIG["host"] not in ("localhost", "127.0.0.1"):
    print("[ABORT] Este seed só pode rodar em localhost.")
    sys.exit(1)

random.seed(99)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def uid() -> str:
    return str(uuid.uuid4())

def today() -> date:
    return date.today()

def days_ago(n: int) -> date:
    return today() - timedelta(days=n)

def days_from_now(n: int) -> date:
    return today() + timedelta(days=n)

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─── Dados de categorias ──────────────────────────────────────────────────────

CATEGORIAS_PAGAR = [
    ("Aluguel / Aluguel de Espaço", "#ef4444"),
    ("Energia Elétrica",            "#f97316"),
    ("Água e Saneamento",           "#06b6d4"),
    ("Material de Ritual",          "#8b5cf6"),
    ("Limpeza e Manutenção",        "#64748b"),
    ("Alimentação / Confraternização", "#f59e0b"),
    ("Seguro",                      "#6366f1"),
    ("Internet e Telefone",         "#0ea5e9"),
    ("Impostos e Taxas",            "#dc2626"),
    ("Outros (Despesas)",           "#94a3b8"),
]

CATEGORIAS_RECEBER = [
    ("Mensalidade de Médiuns",      "#22c55e"),
    ("Mensalidade de Associados",   "#16a34a"),
    ("Doações",                     "#10b981"),
    ("Eventos e Festas",            "#3b82f6"),
    ("Cursos e Workshops",          "#6366f1"),
    ("Rifas e Bingos",              "#f59e0b"),
    ("Outros (Receitas)",           "#94a3b8"),
]

# ─── Lançamentos fixos realistas ──────────────────────────────────────────────

def gerar_lancamentos(tenant_id: str, cat_map: dict, cb_ids: list, admin_id: str) -> list:
    """Retorna lista de tuplas prontas para INSERT em contas_financeiras."""
    rows = []

    def row(tipo, descricao, valor, venc_date, status, data_pag=None, valor_pago=None,
            cat_nome=None, cb_idx=None, recorrencia=None, obs=None):
        cat_id = cat_map.get(cat_nome)
        cb_id  = cb_ids[cb_idx] if cb_idx is not None and cb_ids else None
        return (
            uid(), tenant_id, tipo, descricao, valor, venc_date,
            None,           # data_competencia
            status, data_pag, valor_pago,
            cat_id, cb_id, recorrencia, obs,
            admin_id, utcnow(), utcnow(),
        )

    # ── CONTAS A PAGAR ─────────────────────────────────────────────────────

    # Aluguel — 3 meses passados (pago) + mês atual (pendente)
    for i in range(3, 0, -1):
        venc = days_ago(i * 30).replace(day=5)
        rows.append(row(
            "pagar", "Aluguel do espaço de reunião", 1200.00,
            venc, "pago",
            venc + timedelta(days=random.randint(0, 3)),
            1200.00,
            "Aluguel / Aluguel de Espaço", 0, "mensal",
        ))
    rows.append(row(
        "pagar", "Aluguel do espaço de reunião", 1200.00,
        today().replace(day=5),
        "pendente" if today().day < 5 else "vencido",
        None, None,
        "Aluguel / Aluguel de Espaço", 0, "mensal",
    ))

    # Energia — últimos 3 meses pagos, mês atual pendente
    for i in range(3, 0, -1):
        venc = days_ago(i * 30).replace(day=10)
        valor_e = round(random.uniform(280, 420), 2)
        rows.append(row(
            "pagar", "Conta de energia elétrica", valor_e,
            venc, "pago",
            venc + timedelta(days=random.randint(0, 2)),
            valor_e,
            "Energia Elétrica", 0, "mensal",
        ))
    rows.append(row(
        "pagar", "Conta de energia elétrica", round(random.uniform(280, 420), 2),
        today().replace(day=10),
        "pendente",
        None, None,
        "Energia Elétrica", 0, "mensal",
    ))

    # Água — 2 meses pagos, 1 vencido, 1 futuro
    for i in range(2, 0, -1):
        venc = days_ago(i * 30).replace(day=15)
        valor_a = round(random.uniform(120, 180), 2)
        rows.append(row(
            "pagar", "Conta de água e saneamento", valor_a,
            venc, "pago",
            venc + timedelta(days=1),
            valor_a,
            "Água e Saneamento", 1 if len(cb_ids) > 1 else 0, "mensal",
        ))
    # vencida
    rows.append(row(
        "pagar", "Conta de água e saneamento", 145.00,
        days_ago(5).replace(day=days_ago(5).day),
        "vencido",
        None, None,
        "Água e Saneamento", None, "mensal",
    ))

    # Material de ritual — compras pontuais
    materiais = [
        ("Velas, incensos e óleos essenciais",  280.00,  days_ago(75)),
        ("Ervas medicinais e defumadores",       195.50,  days_ago(45)),
        ("Indumentária: bordados e fitas",       480.00,  days_ago(20)),
        ("Material para altar: flores e frutas", 95.00,   days_ago(8)),
        ("Terços, guias e colares",              320.00,  days_from_now(12)),
        ("Renovação de roupas de entidade",      650.00,  days_from_now(25)),
    ]
    for desc, valor, venc in materiais:
        status = "pago" if venc < today() else "pendente"
        data_pag = venc + timedelta(days=random.randint(0, 5)) if status == "pago" else None
        rows.append(row(
            "pagar", desc, valor, venc, status,
            data_pag, valor if status == "pago" else None,
            "Material de Ritual", 0,
        ))

    # Limpeza — serviço mensal
    for i in range(2, 0, -1):
        venc = days_ago(i * 30).replace(day=1)
        rows.append(row(
            "pagar", "Serviço de limpeza mensal", 350.00,
            venc, "pago",
            venc + timedelta(days=3), 350.00,
            "Limpeza e Manutenção", 0, "mensal",
        ))
    rows.append(row(
        "pagar", "Serviço de limpeza mensal", 350.00,
        days_from_now(5), "pendente",
        None, None,
        "Limpeza e Manutenção", None, "mensal",
    ))

    # Internet
    for i in range(3, 0, -1):
        venc = days_ago(i * 30).replace(day=20)
        rows.append(row(
            "pagar", "Plano de internet 200MB", 89.90,
            venc, "pago",
            venc, 89.90,
            "Internet e Telefone", 0, "mensal",
        ))
    rows.append(row(
        "pagar", "Plano de internet 200MB", 89.90,
        today().replace(day=20) if today().day <= 20 else days_from_now(10),
        "pendente",
        None, None,
        "Internet e Telefone", None, "mensal",
    ))

    # Impostos
    rows.append(row(
        "pagar", "IPTU — parcela 4/10", 210.00,
        days_ago(60), "pago",
        days_ago(58), 210.00,
        "Impostos e Taxas", 1 if len(cb_ids) > 1 else 0,
    ))
    rows.append(row(
        "pagar", "IPTU — parcela 5/10", 210.00,
        days_ago(30), "pago",
        days_ago(28), 210.00,
        "Impostos e Taxas", None,
    ))
    rows.append(row(
        "pagar", "IPTU — parcela 6/10", 210.00,
        days_from_now(5), "pendente",
        None, None,
        "Impostos e Taxas", None,
    ))
    rows.append(row(
        "pagar", "Regularização de CNPJ / Cartório", 380.00,
        days_from_now(45), "pendente",
        None, None,
        "Impostos e Taxas", None,
        None, "Renovação anual do registro da associação",
    ))

    # Confraternização / festa
    rows.append(row(
        "pagar", "Confraternização anual — buffet", 1800.00,
        days_ago(90), "pago",
        days_ago(88), 1800.00,
        "Alimentação / Confraternização", 0,
    ))
    rows.append(row(
        "pagar", "Festa de Yemanjá — decoração e feitio", 950.00,
        days_from_now(20), "pendente",
        None, None,
        "Alimentação / Confraternização", None,
    ))

    # Cancelado
    rows.append(row(
        "pagar", "Curso de formação espiritual (cancelado)", 500.00,
        days_ago(15), "cancelado",
        None, None,
        "Outros (Despesas)", None,
        None, "Evento cancelado pelo organizador",
    ))

    # ── CONTAS A RECEBER ───────────────────────────────────────────────────

    # Mensalidades de médiuns (10 médiuns × 3 meses + 1 vencida)
    valores_mens = [80, 80, 80, 100, 100, 100, 120, 120, 150, 150]
    nomes_mediuns = [
        "João da Silva", "Maria Aparecida", "Carlos Eduardo",
        "Ana Paula", "Roberto Souza", "Fernanda Lima",
        "Marcos Oliveira", "Luciana Costa", "Paulo Henrique", "Sandra Ramos",
    ]
    for i, (nome, valor) in enumerate(zip(nomes_mediuns, valores_mens)):
        for m in range(2, 0, -1):
            venc = days_ago(m * 30).replace(day=10)
            rows.append(row(
                "receber", f"Mensalidade — {nome}", float(valor),
                venc, "pago",
                venc + timedelta(days=random.randint(0, 7)),
                float(valor),
                "Mensalidade de Médiuns", 0 if len(cb_ids) > 0 else None,
            ))
        # mês atual — alguns pagos, alguns pendentes, 1 vencido
        venc_atual = today().replace(day=10)
        if i < 6:
            status_atual = "pago"
            dp = venc_atual + timedelta(days=random.randint(0, 5)) if venc_atual < today() else None
            vp = float(valor) if dp else None
        elif i == 6:
            status_atual = "vencido"
            dp = None; vp = None
        else:
            status_atual = "pendente"
            dp = None; vp = None
        rows.append(row(
            "receber", f"Mensalidade — {nome}", float(valor),
            venc_atual, status_atual, dp, vp,
            "Mensalidade de Médiuns", 0 if len(cb_ids) > 0 else None,
        ))

    # Mensalidades de associados (5)
    associados = [
        ("Beatriz Ferreira", 50.0),
        ("Ricardo Gomes",    50.0),
        ("Patrícia Nunes",   50.0),
        ("Eduardo Martins",  80.0),
        ("Cláudia Barbosa",  80.0),
    ]
    for nome, valor in associados:
        for m in range(3, 0, -1):
            venc = days_ago(m * 30).replace(day=15)
            pago = random.random() > 0.1
            rows.append(row(
                "receber", f"Mensalidade associado — {nome}", valor,
                venc, "pago" if pago else "vencido",
                venc + timedelta(days=random.randint(1, 10)) if pago else None,
                valor if pago else None,
                "Mensalidade de Associados", 0 if cb_ids else None,
            ))
        rows.append(row(
            "receber", f"Mensalidade associado — {nome}", valor,
            days_from_now(5).replace(day=15) if today().day <= 15 else days_from_now(20),
            "pendente", None, None,
            "Mensalidade de Associados", None,
        ))

    # Doações
    doacoes = [
        ("Doação espontânea — cesta de Exu",         150.00, days_ago(80)),
        ("Doação — reforma do telhado",             2000.00, days_ago(65)),
        ("Doação — festa de Iemanjá",                300.00, days_ago(30)),
        ("Doação anônima — caixa do terreiro",        80.00, days_ago(15)),
        ("Doação em produtos — velas e incensos",    120.00, days_ago(7)),
        ("Campanha de arrecadação — bênçãos de Oxum", 500.00, days_from_now(30)),
    ]
    for desc, valor, venc in doacoes:
        pago = venc < today()
        rows.append(row(
            "receber", desc, valor,
            venc, "pago" if pago else "pendente",
            venc + timedelta(days=1) if pago else None,
            valor if pago else None,
            "Doações", 0 if cb_ids else None,
        ))

    # Eventos
    eventos = [
        ("Ingressos — Festa de Cosme e Damião",  800.00, days_ago(55)),
        ("Rifa beneficente — Festa de Ogum",      450.00, days_ago(40)),
        ("Inscrições — Bingo da Caridade",        620.00, days_ago(20)),
        ("Ingressos — Festa do Preto-Velho",      750.00, days_from_now(15)),
        ("Rifa — Festa de Iansã",                 380.00, days_from_now(40)),
    ]
    for desc, valor, venc in eventos:
        pago = venc < today()
        rows.append(row(
            "receber", desc, valor,
            venc, "pago" if pago else "pendente",
            venc + timedelta(days=random.randint(0, 3)) if pago else None,
            valor if pago else None,
            "Eventos e Festas", 0 if cb_ids else None,
        ))

    # Cursos
    cursos = [
        ("Curso: Introdução à Umbanda — turma jan", 1200.00, days_ago(70)),
        ("Curso: Fundamentos do Candomblé",          950.00, days_ago(35)),
        ("Workshop: Ervas Sagradas",                 480.00, days_ago(10)),
        ("Curso: Jurema Sagrada — turma mar",       1400.00, days_from_now(20)),
    ]
    for desc, valor, venc in cursos:
        pago = venc < today()
        rows.append(row(
            "receber", desc, valor,
            venc, "pago" if pago else "pendente",
            venc + timedelta(days=random.randint(1, 5)) if pago else None,
            valor if pago else None,
            "Cursos e Workshops", 1 if len(cb_ids) > 1 else 0 if cb_ids else None,
        ))

    # Cancelado
    rows.append(row(
        "receber", "Workshop cancelado — Passes e Cura", 600.00,
        days_ago(25), "cancelado",
        None, None,
        "Outros (Receitas)", None,
        None, "Workshop cancelado por falta de quórum",
    ))

    return rows


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("  Seed — Contas a Pagar / Contas a Receber")
    print("=" * 65)

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False

    try:
        cur = conn.cursor()

        # Busca tenants PRO ou PREMIUM
        cur.execute("""
            SELECT t.id, t.name, t.slug, s.plan
            FROM tenants t
            JOIN subscriptions s ON s.tenant_id = t.id
            WHERE s.plan IN ('PRO', 'PREMIUM')
              AND t.deleted_at IS NULL
            ORDER BY t.created_at
        """)
        tenants = cur.fetchall()

        if not tenants:
            print("\n[AVISO] Nenhum tenant PRO ou PREMIUM encontrado.")
            print("         Execute seed_dev.py primeiro.")
            sys.exit(1)

        print(f"\n  {len(tenants)} tenant(s) encontrado(s): {[t[1] for t in tenants]}\n")

        all_stats = []

        for tenant_id, tenant_name, tenant_slug, plan in tenants:
            print(f"{'─'*65}")
            print(f"  Tenant: {tenant_name}  [{plan}]")
            print(f"{'─'*65}")

            # Admin do tenant
            cur.execute("""
                SELECT id FROM users
                WHERE tenant_id = %s AND role = 'admin'
                  AND deleted_at IS NULL
                ORDER BY created_at LIMIT 1
            """, (tenant_id,))
            row = cur.fetchone()
            admin_id = row[0] if row else None

            # ── Limpa dados anteriores deste tenant ────────────────────────
            cur.execute("DELETE FROM contas_financeiras   WHERE tenant_id = %s", (tenant_id,))
            cur.execute("DELETE FROM contas_bancarias     WHERE tenant_id = %s", (tenant_id,))
            cur.execute("DELETE FROM categorias_financeiras WHERE tenant_id = %s", (tenant_id,))
            print("  [~] dados anteriores removidos")

            # ── Categorias ─────────────────────────────────────────────────
            cat_map: dict[str, str] = {}  # nome → id

            for nome, cor in CATEGORIAS_PAGAR:
                cat_id = uid()
                cat_map[nome] = cat_id
                cur.execute("""
                    INSERT INTO categorias_financeiras
                        (id, tenant_id, nome, tipo, cor, ativo, created_at, updated_at)
                    VALUES (%s,%s,%s,'pagar',%s,true,%s,%s)
                """, (cat_id, tenant_id, nome, cor, utcnow(), utcnow()))

            for nome, cor in CATEGORIAS_RECEBER:
                cat_id = uid()
                cat_map[nome] = cat_id
                cur.execute("""
                    INSERT INTO categorias_financeiras
                        (id, tenant_id, nome, tipo, cor, ativo, created_at, updated_at)
                    VALUES (%s,%s,%s,'receber',%s,true,%s,%s)
                """, (cat_id, tenant_id, nome, cor, utcnow(), utcnow()))

            n_cats = len(CATEGORIAS_PAGAR) + len(CATEGORIAS_RECEBER)
            print(f"  [+] {n_cats} categorias ({len(CATEGORIAS_PAGAR)} pagar + {len(CATEGORIAS_RECEBER)} receber)")

            # ── Contas bancárias ───────────────────────────────────────────
            contas_bancarias = [
                ("Caixa do Terreiro",   None,       500.00),
                ("Conta Santander",     "Santander", 1200.00),
                ("Conta Bradesco",      "Bradesco",  0.00),
            ]
            cb_ids = []
            for nome_cb, banco, saldo in contas_bancarias:
                cb_id = uid()
                cb_ids.append(cb_id)
                cur.execute("""
                    INSERT INTO contas_bancarias
                        (id, tenant_id, nome, banco, saldo_inicial, ativo, created_at, updated_at)
                    VALUES (%s,%s,%s,%s,%s,true,%s,%s)
                """, (cb_id, tenant_id, nome_cb, banco, saldo, utcnow(), utcnow()))
            print(f"  [+] {len(cb_ids)} contas bancárias")

            # ── Lançamentos ────────────────────────────────────────────────
            lancamentos = gerar_lancamentos(tenant_id, cat_map, cb_ids, admin_id)
            pagar_count = receber_count = 0

            for lrow in lancamentos:
                (lid, tid, tipo, desc, valor, venc, comp,
                 status, dp, vp, cat_id, cb_id, recorr, obs,
                 criado_por, created_at, updated_at) = lrow

                cur.execute("""
                    INSERT INTO contas_financeiras (
                        id, tenant_id, tipo, descricao, valor,
                        data_vencimento, data_competencia, status,
                        data_pagamento, valor_pago,
                        categoria_id, conta_bancaria_id,
                        recorrencia, observacoes, comprovante_url,
                        criado_por, created_at, updated_at
                    ) VALUES (
                        %s,%s,%s,%s,%s,
                        %s,%s,%s,
                        %s,%s,
                        %s,%s,
                        %s,%s,NULL,
                        %s,%s,%s
                    )
                """, (
                    lid, tid, tipo, desc, valor,
                    venc, comp, status,
                    dp, vp,
                    cat_id, cb_id,
                    recorr, obs,
                    criado_por, created_at, updated_at,
                ))

                if tipo == "pagar":
                    pagar_count += 1
                else:
                    receber_count += 1

            total = pagar_count + receber_count
            print(f"  [+] {total} lançamentos ({pagar_count} a pagar + {receber_count} a receber)")

            # ── Estatísticas rápidas ───────────────────────────────────────
            cur.execute("""
                SELECT status, COUNT(*), SUM(valor)
                FROM contas_financeiras
                WHERE tenant_id = %s AND deleted_at IS NULL
                GROUP BY status ORDER BY status
            """, (tenant_id,))
            stats = cur.fetchall()
            all_stats.append((tenant_name, stats))

        conn.commit()

        # ── Resumo ─────────────────────────────────────────────────────────
        print(f"\n{'='*65}")
        print(f"  SEED CONCLUÍDO!")
        print(f"{'='*65}\n")

        for tenant_name, stats in all_stats:
            print(f"  {tenant_name}:")
            for status, count, total in stats:
                print(f"    {status:<12}  {count:>3} lançamentos   R$ {float(total):>10.2f}")
            print()

        print("  Acesse: http://localhost:3000/admin/financeiro/contas-pagar")
        print("          http://localhost:3000/admin/financeiro/contas-receber")
        print(f"{'='*65}\n")

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
