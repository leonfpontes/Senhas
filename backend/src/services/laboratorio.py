"""Laboratório das betas (jornadas v2, decisão do dono 01/11/2026).

A plataforma marca o terreiro como beta tester (`tenants.beta_tester`); a casa liga ou desliga cada
beta em Configurações › Laboratório. Cada beta ligada é uma linha em `feature_flags` com a chave
`beta_<nome>`. Uma beta só vale com as duas coisas: o terreiro beta tester **e** a beta ligada.
Desligar não apaga o que a casa registrou com ela. Documentação: `docs/betas/`.

O catálogo é a fonte única: a tela do Laboratório, a checagem `beta_ligada` e a página pública
(`betas_ligadas`) leem daqui.
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import FeatureFlag, Tenant


@dataclass(frozen=True)
class Beta:
    chave: str
    nome: str
    descricao: str
    grupo: str
    nota: str  # caminho da documentação no repositório


CATALOGO: tuple[Beta, ...] = (
    Beta("beta_receber_senha_de_novo", "Receber a senha de novo",
         "O consulente pede o bilhete de novo no link da gira, e ele chega só no e-mail.", "Para o consulente",
         "docs/betas/beta_receber_senha_de_novo.md"),
    Beta("beta_bilhete_offline", "Bilhete sem internet",
         "O bilhete fica guardado no celular e abre no portão sem sinal.", "Para o consulente",
         "docs/betas/beta_bilhete_offline.md"),
    Beta("beta_senha_para_outra_pessoa", "Senha para outra pessoa",
         "Quem preenche pega a senha de quem vai, e a senha chega no e-mail de quem preencheu.", "Para o consulente",
         "docs/betas/beta_senha_para_outra_pessoa.md"),
    Beta("beta_repetir_gira", "Repetir a gira em outra data",
         "Cria a mesma gira, com as mesmas senhas, em outro dia.", "Para a gira", "docs/betas/beta_repetir_gira.md"),
    Beta("beta_cartaz_portao", "Cartaz do portão",
         "PDF com o QR do link do terreiro, para imprimir e colar no portão.", "Para a gira", "docs/betas/beta_cartaz_portao.md"),
    Beta("beta_lembrete_dia_gira", "Lembrete no dia da gira",
         "Um e-mail pela manhã para quem tem senha, com o horário da gira.", "Para a gira", "docs/betas/beta_lembrete_dia_gira.md"),
    Beta("beta_avisar_exclusao_gira", "Avisar quem tem senha quando a gira é excluída",
         "Ao excluir, a casa pode mandar um e-mail para quem já pegou senha.", "Para a gira",
         "docs/betas/beta_avisar_exclusao_gira.md"),
    Beta("beta_retorno_consulente", "Retorno do consulente na porta",
         "Quem chama a senha anota que a pessoa precisa voltar com um médium ou uma entidade; nas giras "
         "seguintes, a Porta mostra o recado na senha dela até alguém marcar como resolvido.", "Para a porta",
         "docs/betas/beta_retorno_consulente.md"),
    Beta("beta_menu_ajustavel", "Menu que se ajusta ao uso",
         "O que a casa já usa sobe para o menu, em \"Da casa\"; cada pessoa põe ou tira módulos na página Módulos.",
         "Para o painel", "docs/betas/beta_menu_ajustavel.md"),
    Beta("beta_indicacao_plano", "Indicação do plano pelo uso",
         "Em Conta e plano, uma frase com o uso do mês (giras e médiuns) diz qual plano dá conta.",
         "Para o painel", "docs/betas/beta_indicacao_plano.md"),
)
CHAVES = {b.chave for b in CATALOGO}


async def eh_beta_tester(db: AsyncSession, tenant_id: UUID) -> bool:
    return bool(await db.scalar(select(Tenant.beta_tester).where(Tenant.id == tenant_id)))


async def betas_ligadas(db: AsyncSession, tenant_id: UUID) -> set[str]:
    """Chaves das betas que valem para o terreiro (beta tester e ligadas). Vazio se não é beta tester."""
    if not await eh_beta_tester(db, tenant_id):
        return set()
    rows = await db.scalars(
        select(FeatureFlag.feature).where(
            FeatureFlag.tenant_id == tenant_id,
            FeatureFlag.enabled.is_(True),
            FeatureFlag.feature.in_(CHAVES),
        )
    )
    return set(rows)


async def beta_ligada(db: AsyncSession, tenant_id: UUID, chave: str) -> bool:
    return chave in await betas_ligadas(db, tenant_id)


# ─── Beta "Menu que se ajusta ao uso": os módulos que a casa já usa (têm dado) ──────────────
# A regra do desenho (J1 v2 · 11): módulo com dado sobe sozinho para "Da casa". As chaves são as
# de frontend/src/constants/modulos.ts. Cada consulta filtra pelo tenant recebido e só pergunta
# se existe ao menos uma linha (LIMIT 1), sem contar.
async def modulos_com_dado(db: AsyncSession, tenant_id: UUID) -> list[str]:
    from sqlalchemy import select

    from src.models.associados import Associado
    from src.models.atividades import Atividade
    from src.models.comunicados import Comunicado
    from src.models.contas_financeiras import ContaFinanceira
    from src.models.cursos_presenciais import CursoPresencial
    from src.models.estoque import EstoqueItem
    from src.models.materiais import MaterialCorrente
    from src.models.medium_convites import MediumConvite
    from src.models.mediuns import Medium
    from src.models.mensalidades import MensalidadePagamento
    from src.models.site import TenantSite
    from src.models.tickets import Ticket, TicketStatus

    consultas = {
        "mediuns": select(Medium.id).where(Medium.tenant_id == tenant_id),
        "area-medium": select(MediumConvite.id).where(MediumConvite.tenant_id == tenant_id),
        "avisos": select(Comunicado.id).where(Comunicado.tenant_id == tenant_id),
        "estudos": select(MaterialCorrente.id).where(MaterialCorrente.tenant_id == tenant_id),
        "atividades": select(Atividade.id).where(Atividade.tenant_id == tenant_id),
        "mensalidades": select(MensalidadePagamento.id).where(MensalidadePagamento.tenant_id == tenant_id),
        "site": select(TenantSite.id).where(TenantSite.tenant_id == tenant_id),
        "associados": select(Associado.id).where(Associado.tenant_id == tenant_id),
        "financeiro": select(ContaFinanceira.id).where(ContaFinanceira.tenant_id == tenant_id),
        "estoque": select(EstoqueItem.id).where(EstoqueItem.tenant_id == tenant_id),
        "relatorio": select(Ticket.id).where(Ticket.tenant_id == tenant_id, Ticket.status == TicketStatus.COMPLETED),
    }
    usados = []
    for chave, consulta in consultas.items():
        if (await db.execute(consulta.limit(1))).first() is not None:
            usados.append(chave)
    # Cursos contam como "Site e cursos".
    if "site" not in usados:
        if (await db.execute(select(CursoPresencial.id).where(CursoPresencial.tenant_id == tenant_id).limit(1))).first():
            usados.append("site")
    return usados
