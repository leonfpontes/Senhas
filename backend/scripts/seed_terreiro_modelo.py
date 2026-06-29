#!/usr/bin/env python3
"""Seed completo para o tenant terreiro-modelo em produção.

Gera 6 meses de dados realistas cobrindo todas as funcionalidades:
  - Médiuns e Cambones
  - Associados
  - Consulentes
  - Giras + Tickets
  - Estoque (grupos, itens, movimentações)
  - Contas Financeiras (categorias, contas bancárias, pagar/receber)
  - Mensalidades (médiuns e associados)

Uso: docker exec senhas_backend python scripts/seed_terreiro_modelo.py
"""
import asyncio
import uuid
import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

import sys, os
sys.path.insert(0, "/app")

from src.core.config import settings
from src.models import (
    Tenant, Medium, Associado, Consulente, Gira, Ticket, SenhaControl,
    EstoqueGrupo, EstoqueItem, EstoqueMovimentacao,
    CategoriaFinanceira, ContaBancaria, ContaFinanceira,
    MensalidadeConfig, MensalidadePagamento, AssociadoMensalidadePagamento,
)
from src.models.tickets import TicketStatus
from src.models.estoque import EstoqueMovimentacaoTipo
from src.models.mensalidades import MensalidadeStatus

TENANT_SLUG = "terreiro-modelo"

# ─── dados realistas ──────────────────────────────────────────────────────────

MEDIUNS = [
    ("Mãe Aparecida de Oxum", True, False, "11999010001", "aparecida@terreiro.org", date(1968, 3, 14)),
    ("Pai José de Ogum", True, False, "11999010002", "jose.ogum@terreiro.org", date(1955, 7, 22)),
    ("Irmão Ricardo de Xangô", True, False, "11999010003", "ricardo.xango@terreiro.org", date(1980, 11, 5)),
    ("Irmã Fernanda de Iemanjá", True, False, "11999010004", "fernanda@terreiro.org", date(1985, 2, 28)),
    ("Filha Ana Luiza de Oxóssi", True, False, "11999010005", "analuiza@terreiro.org", date(1992, 6, 18)),
    ("Filho Marcos de Exu", True, False, "11999010006", "marcos.exu@terreiro.org", date(1978, 9, 3)),
    ("Irmã Claudia de Nanã", True, False, "11999010007", "claudia.nana@terreiro.org", date(1975, 1, 15)),
    ("Filho Bruno de Omolu", True, False, "11999010008", "bruno.omolu@terreiro.org", date(1990, 4, 7)),
    ("Irmã Patrícia de Oxum", True, False, "11999010009", "patricia@terreiro.org", date(1983, 8, 25)),
    ("Filho Thiago de Iansã", True, False, "11999010010", "thiago.ansa@terreiro.org", date(1995, 12, 11)),
    ("Cambone Carlos", False, False, "11999010011", None, date(1970, 5, 20)),
    ("Cambone Silvia", False, False, "11999010012", None, date(1988, 10, 3)),
    ("Cambone Eduardo", False, False, "11999010013", None, date(1982, 7, 14)),
    ("Cambone Renata", False, True, "11999010014", None, date(1993, 3, 9)),   # isento
    ("Filho Leandro de Caboclo", True, False, "11999010015", "leandro@terreiro.org", date(1987, 6, 30)),
]

ASSOCIADOS_NOMES = [
    ("Maria das Graças Silva", "maria.gracas@email.com", "(11) 98888-0001"),
    ("João Batista Oliveira", "joao.batista@email.com", "(11) 98888-0002"),
    ("Ana Paula Ferreira", "ana.paula@email.com", "(11) 98888-0003"),
    ("Carlos Alberto Santos", "carlos.santos@email.com", "(11) 98888-0004"),
    ("Lúcia Mendes Costa", "lucia.mendes@email.com", "(11) 98888-0005"),
    ("Roberto Souza Lima", "roberto.souza@email.com", "(11) 98888-0006"),
    ("Fernanda Alves Rocha", "fernanda.alves@email.com", "(11) 98888-0007"),
    ("Paulo Roberto Martins", "paulo.martins@email.com", "(11) 98888-0008"),
    ("Claudia Regina Nunes", "claudia.nunes@email.com", "(11) 98888-0009"),
    ("Antônio José Pereira", "antonio.pereira@email.com", "(11) 98888-0010"),
    ("Sandra Cristina Dias", "sandra.dias@email.com", "(11) 98888-0011"),
    ("Marcelo Henrique Gomes", "marcelo.gomes@email.com", "(11) 98888-0012"),
    ("Rosangela Farias Pinto", "rosangela@email.com", "(11) 98888-0013"),
    ("Eduardo Luiz Barbosa", "edu.barbosa@email.com", "(11) 98888-0014"),
    ("Vera Lucia Corrêa", "vera.correa@email.com", "(11) 98888-0015"),
    ("Fabio Augusto Ribeiro", "fabio.ribeiro@email.com", "(11) 98888-0016"),
    ("Simone Aparecida Carvalho", "simone.carvalho@email.com", "(11) 98888-0017"),
    ("Rodrigo de Souza Melo", "rodrigo.melo@email.com", "(11) 98888-0018"),
    ("Tânia Maria Nogueira", "tania.nogueira@email.com", "(11) 98888-0019"),
    ("Wagner Ferreira Cruz", "wagner.cruz@email.com", "(11) 98888-0020"),
    ("Adriana Lopes Vieira", "adriana.vieira@email.com", "(11) 98888-0021"),
    ("Luiz Fernando Teixeira", "luizf.teixeira@email.com", "(11) 98888-0022"),
    ("Patricia Helena Moura", "patricia.moura@email.com", "(11) 98888-0023"),
    ("Gilberto Santos Ramos", "gilberto.ramos@email.com", "(11) 98888-0024"),
    ("Cristiane Lima Araujo", "cristiane.araujo@email.com", "(11) 98888-0025"),
    ("Marcio Andrade Freitas", "marcio.freitas@email.com", "(11) 98888-0026"),
    ("Eliane Rodrigues Braga", "eliane.braga@email.com", "(11) 98888-0027"),
    ("Davi Nascimento Cunha", "davi.cunha@email.com", "(11) 98888-0028"),
    ("Ivone Cardoso Monteiro", "ivone.monteiro@email.com", "(11) 98888-0029"),
    ("Flávio de Camargo Pires", "flavio.pires@email.com", "(11) 98888-0030"),
]

CONSULENTES_NOMES = [
    "Aline Borges", "Bruno Takahashi", "Carmen Silveira", "Daniel Mota",
    "Estela Vaz", "Felipe Correa", "Giovanna Castro", "Henrique Fonseca",
    "Ingrid Cavalcante", "Jorge Paixão", "Karina Melo", "Leonardo Dias",
    "Marina Rios", "Nelson Freire", "Olga Rezende", "Pedro Assis",
    "Quintina Luz", "Renato Cunha", "Sabrina Pacheco", "Tiago Andrade",
    "Ursula Brandt", "Victor Abreu", "Wanda Goulart", "Xisto Lima",
    "Yasmin Torres", "Zuleica Barros", "Amanda Queiroz", "Bernardo Neves",
    "Celina Duarte", "Diego Faria", "Erika Campos", "Francisco Lago",
    "Graça Pimentel", "Hugo Borba", "Irene Leal", "Joaquim Sena",
    "Keila Muniz", "Luan Vianna", "Marcia Costa", "Nilton Paiva",
    "Octavia Rocha", "Plinio Souza", "Rachel Matos", "Sergio Brum",
    "Teresa Fontes", "Ulisses Machado", "Valeria Maia", "Wanderson Brito",
    "Ximena Salgado", "Yuri Azevedo", "Zilda Ramos", "Andre Magno",
    "Beatriz Furtado", "Caio Lima", "Denise Araujo", "Emilio Costa",
    "Fatima Leite", "Gustavo Almeida", "Haydee Mendes", "Ivan Roza",
    "Jacira Fernandes", "Klaus Werner", "Ligia Prado", "Manuel Pinheiro",
    "Nadia Alves", "Osvaldo Gomes", "Paula Meirelles", "Quintino Lins",
    "Rita Coelho", "Samuel Torres", "Talita Bentes", "Ubiratan Neto",
    "Viviane Gama", "William Santos", "Xênia Dutra", "Yolande Felix",
    "Zelia Moura", "Alceu Pires", "Benedita Lopes", "Candido Fraga",
    "Dalva Esteves", "Ednaldo Bastos", "Francisca Lima", "Geraldo Mota",
    "Helena Braga", "Ivo Correia", "Jaqueline Paz", "Kelvin Rocha",
    "Livia Andrade", "Murilo Costa", "Nathalia Vaz", "Orlando Reis",
    "Priscila Alves", "Quirino Santos", "Rosana Lima", "Silvio Moura",
    "Tania Peres", "Umberto Braga", "Valentina Cruz", "Wendell Figo",
    "Xandra Luz", "Yago Monteiro", "Zeila Barros", "Altair Souza",
    "Bruna Guedes", "Celso Barão", "Dilma Ramos", "Euclidio Melo",
]

NOMES_GIRA = [
    "Gira de Umbanda — Exu e Pombagira",
    "Gira de Preto Velho",
    "Gira de Caboclo",
    "Gira de Ogum",
    "Gira de Iemanjá",
    "Gira de Oxum",
    "Gira de Xangô",
    "Gira de Nanã",
    "Gira de Oxóssi",
    "Gira Especial — Festejo de Cosme e Damião",
    "Gira de Iansã",
    "Gira de Omolu",
]

# ─── helpers ──────────────────────────────────────────────────────────────────

def dt(d: date, hour: int = 19, minute: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=timezone.utc)

def months_back(n: int) -> list[date]:
    """Returns the 1st day of each of the past n months."""
    today = date.today()
    result = []
    for i in range(n, 0, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        result.append(date(y, m, 1))
    return result

def saturdays_in_month(year: int, month: int, count: int = 2) -> list[date]:
    """Returns the first `count` Saturdays of a month."""
    result = []
    d = date(year, month, 1)
    while len(result) < count:
        if d.weekday() == 5:  # Saturday
            result.append(d)
        d += timedelta(days=1)
    return result

# ─── main ─────────────────────────────────────────────────────────────────────

async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        # 1. Localiza tenant
        result = await db.execute(select(Tenant).where(Tenant.slug == TENANT_SLUG))
        tenant: Tenant | None = result.scalar_one_or_none()
        if not tenant:
            print(f"[ERRO] Tenant '{TENANT_SLUG}' não encontrado.")
            return
        tid = tenant.id
        print(f"[OK] Tenant encontrado: {tenant.name} ({tid})")

        # 2. Limpa dados existentes de seed (evita duplicatas)
        print("[INFO] Limpando dados existentes do tenant...")
        await db.execute(text(f"DELETE FROM estoque_movimentacoes WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM estoque_itens WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM estoque_grupos WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM mensalidade_pagamentos WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM associado_mensalidade_pagamentos WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM mensalidade_configs WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM contas_financeiras WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM categorias_financeiras WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM contas_bancarias WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM tickets WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM senha_controls WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM giras WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM consulentes WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM associados WHERE tenant_id = '{tid}'"))
        await db.execute(text(f"DELETE FROM mediuns WHERE tenant_id = '{tid}'"))
        await db.commit()
        print("[OK] Dados anteriores removidos.")

        # ── 3. Médiuns ────────────────────────────────────────────────────────
        print("[INFO] Criando médiuns...")
        mediuns_db = []
        for nome, is_atend, isento, tel, email, nasc in MEDIUNS:
            m = Medium(
                id=uuid.uuid4(), tenant_id=tid,
                nome=nome, is_atendimento=is_atend,
                mensalidade_isento=isento, is_active=True,
                telefone=tel, email=email, data_nascimento=nasc,
                cidade="São Paulo",
            )
            db.add(m)
            mediuns_db.append(m)
        await db.flush()
        mediuns_atend = [m for m in mediuns_db if m.is_atendimento]
        cambones = [m for m in mediuns_db if not m.is_atendimento]
        print(f"[OK] {len(mediuns_db)} médiuns criados.")

        # ── 4. Associados ─────────────────────────────────────────────────────
        print("[INFO] Criando associados...")
        assoc_db = []
        for nome, email, tel in ASSOCIADOS_NOMES:
            a = Associado(
                id=uuid.uuid4(), tenant_id=tid,
                nome=nome, email=email,
                email_normalized=email.lower(),
                telefone=tel,
                mensalidade_isento=random.random() < 0.1,
            )
            db.add(a)
            assoc_db.append(a)
        await db.flush()
        print(f"[OK] {len(assoc_db)} associados criados.")

        # ── 5. Consulentes ────────────────────────────────────────────────────
        print("[INFO] Criando consulentes...")
        cons_db = []
        for i, nome in enumerate(CONSULENTES_NOMES):
            c = Consulente(
                id=uuid.uuid4(), tenant_id=tid,
                nome=nome,
                email=f"consulente{i+1:03d}@example.com",
                email_normalized=f"consulente{i+1:03d}@example.com",
                telefone=f"119{i+1:07d}",
            )
            db.add(c)
            cons_db.append(c)
        await db.flush()
        print(f"[OK] {len(cons_db)} consulentes criados.")

        # ── 6. Giras + Tickets ────────────────────────────────────────────────
        print("[INFO] Criando giras e tickets...")
        six_months = months_back(6)
        gira_nomes_cycle = list(NOMES_GIRA)
        total_tickets = 0
        giras_criadas = []

        for i, mes_primeiro in enumerate(six_months):
            sats = saturdays_in_month(mes_primeiro.year, mes_primeiro.month, 2)
            for j, sat in enumerate(sats):
                nome_gira = gira_nomes_cycle[(i * 2 + j) % len(gira_nomes_cycle)]
                gira = Gira(
                    id=uuid.uuid4(), tenant_id=tid,
                    nome=nome_gira,
                    descricao=f"Gira realizada no Terreiro Modelo — {sat.strftime('%B/%Y')}.",
                    data_inicio=dt(sat, 19, 0),
                    data_fim=dt(sat, 22, 30),
                    local="Terreiro Modelo — Rua das Flores, 123",
                    is_active=False,
                    max_tickets=50,
                    release_start_at=dt(sat - timedelta(days=7), 8, 0),
                    release_end_at=dt(sat, 18, 0),
                )
                db.add(gira)
                await db.flush()
                giras_criadas.append(gira)

                # Distribui consulentes na gira
                n_tickets = random.randint(25, 45)
                consulentes_gira = random.sample(cons_db, min(n_tickets, len(cons_db)))
                for numero, consulente in enumerate(consulentes_gira, start=1):
                    # Define status realista
                    r = random.random()
                    if r < 0.75:
                        status = TicketStatus.COMPLETED
                        chamado_em = dt(sat, 19, 15) + timedelta(minutes=numero * 8)
                        finalizado_em = chamado_em + timedelta(minutes=random.randint(15, 40))
                        atendido_em = finalizado_em
                    elif r < 0.88:
                        status = TicketStatus.CALLED
                        chamado_em = dt(sat, 19, 15) + timedelta(minutes=numero * 8)
                        finalizado_em = None
                        atendido_em = None
                    elif r < 0.95:
                        status = TicketStatus.NO_SHOW
                        chamado_em = dt(sat, 19, 15) + timedelta(minutes=numero * 8)
                        finalizado_em = None
                        atendido_em = None
                    else:
                        status = TicketStatus.CANCELLED
                        chamado_em = None
                        finalizado_em = None
                        atendido_em = None

                    med = random.choice(mediuns_atend)
                    cam = random.choice(cambones)

                    ticket = Ticket(
                        id=uuid.uuid4(), tenant_id=tid,
                        gira_id=gira.id, consulente_id=consulente.id,
                        numero=numero, status=status,
                        chamado_em=chamado_em if status != TicketStatus.CANCELLED else None,
                        finalizado_em=finalizado_em,
                        atendido_em=atendido_em,
                        medium_nome=med.nome if status == TicketStatus.COMPLETED else None,
                        cambone_nome=cam.nome if status == TicketStatus.COMPLETED else None,
                        checkin_em=dt(sat, 18, 0) + timedelta(minutes=numero * 3) if status != TicketStatus.CANCELLED else None,
                        is_sponsor=numero <= 2,
                        is_walk_in=random.random() < 0.1,
                    )
                    db.add(ticket)
                    total_tickets += 1

        await db.flush()
        print(f"[OK] {len(giras_criadas)} giras criadas com {total_tickets} tickets.")

        # ── 7. Estoque ────────────────────────────────────────────────────────
        print("[INFO] Criando estoque...")
        grupos_data = [
            ("Velas e Incensos", "Materiais de iluminação e defumação"),
            ("Sementes e Ervas", "Ervas, sementes e folhas sagradas"),
            ("Tecidos e Roupas", "Fardamento e tecidos rituais"),
            ("Utensílios Rituais", "Quartinhas, guias, búzios e objetos de culto"),
        ]
        grupos_db = []
        for nome, desc in grupos_data:
            g = EstoqueGrupo(id=uuid.uuid4(), tenant_id=tid, nome=nome, descricao=desc)
            db.add(g)
            grupos_db.append(g)
        await db.flush()

        itens_data = [
            (0, "Vela Branca", "UN", 20, 2.50),
            (0, "Incenso Sândalos", "CX", 10, 8.00),
            (0, "Vela 7 Dias", "UN", 5, 12.00),
            (1, "Arruda", "KG", 1, 15.00),
            (1, "Alecrim", "KG", 1, 12.00),
            (1, "Guiné", "UN", 5, 5.00),
            (2, "Tecido Branco", "M",  5, 18.00),
            (2, "Tecido Azul", "M", 3, 20.00),
            (2, "Faixa de Oxum", "UN", 2, 35.00),
            (3, "Quartinha de Barro", "UN", 3, 25.00),
            (3, "Guia de Contas Azuis", "UN", 5, 45.00),
            (3, "Búzios para Jogo", "CX", 2, 80.00),
        ]
        itens_db = []
        for gi, nome, unidade, minimo, custo in itens_data:
            it = EstoqueItem(
                id=uuid.uuid4(), tenant_id=tid,
                grupo_id=grupos_db[gi].id,
                nome=nome, unidade_medida=unidade,
                estoque_minimo=minimo, custo_unitario=custo,
            )
            db.add(it)
            itens_db.append(it)
        await db.flush()

        # Movimentações: 1 entrada grande por item + saídas mensais
        for it in itens_db:
            # Entrada inicial (6 meses atrás)
            entrada_qtd = random.randint(30, 80)
            mv_in = EstoqueMovimentacao(
                id=uuid.uuid4(), tenant_id=tid,
                item_id=it.id,
                tipo=EstoqueMovimentacaoTipo.ENTRADA,
                quantidade=entrada_qtd,
                motivo="Estoque inicial — compra do fornecedor",
                data_movimentacao=dt(six_months[0], 10, 0),
            )
            db.add(mv_in)

        # Saídas mensais por gira
        for gira in giras_criadas:
            n_saidas = random.randint(2, 4)
            itens_usados = random.sample(itens_db, n_saidas)
            for it in itens_usados:
                mv_out = EstoqueMovimentacao(
                    id=uuid.uuid4(), tenant_id=tid,
                    item_id=it.id,
                    tipo=EstoqueMovimentacaoTipo.SAIDA,
                    quantidade=random.randint(1, 5),
                    motivo=f"Uso na {gira.nome}",
                    data_movimentacao=gira.data_inicio,
                    requisitante="Coordenação Ritual",
                )
                db.add(mv_out)

        # Reposições intermediárias
        for it in random.sample(itens_db, 6):
            for mes in random.sample(six_months[2:], 2):
                mv = EstoqueMovimentacao(
                    id=uuid.uuid4(), tenant_id=tid,
                    item_id=it.id,
                    tipo=EstoqueMovimentacaoTipo.ENTRADA,
                    quantidade=random.randint(10, 30),
                    motivo="Reposição mensal",
                    data_movimentacao=dt(mes, 14, 0),
                )
                db.add(mv)

        await db.flush()
        print("[OK] Estoque criado.")

        # ── 8. Financeiro — Categorias e Contas Bancárias ─────────────────────
        print("[INFO] Criando categorias financeiras e contas bancárias...")
        cats_pagar = [
            ("Água e Esgoto", "#2196F3"),
            ("Energia Elétrica", "#FF9800"),
            ("Aluguel / Sede", "#9C27B0"),
            ("Materiais Rituais", "#4CAF50"),
            ("Manutenção", "#795548"),
            ("Alimentação / Quizila", "#E91E63"),
        ]
        cats_receber = [
            ("Mensalidades Médiuns", "#00BCD4"),
            ("Mensalidades Associados", "#3F51B5"),
            ("Doações", "#8BC34A"),
            ("Eventos / Festas", "#FF5722"),
        ]
        cat_db = {}
        for nome, cor in cats_pagar:
            c = CategoriaFinanceira(id=uuid.uuid4(), tenant_id=tid, nome=nome, cor=cor, tipo="pagar")
            db.add(c)
            cat_db[nome] = c
        for nome, cor in cats_receber:
            c = CategoriaFinanceira(id=uuid.uuid4(), tenant_id=tid, nome=nome, cor=cor, tipo="receber")
            db.add(c)
            cat_db[nome] = c
        await db.flush()

        cb_caixa = ContaBancaria(
            id=uuid.uuid4(), tenant_id=tid,
            nome="Caixa do Terreiro", banco="Caixa (dinheiro físico)", saldo_inicial=Decimal("500.00"),
        )
        cb_banco = ContaBancaria(
            id=uuid.uuid4(), tenant_id=tid,
            nome="Conta Corrente BB", banco="Banco do Brasil", saldo_inicial=Decimal("1200.00"),
        )
        db.add(cb_caixa)
        db.add(cb_banco)
        await db.flush()
        print("[OK] Categorias e contas bancárias criadas.")

        # ── 9. Contas Financeiras (Pagar e Receber) ───────────────────────────
        print("[INFO] Criando contas a pagar e a receber...")

        contas_pagar_template = [
            ("Conta de Água — {mes}", "Água e Esgoto", 85.00, cb_caixa),
            ("Conta de Luz — {mes}", "Energia Elétrica", 320.00, cb_banco),
            ("Aluguel da Sede — {mes}", "Aluguel / Sede", 800.00, cb_banco),
            ("Compra de Materiais Rituais — {mes}", "Materiais Rituais", 150.00, cb_caixa),
            ("Manutenção Geral — {mes}", "Manutenção", 200.00, cb_caixa),
        ]
        contas_receber_template = [
            ("Doações Coletadas na Gira — {mes}", "Doações", 450.00, cb_caixa),
            ("Mensalidades Médiuns — {mes}", "Mensalidades Médiuns", 380.00, cb_banco),
            ("Mensalidades Associados — {mes}", "Mensalidades Associados", 510.00, cb_banco),
        ]

        today = date.today()
        for mes in six_months:
            mes_label = mes.strftime("%m/%Y")
            mes_is_past = mes.month < today.month or mes.year < today.year

            for tpl, cat_nome, valor, cb in contas_pagar_template:
                venc = date(mes.year, mes.month, 10)
                pago = mes_is_past and random.random() < 0.85
                variacao = random.uniform(0.9, 1.15)
                c = ContaFinanceira(
                    id=uuid.uuid4(), tenant_id=tid,
                    tipo="pagar",
                    descricao=tpl.format(mes=mes_label),
                    valor=round(valor * variacao, 2),
                    data_vencimento=venc,
                    status="pago" if pago else ("vencido" if venc < today and not pago else "pendente"),
                    data_pagamento=venc + timedelta(days=random.randint(0, 5)) if pago else None,
                    valor_pago=round(valor * variacao, 2) if pago else None,
                    categoria_id=cat_db[cat_nome].id,
                    conta_bancaria_id=cb.id,
                    recorrencia="mensal",
                )
                db.add(c)

            for tpl, cat_nome, valor, cb in contas_receber_template:
                venc = date(mes.year, mes.month, 15)
                recebido = mes_is_past and random.random() < 0.90
                variacao = random.uniform(0.85, 1.10)
                c = ContaFinanceira(
                    id=uuid.uuid4(), tenant_id=tid,
                    tipo="receber",
                    descricao=tpl.format(mes=mes_label),
                    valor=round(valor * variacao, 2),
                    data_vencimento=venc,
                    status="pago" if recebido else ("vencido" if venc < today and not recebido else "pendente"),
                    data_pagamento=venc + timedelta(days=random.randint(-2, 3)) if recebido else None,
                    valor_pago=round(valor * variacao, 2) if recebido else None,
                    categoria_id=cat_db[cat_nome].id,
                    conta_bancaria_id=cb.id,
                    recorrencia="mensal",
                )
                db.add(c)

        # Extras pontuais
        extras_pagar = [
            ("Compra de Roupas para Festa de Cosme e Damião", "Materiais Rituais", 380.00, cb_banco, date(today.year, 9, 1) if today.month <= 9 else date(today.year - 1, 9, 1)),
            ("Reforma do Telhado da Sede", "Manutenção", 1200.00, cb_banco, six_months[1] + timedelta(days=14)),
            ("Jantar de Confraternização dos Médiuns", "Alimentação / Quizila", 540.00, cb_caixa, six_months[3] + timedelta(days=5)),
        ]
        for desc, cat_nome, valor, cb, venc in extras_pagar:
            pago = venc < today
            c = ContaFinanceira(
                id=uuid.uuid4(), tenant_id=tid,
                tipo="pagar", descricao=desc, valor=valor,
                data_vencimento=venc,
                status="pago" if pago else "pendente",
                data_pagamento=venc + timedelta(days=2) if pago else None,
                valor_pago=valor if pago else None,
                categoria_id=cat_db[cat_nome].id,
                conta_bancaria_id=cb.id,
                recorrencia=None,
            )
            db.add(c)

        extras_receber = [
            ("Doação Especial — Aniversário do Terreiro", "Doações", 750.00, cb_banco, six_months[2] + timedelta(days=10)),
            ("Rifas — Festa de Iemanjá", "Eventos / Festas", 620.00, cb_caixa, six_months[4] + timedelta(days=2)),
        ]
        for desc, cat_nome, valor, cb, venc in extras_receber:
            recebido = venc < today
            c = ContaFinanceira(
                id=uuid.uuid4(), tenant_id=tid,
                tipo="receber", descricao=desc, valor=valor,
                data_vencimento=venc,
                status="pago" if recebido else "pendente",
                data_pagamento=venc + timedelta(days=1) if recebido else None,
                valor_pago=valor if recebido else None,
                categoria_id=cat_db[cat_nome].id,
                conta_bancaria_id=cb.id,
                recorrencia=None,
            )
            db.add(c)

        await db.flush()
        print("[OK] Contas financeiras criadas.")

        # ── 10. Mensalidades ──────────────────────────────────────────────────
        print("[INFO] Criando configuração e pagamentos de mensalidades...")
        cfg = MensalidadeConfig(
            id=uuid.uuid4(), tenant_id=tid,
            valor_mensal=Decimal("30.00"),
            dia_vencimento=10,
            ativo=True,
            email_relatorio_ativo=False,
            valor_mensal_associado=Decimal("25.00"),
            dia_vencimento_associado=10,
        )
        db.add(cfg)
        await db.flush()

        for med in mediuns_db:
            for mes in six_months:
                mes_ref = date(mes.year, mes.month, 1)
                mes_is_past = mes.month < today.month or mes.year < today.year
                if med.mensalidade_isento:
                    status = MensalidadeStatus.ISENTO
                    dp = None
                    vp = None
                elif mes_is_past and random.random() < 0.80:
                    status = MensalidadeStatus.PAGO
                    dp = datetime(mes.year, mes.month, random.randint(8, 15), tzinfo=timezone.utc)
                    vp = Decimal("30.00")
                else:
                    status = MensalidadeStatus.PENDENTE
                    dp = None
                    vp = None
                p = MensalidadePagamento(
                    id=uuid.uuid4(), tenant_id=tid,
                    mediun_id=med.id, mes_referencia=mes_ref,
                    status=status, data_pagamento=dp,
                    valor_vigente=Decimal("30.00"), valor_pago=vp,
                )
                db.add(p)

        for assoc in assoc_db:
            for mes in six_months:
                mes_ref = date(mes.year, mes.month, 1)
                mes_is_past = mes.month < today.month or mes.year < today.year
                if assoc.mensalidade_isento:
                    status = MensalidadeStatus.ISENTO
                    dp = None
                    vp = None
                elif mes_is_past and random.random() < 0.75:
                    status = MensalidadeStatus.PAGO
                    dp = datetime(mes.year, mes.month, random.randint(8, 18), tzinfo=timezone.utc)
                    vp = Decimal("25.00")
                else:
                    status = MensalidadeStatus.PENDENTE
                    dp = None
                    vp = None
                p = AssociadoMensalidadePagamento(
                    id=uuid.uuid4(), tenant_id=tid,
                    associado_id=assoc.id, mes_referencia=mes_ref,
                    status=status, data_pagamento=dp,
                    valor_vigente=Decimal("25.00"), valor_pago=vp,
                )
                db.add(p)

        await db.flush()
        await db.commit()
        print("[OK] Mensalidades criadas.")

    print("\n✅ Seed do Terreiro Modelo concluído com sucesso!")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
