#!/usr/bin/env python3
"""Seed completo para o tenant terreiro-modelo em produção.

Gera 6 meses de dados realistas cobrindo todas as funcionalidades:
  - Médiuns e Cambones
  - Associados com mensalidades
  - Consulentes
  - Giras passadas (concluídas), em andamento e futuras com tickets reais
  - Cursos presenciais com alunos e mensalidades
  - Estoque (grupos, itens, movimentações)
  - Contas Financeiras completas (categorias, contas bancárias, pagar/receber)
  - Mensalidades médiuns e associados
  - Grupos de permissão com perfis realistas

Uso: docker exec senhas-backend python scripts/seed_terreiro_modelo.py
"""
import asyncio
import uuid
import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

import sys
sys.path.insert(0, "/app")

from src.core.config import settings
from src.models import (
    Tenant, Medium, Associado, Consulente, Gira, Ticket, SenhaControl,
    EstoqueGrupo, EstoqueItem, EstoqueMovimentacao,
    CategoriaFinanceira, ContaBancaria, ContaFinanceira,
    MensalidadeConfig, MensalidadePagamento, AssociadoMensalidadePagamento,
)
from src.models.cursos_presenciais import (
    CursoPresencial, CursoParticipante, CursoParticipantePagamento,
)
from src.models.permission_groups import PermissionGroup, GroupPermission, PermissionFeature
from src.models.tickets import TicketStatus
from src.models.estoque import EstoqueMovimentacaoTipo
from src.models.mensalidades import MensalidadeStatus

TENANT_SLUG = "terreiro-modelo"
TODAY = date.today()
NOW = datetime.now(tz=timezone.utc)

# ─── dados ────────────────────────────────────────────────────────────────────

MEDIUNS = [
    ("Mãe Aparecida de Oxum",        True,  False, "(11) 99901-0001", "aparecida@terreiro.org",   date(1968, 3, 14)),
    ("Pai José de Ogum",              True,  False, "(11) 99901-0002", "jose.ogum@terreiro.org",   date(1955, 7, 22)),
    ("Irmão Ricardo de Xangô",        True,  False, "(11) 99901-0003", "ricardo@terreiro.org",     date(1980, 11, 5)),
    ("Irmã Fernanda de Iemanjá",      True,  False, "(11) 99901-0004", "fernanda@terreiro.org",    date(1985, 2, 28)),
    ("Filha Ana Luiza de Oxóssi",     True,  False, "(11) 99901-0005", "analuiza@terreiro.org",    date(1992, 6, 18)),
    ("Filho Marcos de Exu",           True,  False, "(11) 99901-0006", "marcos@terreiro.org",      date(1978, 9, 3)),
    ("Irmã Claudia de Nanã",          True,  False, "(11) 99901-0007", "claudia@terreiro.org",     date(1975, 1, 15)),
    ("Filho Bruno de Omolu",          True,  False, "(11) 99901-0008", "bruno@terreiro.org",       date(1990, 4, 7)),
    ("Irmã Patrícia de Oxum",         True,  False, "(11) 99901-0009", "patricia@terreiro.org",    date(1983, 8, 25)),
    ("Filho Thiago de Iansã",         True,  False, "(11) 99901-0010", "thiago@terreiro.org",      date(1995, 12, 11)),
    ("Filho Leandro de Caboclo",      True,  False, "(11) 99901-0015", "leandro@terreiro.org",     date(1987, 6, 30)),
    ("Cambone Carlos",                False, False, "(11) 99901-0011", None,                       date(1970, 5, 20)),
    ("Cambone Silvia",                False, False, "(11) 99901-0012", None,                       date(1988, 10, 3)),
    ("Cambone Eduardo",               False, False, "(11) 99901-0013", None,                       date(1982, 7, 14)),
    ("Cambone Renata",                False, True,  "(11) 99901-0014", None,                       date(1993, 3, 9)),
]

ASSOCIADOS = [
    ("Maria das Graças Silva",    "maria.gracas@email.com",    "(11) 98888-0001", False),
    ("João Batista Oliveira",     "joao.batista@email.com",    "(11) 98888-0002", False),
    ("Ana Paula Ferreira",        "ana.paula@email.com",       "(11) 98888-0003", False),
    ("Carlos Alberto Santos",     "carlos.santos@email.com",   "(11) 98888-0004", False),
    ("Lúcia Mendes Costa",        "lucia.mendes@email.com",    "(11) 98888-0005", False),
    ("Roberto Souza Lima",        "roberto.souza@email.com",   "(11) 98888-0006", False),
    ("Fernanda Alves Rocha",      "fernanda.alves@email.com",  "(11) 98888-0007", False),
    ("Paulo Roberto Martins",     "paulo.martins@email.com",   "(11) 98888-0008", False),
    ("Claudia Regina Nunes",      "claudia.nunes@email.com",   "(11) 98888-0009", False),
    ("Antônio José Pereira",      "antonio.pereira@email.com", "(11) 98888-0010", False),
    ("Sandra Cristina Dias",      "sandra.dias@email.com",     "(11) 98888-0011", False),
    ("Marcelo Henrique Gomes",    "marcelo.gomes@email.com",   "(11) 98888-0012", False),
    ("Rosangela Farias Pinto",    "rosangela@email.com",       "(11) 98888-0013", False),
    ("Eduardo Luiz Barbosa",      "edu.barbosa@email.com",     "(11) 98888-0014", False),
    ("Vera Lucia Corrêa",         "vera.correa@email.com",     "(11) 98888-0015", True),  # isento
    ("Fabio Augusto Ribeiro",     "fabio.ribeiro@email.com",   "(11) 98888-0016", False),
    ("Simone Aparecida Carvalho", "simone.carvalho@email.com", "(11) 98888-0017", False),
    ("Rodrigo de Souza Melo",     "rodrigo.melo@email.com",    "(11) 98888-0018", False),
    ("Tânia Maria Nogueira",      "tania.nogueira@email.com",  "(11) 98888-0019", False),
    ("Wagner Ferreira Cruz",      "wagner.cruz@email.com",     "(11) 98888-0020", False),
    ("Adriana Lopes Vieira",      "adriana.vieira@email.com",  "(11) 98888-0021", False),
    ("Luiz Fernando Teixeira",    "luizf.teixeira@email.com",  "(11) 98888-0022", False),
    ("Patricia Helena Moura",     "patricia.moura@email.com",  "(11) 98888-0023", False),
    ("Gilberto Santos Ramos",     "gilberto.ramos@email.com",  "(11) 98888-0024", False),
    ("Cristiane Lima Araujo",     "cristiane.araujo@email.com","(11) 98888-0025", False),
    ("Marcio Andrade Freitas",    "marcio.freitas@email.com",  "(11) 98888-0026", False),
    ("Eliane Rodrigues Braga",    "eliane.braga@email.com",    "(11) 98888-0027", False),
    ("Davi Nascimento Cunha",     "davi.cunha@email.com",      "(11) 98888-0028", False),
    ("Ivone Cardoso Monteiro",    "ivone.monteiro@email.com",  "(11) 98888-0029", True),  # isento
    ("Flávio de Camargo Pires",   "flavio.pires@email.com",    "(11) 98888-0030", False),
]

CONSULENTES_NOMES = [
    "Aline Borges","Bruno Takahashi","Carmen Silveira","Daniel Mota","Estela Vaz",
    "Felipe Correa","Giovanna Castro","Henrique Fonseca","Ingrid Cavalcante","Jorge Paixão",
    "Karina Melo","Leonardo Dias","Marina Rios","Nelson Freire","Olga Rezende",
    "Pedro Assis","Quintina Luz","Renato Cunha","Sabrina Pacheco","Tiago Andrade",
    "Ursula Brandt","Victor Abreu","Wanda Goulart","Xisto Lima","Yasmin Torres",
    "Zuleica Barros","Amanda Queiroz","Bernardo Neves","Celina Duarte","Diego Faria",
    "Erika Campos","Francisco Lago","Graça Pimentel","Hugo Borba","Irene Leal",
    "Joaquim Sena","Keila Muniz","Luan Vianna","Marcia Costa","Nilton Paiva",
    "Octavia Rocha","Plinio Souza","Rachel Matos","Sergio Brum","Teresa Fontes",
    "Ulisses Machado","Valeria Maia","Wanderson Brito","Ximena Salgado","Yuri Azevedo",
    "Zilda Ramos","Andre Magno","Beatriz Furtado","Caio Lima","Denise Araujo",
    "Emilio Costa","Fatima Leite","Gustavo Almeida","Haydee Mendes","Ivan Roza",
    "Jacira Fernandes","Klaus Werner","Ligia Prado","Manuel Pinheiro","Nadia Alves",
    "Osvaldo Gomes","Paula Meirelles","Rita Coelho","Samuel Torres","Talita Bentes",
    "Ubiratan Neto","Viviane Gama","William Santos","Yolande Felix","Zelia Moura",
    "Alceu Pires","Benedita Lopes","Candido Fraga","Dalva Esteves","Ednaldo Bastos",
    "Francisca Lima","Geraldo Mota","Helena Braga","Ivo Correia","Jaqueline Paz",
    "Kelvin Rocha","Livia Andrade","Murilo Costa","Nathalia Vaz","Orlando Reis",
    "Priscila Alves","Quirino Santos","Rosana Lima","Silvio Moura","Tania Peres",
    "Umberto Braga","Valentina Cruz","Wendell Figo","Xandra Luz","Yago Monteiro",
    "Zeila Barros","Altair Souza","Bruna Guedes","Celso Barão","Dilma Ramos",
    "Euclidio Melo","Fatima Borba","Gerson Alves","Helena Moura","Isadora Lins",
    "Julio Fonseca","Kezia Santos","Lauro Campos","Miriam Costa","Nilza Braga",
    "Orlando Cunha","Paulinho Reis","Queli Matos","Rui Pinto","Selma Araujo",
]

GIRAS_PASSADAS_NOMES = [
    "Gira de Preto Velho",
    "Gira de Exu e Pombagira",
    "Gira de Caboclo",
    "Gira de Ogum",
    "Gira de Iemanjá",
    "Gira de Oxum",
    "Gira de Xangô",
    "Gira de Nanã",
    "Gira de Oxóssi",
    "Gira Especial — Festejo de Cosme e Damião",
]

# ─── helpers ──────────────────────────────────────────────────────────────────

def utc(d: date, hour: int = 19, minute: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=timezone.utc)

def next_weekday(from_date: date, weekday: int) -> date:
    """Next occurrence of weekday (0=Mon … 5=Sat … 6=Sun) from from_date (exclusive)."""
    days_ahead = weekday - from_date.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return from_date + timedelta(days=days_ahead)

def past_saturdays(n: int) -> list[date]:
    """Returns last n Saturdays before today, oldest first."""
    sats = []
    d = TODAY
    while len(sats) < n:
        d = d - timedelta(days=1)
        if d.weekday() == 5:
            sats.append(d)
    return list(reversed(sats))

def future_saturdays(n: int) -> list[date]:
    """Returns next n Saturdays from today, ascending."""
    sats = []
    d = TODAY
    while len(sats) < n:
        d = d + timedelta(days=1)
        if d.weekday() == 5:
            sats.append(d)
    return sats

def months_back(n: int) -> list[date]:
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

# ─── main ─────────────────────────────────────────────────────────────────────

async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        # 1. Localiza tenant
        result = await db.execute(select(Tenant).where(Tenant.slug == TENANT_SLUG))
        tenant = result.scalar_one_or_none()
        if not tenant:
            print(f"[ERRO] Tenant '{TENANT_SLUG}' não encontrado.")
            return
        tid = tenant.id
        print(f"[OK] Tenant: {tenant.name} ({tid})")

        # 2. Limpa dados existentes
        print("[INFO] Limpando dados anteriores...")
        for tbl in [
            "curso_participante_pagamentos","curso_participantes","cursos_presenciais",
            "estoque_movimentacoes","estoque_itens","estoque_grupos",
            "mensalidade_pagamentos","associado_mensalidade_pagamentos","mensalidade_configs",
            "contas_financeiras","categorias_financeiras","contas_bancarias",
            "tickets","senha_controls","giras",
            "consulentes","associados","mediuns",
            "user_group_memberships","group_permissions","permission_groups",
        ]:
            await db.execute(text(f"DELETE FROM {tbl} WHERE tenant_id = '{tid}'"))
        await db.commit()
        print("[OK] Dados anteriores removidos.")

        # ── 3. Médiuns ────────────────────────────────────────────────────────
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
        cambones      = [m for m in mediuns_db if not m.is_atendimento]
        print(f"[OK] {len(mediuns_db)} médiuns criados.")

        # ── 4. Associados ─────────────────────────────────────────────────────
        assoc_db = []
        for nome, email, tel, isento in ASSOCIADOS:
            a = Associado(
                id=uuid.uuid4(), tenant_id=tid,
                nome=nome, email=email,
                email_normalized=email.lower(),
                telefone=tel,
                mensalidade_isento=isento,
            )
            db.add(a)
            assoc_db.append(a)
        await db.flush()
        print(f"[OK] {len(assoc_db)} associados criados.")

        # ── 5. Consulentes ────────────────────────────────────────────────────
        cons_db = []
        for i, nome in enumerate(CONSULENTES_NOMES):
            c = Consulente(
                id=uuid.uuid4(), tenant_id=tid,
                nome=nome,
                email=f"consulente{i+1:03d}@example.com",
                email_normalized=f"consulente{i+1:03d}@example.com",
                telefone=f"(11) 9{i+1:04d}-{(i*7+1337)%9999:04d}",
            )
            db.add(c)
            cons_db.append(c)
        await db.flush()
        print(f"[OK] {len(cons_db)} consulentes criados.")

        # ── 6. Giras ──────────────────────────────────────────────────────────
        print("[INFO] Criando giras e tickets...")
        total_tickets = 0

        # 6a. Passadas: últimos 10 sábados → todas encerradas, tickets concluídos
        sats_passados = past_saturdays(10)
        for i, sat in enumerate(sats_passados):
            nome_gira = GIRAS_PASSADAS_NOMES[i % len(GIRAS_PASSADAS_NOMES)]
            gira = Gira(
                id=uuid.uuid4(), tenant_id=tid,
                nome=nome_gira,
                descricao=f"Gira realizada no Terreiro Modelo em {sat.strftime('%d/%m/%Y')}.",
                data_inicio=utc(sat, 19, 0),
                data_fim=utc(sat, 22, 30),
                local="Terreiro Modelo — Rua das Flores, 123, São Paulo/SP",
                is_active=False,
                max_tickets=50,
                release_start_at=utc(sat - timedelta(days=7), 8, 0),
                release_end_at=utc(sat, 18, 0),
            )
            db.add(gira)
            await db.flush()

            n_tickets = random.randint(28, 46)
            consulentes_gira = random.sample(cons_db, min(n_tickets, len(cons_db)))
            for numero, consulente in enumerate(consulentes_gira, start=1):
                r = random.random()
                if r < 0.76:
                    status = TicketStatus.COMPLETED
                    chamado = utc(sat, 19, 15) + timedelta(minutes=numero * 7)
                    finaliz = chamado + timedelta(minutes=random.randint(15, 40))
                elif r < 0.88:
                    status = TicketStatus.NO_SHOW
                    chamado = utc(sat, 19, 15) + timedelta(minutes=numero * 7)
                    finaliz = None
                elif r < 0.95:
                    status = TicketStatus.CALLED
                    chamado = utc(sat, 19, 15) + timedelta(minutes=numero * 7)
                    finaliz = None
                else:
                    status = TicketStatus.CANCELLED
                    chamado = None
                    finaliz = None
                med = random.choice(mediuns_atend)
                cam = random.choice(cambones)
                t = Ticket(
                    id=uuid.uuid4(), tenant_id=tid,
                    gira_id=gira.id, consulente_id=consulente.id,
                    numero=numero, status=status,
                    chamado_em=chamado,
                    finalizado_em=finaliz,
                    atendido_em=finaliz,
                    medium_nome=med.nome if status == TicketStatus.COMPLETED else None,
                    cambone_nome=cam.nome if status == TicketStatus.COMPLETED else None,
                    checkin_em=utc(sat, 18, 0) + timedelta(minutes=numero*2) if status != TicketStatus.CANCELLED else None,
                    is_sponsor=numero <= 2,
                    is_walk_in=random.random() < 0.08,
                )
                db.add(t)
                total_tickets += 1
        await db.flush()

        # 6b. Próximo sábado — gira aberta, senhas emitidas (pré-reserva real)
        sat_prox = future_saturdays(1)[0]
        gira_prox = Gira(
            id=uuid.uuid4(), tenant_id=tid,
            nome="Gira de Iansã — Julho",
            descricao="Gira mensal dedicada a Iansã. Senhas com pré-reserva online.",
            data_inicio=utc(sat_prox, 19, 0),
            data_fim=utc(sat_prox, 22, 30),
            local="Terreiro Modelo — Rua das Flores, 123, São Paulo/SP",
            is_active=True,
            max_tickets=50,
            release_start_at=utc(sat_prox - timedelta(days=7), 8, 0),
            release_end_at=utc(sat_prox, 18, 0),
        )
        db.add(gira_prox)
        await db.flush()

        # Senhas pré-emitidas: 35 pessoas já pegaram senha
        consulentes_prox = random.sample(cons_db, 35)
        for numero, consulente in enumerate(consulentes_prox, start=1):
            t = Ticket(
                id=uuid.uuid4(), tenant_id=tid,
                gira_id=gira_prox.id, consulente_id=consulente.id,
                numero=numero,
                status=TicketStatus.EMITTED,
                is_sponsor=numero <= 3,
                is_walk_in=False,
            )
            db.add(t)
            total_tickets += 1
        await db.flush()

        # 6c. Daqui 2 semanas — gira criada, sem senhas ainda (abertura em breve)
        sat_fut2 = future_saturdays(2)[1]
        gira_fut2 = Gira(
            id=uuid.uuid4(), tenant_id=tid,
            nome="Gira de Omolu — Julho",
            descricao="Segunda gira de julho. Emissão de senhas abre 7 dias antes.",
            data_inicio=utc(sat_fut2, 19, 0),
            data_fim=utc(sat_fut2, 22, 30),
            local="Terreiro Modelo — Rua das Flores, 123, São Paulo/SP",
            is_active=True,
            max_tickets=50,
            release_start_at=utc(sat_fut2 - timedelta(days=7), 8, 0),
            release_end_at=utc(sat_fut2, 18, 0),
        )
        db.add(gira_fut2)
        await db.flush()

        # 6d. Próximo mês — 2 giras agendadas, ainda sem senhas
        sats_agosto = future_saturdays(4)[2:4]
        nomes_agosto = ["Gira de Xangô — Agosto", "Gira de Exu e Pombagira — Agosto"]
        for sat, nome in zip(sats_agosto, nomes_agosto):
            gf = Gira(
                id=uuid.uuid4(), tenant_id=tid,
                nome=nome,
                descricao="Gira programada para agosto. Senhas abertas 7 dias antes.",
                data_inicio=utc(sat, 19, 0),
                data_fim=utc(sat, 22, 30),
                local="Terreiro Modelo — Rua das Flores, 123, São Paulo/SP",
                is_active=True,
                max_tickets=50,
                release_start_at=utc(sat - timedelta(days=7), 8, 0),
                release_end_at=utc(sat, 18, 0),
            )
            db.add(gf)
        await db.flush()

        print(f"[OK] Giras criadas. Total de tickets: {total_tickets}.")

        # ── 7. Cursos Presenciais ─────────────────────────────────────────────
        print("[INFO] Criando cursos presenciais...")

        CURSO_PARTICIPANTES = [
            ("Aline Silva Borges",    date(1995, 4, 12), "(11) 97777-0001", "aline.s@email.com",    "Feminino"),
            ("Bruno Andrade Lima",    date(1988, 9, 3),  "(11) 97777-0002", "brunoal@email.com",    "Masculino"),
            ("Camila Rocha Faria",    date(2000, 1, 20), "(11) 97777-0003", "camila.r@email.com",   "Feminino"),
            ("Daniel Souza Gomes",    date(1992, 6, 7),  "(11) 97777-0004", "daniels@email.com",    "Masculino"),
            ("Edilamar Santos Cruz",  date(1985, 11, 30),"(11) 97777-0005","edilamar@email.com",  "Feminino"),
            ("Fernando Pires Neto",   date(1979, 3, 18), "(11) 97777-0006", "fpires@email.com",     "Masculino"),
            ("Giovana Lopes Vieira",  date(1997, 7, 25), "(11) 97777-0007", "giovana.l@email.com",  "Feminino"),
            ("Henrique Costa Reis",   date(1993, 2, 14), "(11) 97777-0008", "henriquecr@email.com", "Masculino"),
            ("Isabela Mota Duarte",   date(1990, 8, 5),  "(11) 97777-0009", "isa.mota@email.com",   "Feminino"),
            ("Joelson Freitas Melo",  date(1986, 12, 22),"(11) 97777-0010","joelson@email.com",   "Masculino"),
            ("Karla Mendes Barbosa",  date(2001, 5, 9),  "(11) 97777-0011", "karla.m@email.com",    "Feminino"),
            ("Leandro Ribeiro Paiva", date(1994, 10, 3), "(11) 97777-0012", "leandro.r@email.com",  "Masculino"),
            ("Marina Alves Torres",   date(1998, 3, 28), "(11) 97777-0013", "marina.at@email.com",  "Feminino"),
            ("Nelson Campos Braga",   date(1982, 7, 16), "(11) 97777-0014", "nelson.cb@email.com",  "Masculino"),
            ("Patricia Lima Nunes",   date(1996, 1, 8),  "(11) 97777-0015", "patl@email.com",       "Feminino"),
            ("Quirino Santos Moura",  date(1975, 4, 2),  "(11) 97777-0016", "quirino.sm@email.com", "Masculino"),
            ("Renata Correia Luz",    date(1991, 9, 19), "(11) 97777-0017", "renata.cl@email.com",  "Feminino"),
            ("Sergio Borba Almeida",  date(1983, 6, 11), "(11) 97777-0018", "sergio.ba@email.com",  "Masculino"),
            ("Thais Pereira Costa",   date(1999, 2, 27), "(11) 97777-0019", "thais.pc@email.com",   "Feminino"),
            ("Ulisses Ramos Pinto",   date(1987, 8, 14), "(11) 97777-0020", "ulisses.rp@email.com", "Masculino"),
        ]

        cursos_def = [
            # (titulo, ementa, data_inicio, data_fim, max_part, valor, gerar_mens, meses_ativos)
            (
                "Curso de Fundamentos de Umbanda",
                "Introdução à história e filosofia da Umbanda. Estudo das entidades, "
                "linhas de trabalho, rituais e liturgia. Destinado a médiuns em formação e simpatizantes.",
                date(TODAY.year - 1 if TODAY.month < 4 else TODAY.year, 4, 5),
                date(TODAY.year - 1 if TODAY.month < 4 else TODAY.year, 9, 28),
                25, Decimal("80.00"), True, 6,
            ),
            (
                "Curso de Desenvolvimento Mediúnico",
                "Aprofundamento das práticas mediúnicas para médiuns já iniciados. "
                "Exercícios de incorporação, passes e desenvolvimento espiritual.",
                date(TODAY.year - 1 if TODAY.month < 2 else TODAY.year, 2, 10),
                date(TODAY.year - 1 if TODAY.month < 2 else TODAY.year, 7, 29),
                20, Decimal("100.00"), True, 6,
            ),
            (
                "Curso de Iniciação ao Candomblé",
                "Noções básicas de liturgia do Candomblé, história dos orixás e rituais. "
                "Aberto a todos os interessados.",
                date(TODAY.year, 3, 8),
                date(TODAY.year, 8, 30),
                30, Decimal("90.00"), True, 6,
            ),
            (
                "Curso de Ervas Sagradas — Turma Especial",
                "Estudo das ervas e plantas medicinais e rituais utilizadas nas práticas de "
                "Umbanda e Candomblé. Inclui aulas práticas de preparo.",
                date(TODAY.year, 7, 12),
                date(TODAY.year, 10, 25),
                15, Decimal("70.00"), True, 4,
            ),
        ]

        for c_titulo, c_ementa, c_inicio, c_fim, c_max, c_valor, c_mens, c_meses in cursos_def:
            curso_inicio_dt = datetime(c_inicio.year, c_inicio.month, c_inicio.day, 9, 0, tzinfo=timezone.utc)
            curso_fim_dt = datetime(c_fim.year, c_fim.month, c_fim.day, 12, 0, tzinfo=timezone.utc)
            is_fut = c_inicio > TODAY

            curso = CursoPresencial(
                id=uuid.uuid4(), tenant_id=tid,
                titulo=c_titulo,
                ementa=c_ementa,
                data_inicio=curso_inicio_dt,
                data_fim=curso_fim_dt,
                max_participantes=c_max,
                valor_mensalidade_padrao=c_valor,
                local="Terreiro Modelo — Salão de Estudos",
                is_active=c_fim >= TODAY,
                gerar_mensalidade=c_mens,
                tipo_formulario="completo" if "Desenvolvimento" in c_titulo else "simples",
                chave_pix="terreiro.modelo@pix.com.br",
                observacoes="Material didático incluso. Trazer caderno.",
            )
            db.add(curso)
            await db.flush()

            # Participantes: sorteia subconjunto
            n_part = random.randint(10, min(c_max, len(CURSO_PARTICIPANTES)))
            pool = random.sample(CURSO_PARTICIPANTES, n_part)
            for p_nome, p_nasc, p_cel, p_email, p_gen in pool:
                part = CursoParticipante(
                    id=uuid.uuid4(), tenant_id=tid,
                    curso_id=curso.id,
                    nome=p_nome,
                    data_nascimento=p_nasc,
                    celular=str(p_cel),
                    email=p_email,
                    genero=p_gen,
                    valor_mensalidade=c_valor,
                    pago=False,
                    cidade="São Paulo", estado="SP",
                    aceita_uso_dados=True,
                    aceita_uso_imagem=True,
                    como_conheceu_terreiro="Indicação de amigos",
                    experiencia_umbanda="Iniciante",
                )
                db.add(part)
                await db.flush()

                if not c_mens or is_fut:
                    continue

                # Mensalidades mensais do curso
                d = c_inicio
                meses_gerados = 0
                while meses_gerados < c_meses and date(d.year, d.month, 1) <= TODAY:
                    mes_ref = date(d.year, d.month, 1)
                    mes_passado = mes_ref < date(TODAY.year, TODAY.month, 1)
                    pago = mes_passado and random.random() < 0.78
                    pag = CursoParticipantePagamento(
                        id=uuid.uuid4(), tenant_id=tid,
                        participante_id=part.id,
                        mes_referencia=mes_ref,
                        status=MensalidadeStatus.PAGO if pago else MensalidadeStatus.PENDENTE,
                        data_pagamento=datetime(d.year, d.month, random.randint(5, 20), tzinfo=timezone.utc) if pago else None,
                        valor_vigente=c_valor,
                        valor_pago=c_valor if pago else None,
                    )
                    db.add(pag)
                    # Próximo mês
                    nm = d.month + 1
                    ny = d.year
                    if nm > 12:
                        nm = 1
                        ny += 1
                    d = date(ny, nm, 1)
                    meses_gerados += 1

        await db.flush()
        print("[OK] Cursos presenciais criados com participantes e mensalidades.")

        # ── 8. Estoque ────────────────────────────────────────────────────────
        print("[INFO] Criando estoque...")
        grupos_data = [
            ("Velas e Incensos", "Materiais de iluminação e defumação"),
            ("Sementes e Ervas",  "Ervas, sementes e folhas sagradas"),
            ("Tecidos e Roupas",  "Fardamento e tecidos rituais"),
            ("Utensílios Rituais","Quartinhas, guias, búzios e objetos de culto"),
            ("Alimentos e Bebidas","Oferendas e comes e bebes das festas"),
        ]
        grupos_db = []
        for nome, desc in grupos_data:
            g = EstoqueGrupo(id=uuid.uuid4(), tenant_id=tid, nome=nome, descricao=desc)
            db.add(g)
            grupos_db.append(g)
        await db.flush()

        itens_data = [
            (0, "Vela Branca 7 Dias",       "UN",  5,  12.00),
            (0, "Vela Colorida Pack 10un",   "CX",  2,  18.00),
            (0, "Incenso Sândalos",          "CX",  3,   8.00),
            (0, "Incenso Defumação Mista",   "CX",  3,  10.00),
            (1, "Arruda (ramo)",             "UN",  5,   3.50),
            (1, "Alecrim",                   "KG",  1,  14.00),
            (1, "Guiné (folhas)",            "KG",  1,  12.00),
            (1, "Alfazema",                  "KG",  1,  20.00),
            (2, "Tecido Branco (m)",         "M",   3,  18.00),
            (2, "Tecido Azul Celeste (m)",   "M",   2,  22.00),
            (2, "Faixa de Oxum",             "UN",  2,  35.00),
            (3, "Quartinha de Barro",        "UN",  2,  25.00),
            (3, "Guia de Contas Azuis",      "UN",  3,  45.00),
            (3, "Búzios para Jogo (caixa)",  "CX",  1,  80.00),
            (3, "Pemba Branca",              "UN", 10,   5.00),
            (4, "Mel (frasco 500ml)",        "UN",  5,  15.00),
            (4, "Cachaça (garrafa)",         "UN",  3,  12.00),
            (4, "Azeite de Dendê (250ml)",   "UN",  3,  14.00),
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

        six_months = months_back(6)

        # Entrada inicial de tudo
        for it in itens_db:
            db.add(EstoqueMovimentacao(
                id=uuid.uuid4(), tenant_id=tid, item_id=it.id,
                tipo=EstoqueMovimentacaoTipo.ENTRADA,
                quantidade=random.randint(20, 60),
                motivo="Estoque inicial — abertura de inventário",
                data_movimentacao=utc(six_months[0], 10, 0),
            ))

        # Saídas mensais (uso nas giras passadas)
        for sat in sats_passados:
            for it in random.sample(itens_db, random.randint(3, 6)):
                db.add(EstoqueMovimentacao(
                    id=uuid.uuid4(), tenant_id=tid, item_id=it.id,
                    tipo=EstoqueMovimentacaoTipo.SAIDA,
                    quantidade=random.randint(1, 5),
                    motivo=f"Uso na Gira de {sat.strftime('%d/%m/%Y')}",
                    data_movimentacao=utc(sat, 20, 0),
                    requisitante="Coordenação Ritual",
                ))

        # Reposições periódicas
        for mes in six_months[1:]:
            for it in random.sample(itens_db, random.randint(3, 7)):
                db.add(EstoqueMovimentacao(
                    id=uuid.uuid4(), tenant_id=tid, item_id=it.id,
                    tipo=EstoqueMovimentacaoTipo.ENTRADA,
                    quantidade=random.randint(8, 25),
                    motivo="Reposição mensal — compra fornecedor",
                    data_movimentacao=utc(mes + timedelta(days=random.randint(0, 10)), 14, 0),
                ))

        await db.flush()
        print("[OK] Estoque criado.")

        # ── 9. Financeiro ─────────────────────────────────────────────────────
        print("[INFO] Criando categorias, contas bancárias e lançamentos financeiros...")

        # Categorias
        cats_data = [
            ("Água e Esgoto",            "pagar",   "#2196F3"),
            ("Energia Elétrica",         "pagar",   "#FF9800"),
            ("Aluguel / Sede",           "pagar",   "#9C27B0"),
            ("Materiais Rituais",        "pagar",   "#4CAF50"),
            ("Manutenção e Obras",       "pagar",   "#795548"),
            ("Alimentação / Oferenda",   "pagar",   "#E91E63"),
            ("Internet e Telefone",      "pagar",   "#00BCD4"),
            ("Seguros",                  "pagar",   "#607D8B"),
            ("Serviços Terceiros",       "pagar",   "#FF5722"),
            ("Despesas Administrativas", "pagar",   "#9E9E9E"),
            ("Mensalidades Médiuns",     "receber", "#00BCD4"),
            ("Mensalidades Associados",  "receber", "#3F51B5"),
            ("Mensalidades Cursos",      "receber", "#673AB7"),
            ("Doações",                  "receber", "#8BC34A"),
            ("Eventos e Festas",         "receber", "#FF5722"),
            ("Patrocínios",              "receber", "#FFC107"),
        ]
        cat_db = {}
        for nome, tipo, cor in cats_data:
            c = CategoriaFinanceira(id=uuid.uuid4(), tenant_id=tid, nome=nome, cor=cor, tipo=tipo)
            db.add(c)
            cat_db[nome] = c
        await db.flush()

        # Contas bancárias
        cb_caixa = ContaBancaria(
            id=uuid.uuid4(), tenant_id=tid,
            nome="Caixa do Terreiro",
            banco="Dinheiro físico",
            saldo_inicial=Decimal("820.00"),
        )
        cb_bb = ContaBancaria(
            id=uuid.uuid4(), tenant_id=tid,
            nome="Conta Corrente Banco do Brasil",
            banco="Banco do Brasil",
            saldo_inicial=Decimal("3400.00"),
        )
        cb_pic = ContaBancaria(
            id=uuid.uuid4(), tenant_id=tid,
            nome="Conta PicPay / Pix",
            banco="PicPay",
            saldo_inicial=Decimal("0.00"),
        )
        for cb in [cb_caixa, cb_bb, cb_pic]:
            db.add(cb)
        await db.flush()

        def add_conta(tipo, desc, valor, venc: date, cat_nome, cb, recorrencia=None, obs=None):
            pago_data = None
            v_pago = None
            status = "pendente"
            if venc < TODAY:
                if random.random() < 0.88:
                    status = "pago"
                    pago_data = venc + timedelta(days=random.randint(0, 5))
                    v_pago = round(valor * random.uniform(0.98, 1.02), 2)
                else:
                    status = "vencido"
            db.add(ContaFinanceira(
                id=uuid.uuid4(), tenant_id=tid,
                tipo=tipo, descricao=desc, valor=round(valor, 2),
                data_vencimento=venc, status=status,
                data_pagamento=pago_data, valor_pago=v_pago,
                categoria_id=cat_db[cat_nome].id,
                conta_bancaria_id=cb.id,
                recorrencia=recorrencia, observacoes=obs,
            ))

        # Contas a pagar mensais (6 meses)
        pagar_mensais = [
            ("Água e Esgoto",            "Conta de Água — SABESP",          165.00, 10, cb_bb),
            ("Energia Elétrica",         "Conta de Luz — Enel",             320.00, 10, cb_bb),
            ("Aluguel / Sede",           "Aluguel da Sede do Terreiro",    1200.00, 5,  cb_bb),
            ("Internet e Telefone",      "Internet + Telefone — Claro",     149.90, 15, cb_bb),
            ("Serviços Terceiros",       "Serviço de Limpeza",              250.00, 20, cb_caixa),
        ]
        for mes in six_months:
            for cat, desc, valor, dia, cb in pagar_mensais:
                venc = date(mes.year, mes.month, dia)
                variacao = random.uniform(0.95, 1.08)
                add_conta("pagar", f"{desc} — {mes.strftime('%m/%Y')}", valor * variacao, venc, cat, cb, "mensal")

        # Contas a pagar pontuais
        pontuais_pagar = [
            ("Materiais Rituais",      "Compra de velas e incensos — atacado",        380.00, six_months[0] + timedelta(days=12), cb_caixa),
            ("Manutenção e Obras",     "Reforma da cobertura da sala de sessão",      1850.00, six_months[1] + timedelta(days=8),  cb_bb),
            ("Materiais Rituais",      "Aquisição de quartinhas e guias — atacado",   520.00, six_months[2] + timedelta(days=5),  cb_bb),
            ("Alimentação / Oferenda", "Compra de alimentos para Festa de Oxum",      640.00, six_months[2] + timedelta(days=18), cb_caixa),
            ("Seguros",                "Seguro anual da sede",                         780.00, six_months[3] + timedelta(days=1),  cb_bb),
            ("Despesas Administrativas","Anuidade do cartório — registro de ata",      220.00, six_months[3] + timedelta(days=15), cb_bb),
            ("Alimentação / Oferenda", "Quizila — Festa de Cosme e Damião",           430.00, six_months[4] + timedelta(days=10), cb_caixa),
            ("Materiais Rituais",      "Compra de tecidos para fardamento",           390.00, six_months[4] + timedelta(days=22), cb_caixa),
            ("Manutenção e Obras",     "Pintura externa da sede",                     1100.00, six_months[5] + timedelta(days=5),  cb_bb),
            ("Serviços Terceiros",     "Serviço de sonorização — Festa de Iemanjá",   480.00, six_months[5] + timedelta(days=20), cb_caixa),
            # Futuros
            ("Materiais Rituais",      "Compra de materiais para cursos — 2º semestre", 320.00, TODAY + timedelta(days=12), cb_caixa),
            ("Aluguel / Sede",         "Aluguel mês de agosto",                       1200.00, date(TODAY.year, TODAY.month + 1 if TODAY.month < 12 else 1, 5), cb_bb),
            ("Manutenção e Obras",     "Revisão elétrica preventiva",                  650.00, TODAY + timedelta(days=25), cb_bb),
        ]
        for cat, desc, valor, venc, cb in pontuais_pagar:
            add_conta("pagar", desc, valor, venc, cat, cb)

        # Contas a receber mensais (6 meses)
        receber_mensais = [
            ("Mensalidades Médiuns",    "Mensalidades médiuns",     380.00, 10, cb_bb),
            ("Mensalidades Associados", "Mensalidades associados",  510.00, 15, cb_bb),
            ("Mensalidades Cursos",     "Mensalidades cursos",      800.00, 20, cb_pic),
        ]
        for mes in six_months:
            for cat, desc, valor, dia, cb in receber_mensais:
                venc = date(mes.year, mes.month, dia)
                variacao = random.uniform(0.90, 1.05)
                add_conta("receber", f"{desc} — {mes.strftime('%m/%Y')}", valor * variacao, venc, cat, cb, "mensal")

        # Contas a receber pontuais
        pontuais_receber = [
            ("Doações",           "Doação especial — Aniversário do Terreiro (10 anos)", 1200.00, six_months[1] + timedelta(days=8),  cb_caixa),
            ("Eventos e Festas",  "Arrecadação com rifas — Festa de Iemanjá",            680.00,  six_months[2] + timedelta(days=20), cb_caixa),
            ("Patrocínios",       "Patrocínio de empresa local — Festa de Junho",         500.00,  six_months[2] + timedelta(days=3),  cb_bb),
            ("Doações",           "Doação anônima em dinheiro",                           350.00,  six_months[3] + timedelta(days=14), cb_caixa),
            ("Eventos e Festas",  "Venda de camisetas — Cosme e Damião",                 420.00,  six_months[4] + timedelta(days=12), cb_caixa),
            ("Patrocínios",       "Patrocínio Gira de Oxum — doação material",           280.00,  six_months[4] + timedelta(days=25), cb_bb),
            ("Doações",           "Arrecadação geral — urna de domingo",                 195.00,  six_months[5] + timedelta(days=7),  cb_caixa),
            ("Eventos e Festas",  "Inscrições Curso Ervas Sagradas — turma especial",    840.00,  TODAY + timedelta(days=3),          cb_pic),
            ("Doações",           "Campanha de doações para reforma — 2º parcela",       600.00,  TODAY + timedelta(days=18),         cb_bb),
            ("Patrocínios",       "Patrocínio Festa de Agosto",                          400.00,  TODAY + timedelta(days=35),         cb_bb),
        ]
        for cat, desc, valor, venc, cb in pontuais_receber:
            add_conta("receber", desc, valor, venc, cat, cb)

        await db.flush()
        print("[OK] Contas financeiras criadas.")

        # ── 10. Mensalidades Médiuns e Associados ─────────────────────────────
        print("[INFO] Criando mensalidades de médiuns e associados...")
        cfg = MensalidadeConfig(
            id=uuid.uuid4(), tenant_id=tid,
            valor_mensal=Decimal("35.00"),
            dia_vencimento=10, ativo=True,
            email_relatorio_ativo=False,
            valor_mensal_associado=Decimal("25.00"),
            dia_vencimento_associado=10,
        )
        db.add(cfg)
        await db.flush()

        for med in mediuns_db:
            for mes in six_months:
                mes_ref = date(mes.year, mes.month, 1)
                mes_passado = mes_ref < date(TODAY.year, TODAY.month, 1)
                if med.mensalidade_isento:
                    st, dp, vp = MensalidadeStatus.ISENTO, None, None
                elif mes_passado and random.random() < 0.83:
                    st = MensalidadeStatus.PAGO
                    dp = datetime(mes.year, mes.month, random.randint(7, 15), tzinfo=timezone.utc)
                    vp = Decimal("35.00")
                else:
                    st, dp, vp = MensalidadeStatus.PENDENTE, None, None
                db.add(MensalidadePagamento(
                    id=uuid.uuid4(), tenant_id=tid, mediun_id=med.id,
                    mes_referencia=mes_ref, status=st,
                    data_pagamento=dp, valor_vigente=Decimal("35.00"), valor_pago=vp,
                ))

        for assoc in assoc_db:
            for mes in six_months:
                mes_ref = date(mes.year, mes.month, 1)
                mes_passado = mes_ref < date(TODAY.year, TODAY.month, 1)
                if assoc.mensalidade_isento:
                    st, dp, vp = MensalidadeStatus.ISENTO, None, None
                elif mes_passado and random.random() < 0.76:
                    st = MensalidadeStatus.PAGO
                    dp = datetime(mes.year, mes.month, random.randint(8, 18), tzinfo=timezone.utc)
                    vp = Decimal("25.00")
                else:
                    st, dp, vp = MensalidadeStatus.PENDENTE, None, None
                db.add(AssociadoMensalidadePagamento(
                    id=uuid.uuid4(), tenant_id=tid, associado_id=assoc.id,
                    mes_referencia=mes_ref, status=st,
                    data_pagamento=dp, valor_vigente=Decimal("25.00"), valor_pago=vp,
                ))

        await db.flush()
        print("[OK] Mensalidades criadas.")

        # ── 11. Grupos de Permissão ───────────────────────────────────────────
        print("[INFO] Criando grupos de permissão...")

        ALL = PermissionFeature

        grupos_perm = [
            (
                "Coordenação Geral",
                "Acesso completo a todas as funcionalidades administrativas.",
                {f: (True, True, True, True) for f in ALL},
            ),
            (
                "Porteiros e Recepção",
                "Acesso à visão da porta, emissão de senhas e consulta de giras.",
                {
                    ALL.PORTA:    (True, True, True, False),
                    ALL.TICKETS:  (True, True, True, False),
                    ALL.GIRAS:    (True, False, False, False),
                    ALL.ASSOCIADOS:(True, False, False, False),
                    ALL.MEDIUNS:  (True, False, False, False),
                },
            ),
            (
                "Tesouraria",
                "Acesso ao módulo financeiro, contas a pagar/receber, estoque e relatórios.",
                {
                    ALL.FINANCEIRO:         (True, True, True, True),
                    ALL.CONTAS_FINANCEIRAS: (True, True, True, True),
                    ALL.ESTOQUE:            (True, True, True, True),
                    ALL.ANALYTICS:          (True, False, False, False),
                    ALL.RELATORIO_GIRA:     (True, False, False, False),
                    ALL.GIRAS:              (True, False, False, False),
                },
            ),
            (
                "Secretaria",
                "Gestão de médiuns, associados, giras, tickets e mensalidades.",
                {
                    ALL.GIRAS:          (True, True, True, False),
                    ALL.TICKETS:        (True, True, True, False),
                    ALL.MEDIUNS:        (True, True, True, False),
                    ALL.ASSOCIADOS:     (True, True, True, False),
                    ALL.FINANCEIRO:     (True, False, False, False),
                    ALL.RELATORIO_GIRA: (True, False, False, False),
                    ALL.ANALYTICS:      (True, False, False, False),
                },
            ),
            (
                "Equipe de Cursos",
                "Gestão de cursos presenciais, participantes e mensalidades de alunos.",
                {
                    ALL.CURSOS_PRESENCIAIS: (True, True, True, True),
                    ALL.ASSOCIADOS:         (True, False, False, False),
                    ALL.FINANCEIRO:         (True, False, False, False),
                },
            ),
            (
                "Corpo Mediúnico",
                "Acesso somente leitura às giras e visão da porta para check-in.",
                {
                    ALL.GIRAS:   (True, False, False, False),
                    ALL.PORTA:   (True, True, False, False),
                    ALL.TICKETS: (True, False, False, False),
                    ALL.MEDIUNS: (True, False, False, False),
                },
            ),
            (
                "Auditoria e Compliance",
                "Leitura de auditoria, analytics e relatórios sem permissão de escrita.",
                {
                    ALL.AUDITORIA:      (True, False, False, False),
                    ALL.ANALYTICS:      (True, False, False, False),
                    ALL.RELATORIO_GIRA: (True, False, False, False),
                    ALL.GIRAS:          (True, False, False, False),
                    ALL.FINANCEIRO:     (True, False, False, False),
                    ALL.CONTAS_FINANCEIRAS: (True, False, False, False),
                },
            ),
        ]

        for g_nome, g_desc, g_perms in grupos_perm:
            grp = PermissionGroup(
                id=uuid.uuid4(), tenant_id=tid,
                name=g_nome, description=g_desc, version=1,
            )
            db.add(grp)
            await db.flush()
            for feat, (view, insert, edit, delete) in g_perms.items():
                db.add(GroupPermission(
                    id=uuid.uuid4(), group_id=grp.id,
                    feature=feat,
                    can_view=view, can_insert=insert,
                    can_edit=edit, can_delete=delete,
                ))

        await db.flush()
        await db.commit()
        print("[OK] Grupos de permissão criados.")

    print("\n✅ Seed do Terreiro Modelo concluído com sucesso!")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
