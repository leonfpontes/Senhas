"""Agendador dos lembretes e avisos por e-mail da Área do Médium (AM-15) — a cada 15 min.

Só para terreiros com a chave do piloto (`tenants.area_medium_liberada`), o plano com `area_medium`
e a Área ligada pela casa. Cada tipo só sai dentro da sua janela em Brasília
(`services/medium_lembretes.JANELAS`) e com o plano do módulo:

- mensalidade (D-29): 3 dias antes e 3 dias depois do vencimento, mês em aberto sem comprovante,
  módulo mensalidade visível e lembretes da mensalidade ligados pela casa;
- chave PIX trocada pela casa (sem a chave no e-mail), módulo mensalidade visível;
- véspera (18 h): quem está na escala (ou disse "vou") de uma atividade/gira de amanhã, com grupo e
  função; escala por função/rodízio/faxina planejada só com `escalas`, o resto com
  `atividades_corrente`;
- escala nova: entrou na escala de algo de depois de amanhã em diante (um e-mail por médium com
  tudo o que entrou);
- D-2: "Vou / Não vou" ainda sem resposta;
- ausência marcada: convite para contar o motivo dentro do prazo da casa (sem o texto do motivo);
- aviso com "Avisar por e-mail também", para o público do aviso com acesso à Área (módulo avisos);
- atividade cancelada: quem estava na escala;
- resumo diário (8 h) aos administradores: comprovantes para conferir, ausências avisadas e
  motivos novos — só contagens, um e-mail por terreiro por dia, e só quando há algo.

Preferências do médium (`medium_preferencias`) desligam cada grupo de lembretes.

**Notificação no celular (AM-16)**: cada lembrete do médium também vira push para os aparelhos em
que ele ligou as notificações (`push_inscricoes`, só do usuário ligado ao médium no terreiro), com
o liga/desliga próprio do celular (`push_<tipo>`) — e-mail e celular são independentes: o lembrete
sai se ao menos um dos dois estiver ligado, e a mesma marca vale para os dois (uma vez só). Sem as
chaves VAPID no servidor (`services/web_push.disponivel()`), só e-mail. Texto do push discreto
(`services/medium_push.py`); 404/410 do serviço de push apagam a inscrição.

**Uma vez só, mesmo com 2 workers**: advisory lock por rodada (`0x6769726168756206`) e, por baixo, a
marca `medium_lembretes_enviados` gravada com `INSERT ... ON CONFLICT DO NOTHING RETURNING` e
commitada ANTES de enfileirar (`services/medium_lembretes.reservar`). Duas rodadas ao mesmo tempo
no mesmo terreiro nunca mandam o mesmo lembrete duas vezes (teste de integração com duas sessões).
Se o processo cair entre o commit e o envio, aquele lembrete se perde (no máximo uma vez, como o
`claim_once` dos outros agendadores) — preferível a mandar em dobro.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy import select

logger = logging.getLogger(__name__)

INTERVALO_S = 15 * 60
ATRASO_INICIAL_S = 3 * 60
# A fila de e-mail é em memória e descarta acima de 500: espera esvaziar antes de pôr mais.
FILA_LIMITE = 300

Enviar = Callable[[Any], Awaitable[None]]
# Recebe a lista de `web_push.Envio` (um por aparelho) e devolve quantos foram aceitos.
EnviarPush = Callable[[list], Awaitable[int]]


async def enviar_push_padrao(envios: list) -> int:
    from src.services.web_push import enviar

    return await enviar(envios)


async def enfileirar(mensagem) -> None:
    """Envio padrão: fila de e-mail (Resend, com Brevo de reserva), sem estourar a fila."""
    from src.services.email.email_queue import EmailQueueItem, email_queue

    while email_queue.qsize() >= FILA_LIMITE:
        await asyncio.sleep(1)
    email_queue.enqueue(EmailQueueItem(message=mensagem))


@dataclass
class Pendente:
    """Um e-mail candidato: tipo, médium (None = administradores), as referências que ele cobre e
    como montar o conteúdo com as que esta rodada conseguiu reservar."""

    tipo: str
    medium_id: Optional[uuid.UUID]
    partes: list[tuple[str, Any]]
    montar: Callable[[list[Any]], Any]
    destinos: list[str] = field(default_factory=list)


class MediumLembreteScheduler:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="medium-lembrete-scheduler")
            logger.info("Medium lembrete scheduler started.")

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("Medium lembrete scheduler stopped.")

    async def _run(self) -> None:
        await asyncio.sleep(ATRASO_INICIAL_S)
        while True:
            try:
                await self.rodada()
            except Exception:  # noqa: BLE001
                logger.exception("Lembretes da Área: erro inesperado na rodada")
            await asyncio.sleep(INTERVALO_S)

    async def rodada(
        self,
        agora: Optional[datetime] = None,
        enviar: Enviar = enfileirar,
        enviar_push: EnviarPush = enviar_push_padrao,
    ) -> int:
        """Uma rodada (um worker por vez). Devolve quantos e-mails e notificações mandou."""
        from src.services.scheduler_guard import MEDIUM_LEMBRETE_LOCK_KEY, advisory_lock

        async with advisory_lock(MEDIUM_LEMBRETE_LOCK_KEY) as acquired:
            if not acquired:
                logger.info("Lembretes da Área: outra instância está processando — pulando rodada.")
                return 0
            return await processar_todos(agora, enviar, enviar_push)


async def processar_todos(
    agora: Optional[datetime] = None,
    enviar: Enviar = enfileirar,
    enviar_push: EnviarPush = enviar_push_padrao,
) -> int:
    from src.core.database import AsyncSessionLocal
    from src.core.tz import utc_now
    from src.services.medium_lembretes import terreiros_do_piloto

    agora = agora or utc_now()
    async with AsyncSessionLocal() as db:
        terreiros = await terreiros_do_piloto(db)
    total = 0
    for tenant_id in terreiros:
        try:
            total += await processar_terreiro(tenant_id, agora, enviar, enviar_push)
        except Exception:  # noqa: BLE001
            logger.exception("Lembretes da Área: falha no terreiro %s", tenant_id)
    if total:
        logger.info("Lembretes da Área: %d e-mail(s)/notificação(ões) enviado(s)", total)
    return total


async def processar_terreiro(
    tenant_id: uuid.UUID,
    agora: datetime,
    enviar: Enviar = enfileirar,
    enviar_push: EnviarPush = enviar_push_padrao,
) -> int:
    """Planeja, reserva (commit) e só então envia. Seguro para chamar em paralelo. Devolve
    e-mails + notificações (uma por aparelho) que saíram."""
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        mensagens, envios = await planejar_e_reservar(db, tenant_id, agora)
    for mensagem in mensagens:
        await enviar(mensagem)
    if envios:
        try:
            await enviar_push(envios)
        except Exception:  # noqa: BLE001 — push nunca derruba o e-mail
            logger.exception("Lembretes da Área: falha ao mandar notificações no terreiro %s", tenant_id)
    return len(mensagens) + len(envios)


async def planejar_e_reservar(db, tenant_id: uuid.UUID, agora: datetime) -> tuple[list, list]:
    """Tudo o que o terreiro tem para mandar agora, já reservado (commit feito). Devolve as
    `EmailMessage` prontas e os `web_push.Envio` (um por aparelho)."""
    from src.core.config import settings
    from src.core.public_links import area_medium_link, descadastro_link, public_tenant_logo_url
    from src.models import Tenant, TenantConfig
    from src.models.medium_lembretes import PREFERENCIA_DO_TIPO, TIPO_RESUMO_ADMIN
    from src.repositories.subscription_repo import SubscriptionRepository
    from src.services import medium_lembretes as lm
    from src.services.email.base import EmailMessage
    from src.services.email.templates import medium_lembretes as tpl
    from src.services.medium_area import get_area_medium_config, modulos_visiveis
    from src.services import medium_push, web_push
    from src.services.plan_features import get_effective_plan_features

    tenant = (
        await db.execute(
            select(Tenant).where(
                Tenant.id == tenant_id,
                Tenant.area_medium_liberada.is_(True),
                Tenant.is_active.is_(True),
                Tenant.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if tenant is None:
        return [], []
    features = get_effective_plan_features(await SubscriptionRepository(db).get_by_tenant(tenant_id))
    if not features.area_medium:
        return [], []
    area = await get_area_medium_config(db, tenant_id)
    if not area.ativa:
        return [], []
    modulos = modulos_visiveis(area, features.mensalidade_mediun)
    config = (
        await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()
    base = settings.FRONTEND_URL
    visual = tpl.VisualTerreiro(
        nome=tenant.name,
        cor=config.primary_color if config is not None and config.primary_color else "#4f46e5",
        logo_url=public_tenant_logo_url(base, config),
    )
    terreiro = tenant.name
    hoje = lm.local(agora).date()

    dest = await lm.destinatarios(db, tenant_id)
    prefs = await lm.preferencias_do_terreiro(db, tenant_id)
    inscricoes = await web_push.inscricoes_do_terreiro(db, tenant_id) if web_push.disponivel() else {}
    pendentes: list[Pendente] = []

    def quer_email(medium_id: uuid.UUID, tipo: str) -> bool:
        return medium_id in dest and lm.preferencia_ligada(prefs.get(medium_id), tipo)

    def quer_push(medium_id: uuid.UUID, tipo: str) -> bool:
        return medium_id in dest and medium_id in inscricoes and lm.preferencia_push_ligada(prefs.get(medium_id), tipo)

    def quer(medium_id: uuid.UUID, tipo: str) -> bool:
        return quer_email(medium_id, tipo) or quer_push(medium_id, tipo)

    def item_de(p: lm.ParticipacaoLembrete) -> tpl.ItemAtividade:
        return tpl.ItemAtividade(
            titulo=p.titulo,
            quando=lm.quando_legivel(p.inicio),
            local=p.local,
            grupo=p.grupo,
            funcao=p.funcao,
            link=area_medium_link(base, f"/agenda/{p.origem}/{p.ref_id}"),
        )

    def plano_ok(p: lm.ParticipacaoLembrete) -> bool:
        return lm.plano_permite(p.escala, features.escalas, features.atividades_corrente)

    # ── Mensalidade (D-29) e troca da chave PIX ─────────────────────────────
    if "mensalidade" in modulos:
        if await lm.lembrete_mensalidade_ligado(db, tenant_id):
            for m in await lm.mensalidades_a_lembrar(db, tenant_id, hoje, dest):
                if not lm.janela_aberta(m.tipo, agora) or not quer(m.medium_id, m.tipo):
                    continue
                d = dest[m.medium_id]
                depois = m.tipo == lm.TIPO_MENSALIDADE_DEPOIS
                pendentes.append(
                    Pendente(
                        tipo=m.tipo,
                        medium_id=m.medium_id,
                        partes=[(m.mes.strftime("%Y-%m"), m)],
                        montar=lambda _, m=m, d=d, depois=depois: tpl.conteudo_mensalidade(
                            terreiro=terreiro,
                            nome=d.nome,
                            depois=depois,
                            mes_label=lm.mes_legivel(m.mes),
                            valor=lm.valor_legivel(m.valor),
                            vencimento=lm.data_legivel(m.vencimento),
                            link=area_medium_link(base, "/mensalidade" if depois else "/mensalidade?pagar=1"),
                        ),
                    )
                )
        trocou = await lm.troca_do_pix(db, tenant_id, agora)
        if trocou is not None and lm.janela_aberta(lm.TIPO_PIX_ALTERADO, agora):
            ref = trocou.isoformat(timespec="seconds")
            quando = lm.data_legivel(lm.local(trocou).date())
            for medium_id, d in dest.items():
                if d.isento or not quer(medium_id, lm.TIPO_PIX_ALTERADO):
                    continue
                pendentes.append(
                    Pendente(
                        tipo=lm.TIPO_PIX_ALTERADO,
                        medium_id=medium_id,
                        partes=[(ref, None)],
                        montar=lambda _, d=d: tpl.conteudo_pix_alterado(
                            terreiro=terreiro, nome=d.nome, quando=quando, link=area_medium_link(base, "/mensalidade")
                        ),
                    )
                )

    # ── Atividades e escalas ────────────────────────────────────────────────
    if features.atividades_corrente or features.escalas:
        amanha = hoje + timedelta(days=1)
        futuras = await lm.participacoes(
            db, tenant_id, inicio_de=lm.inicio_do_dia(hoje), inicio_ate=agora + timedelta(days=120)
        )
        futuras = [p for p in futuras if plano_ok(p)]

        if lm.janela_aberta(lm.TIPO_VESPERA, agora):
            for p in futuras:
                if lm.para_vespera(p, amanha) and quer(p.medium_id, lm.TIPO_VESPERA):
                    d = dest[p.medium_id]
                    pendentes.append(
                        Pendente(
                            tipo=lm.TIPO_VESPERA,
                            medium_id=p.medium_id,
                            partes=[(str(p.atividade_id), p)],
                            montar=lambda _, p=p, d=d: tpl.conteudo_vespera(
                                terreiro=terreiro, nome=d.nome, item=item_de(p), na_escala=p.convocado
                            ),
                        )
                    )

        if lm.janela_aberta(lm.TIPO_CONFIRMACAO, agora):
            dia = hoje + timedelta(days=lm.DIAS_CONFIRMACAO)
            for p in futuras:
                if lm.para_confirmacao(p, dia, agora) and quer(p.medium_id, lm.TIPO_CONFIRMACAO):
                    d = dest[p.medium_id]
                    pendentes.append(
                        Pendente(
                            tipo=lm.TIPO_CONFIRMACAO,
                            medium_id=p.medium_id,
                            partes=[(str(p.atividade_id), p)],
                            montar=lambda _, p=p, d=d: tpl.conteudo_confirmacao(
                                terreiro=terreiro, nome=d.nome, item=item_de(p)
                            ),
                        )
                    )

        if lm.janela_aberta(lm.TIPO_ESCALA_NOVA, agora):
            por_medium: dict[uuid.UUID, list] = {}
            for p in futuras:
                if lm.para_escala_nova(p, hoje, agora) and quer(p.medium_id, lm.TIPO_ESCALA_NOVA):
                    por_medium.setdefault(p.medium_id, []).append(p)
            for medium_id, lista in por_medium.items():
                d = dest[medium_id]
                pendentes.append(
                    Pendente(
                        tipo=lm.TIPO_ESCALA_NOVA,
                        medium_id=medium_id,
                        partes=[(str(p.atividade_id), p) for p in lista],
                        montar=lambda reservadas, d=d: tpl.conteudo_escala_nova(
                            terreiro=terreiro,
                            nome=d.nome,
                            itens=[item_de(p) for p in reservadas],
                            link=area_medium_link(base, "/presencas"),
                        ),
                    )
                )

        if lm.janela_aberta(lm.TIPO_CANCELADA, agora):
            canceladas = await lm.participacoes(
                db,
                tenant_id,
                inicio_de=agora,
                inicio_ate=agora + timedelta(days=366),
                canceladas_desde=agora - lm.JANELA_EVENTO,
            )
            for p in canceladas:
                if plano_ok(p) and lm.para_cancelada(p, agora) and quer(p.medium_id, lm.TIPO_CANCELADA):
                    d = dest[p.medium_id]
                    pendentes.append(
                        Pendente(
                            tipo=lm.TIPO_CANCELADA,
                            medium_id=p.medium_id,
                            partes=[(str(p.atividade_id), p)],
                            montar=lambda _, p=p, d=d: tpl.conteudo_cancelada(
                                terreiro=terreiro, nome=d.nome, item=item_de(p), motivo=p.cancelamento_motivo
                            ),
                        )
                    )

        if features.atividades_corrente and lm.janela_aberta(lm.TIPO_FALTA, agora):
            from src.services.presenca import config_presenca

            _, prazo_dias = await config_presenca(db, tenant_id)
            passadas = await lm.participacoes(db, tenant_id, inicio_de=agora - lm.HORIZONTE_FALTA, inicio_ate=agora)
            for p in passadas:
                if not plano_ok(p) or not quer(p.medium_id, lm.TIPO_FALTA):
                    continue
                prazo = lm.para_falta(p, hoje, agora, prazo_dias)
                if prazo is None:
                    continue
                d = dest[p.medium_id]
                pendentes.append(
                    Pendente(
                        tipo=lm.TIPO_FALTA,
                        medium_id=p.medium_id,
                        partes=[(str(p.atividade_id), p)],
                        montar=lambda _, p=p, d=d, prazo=prazo: tpl.conteudo_falta(
                            terreiro=terreiro,
                            nome=d.nome,
                            item=item_de(p),
                            prazo=lm.data_legivel(prazo),
                            link=area_medium_link(base, "/presencas"),
                        ),
                    )
                )

    # ── Avisos com "Avisar por e-mail também" ───────────────────────────────
    if "avisos" in modulos and lm.janela_aberta(lm.TIPO_AVISO, agora):
        from src.services.comunicados import medium_no_publico
        from src.services.corrente_grupos import membros_por_medium

        avisos = await lm.avisos_para_email(db, tenant_id, agora)
        grupos = await membros_por_medium(db, tenant_id) if avisos else {}
        for aviso in avisos:
            for medium_id, d in dest.items():
                if not medium_no_publico(aviso.publico, d.is_atendimento, grupos.get(medium_id, frozenset()), aviso.grupos):
                    continue
                if not quer(medium_id, lm.TIPO_AVISO):
                    continue
                pendentes.append(
                    Pendente(
                        tipo=lm.TIPO_AVISO,
                        medium_id=medium_id,
                        partes=[(str(aviso.id), aviso)],
                        montar=lambda _, aviso=aviso, d=d: tpl.conteudo_aviso(
                            terreiro=terreiro,
                            nome=d.nome,
                            titulo=aviso.titulo,
                            texto=aviso.corpo,
                            link=area_medium_link(base, f"/avisos/{aviso.id}"),
                        ),
                    )
                )

    # ── Resumo diário dos administradores ───────────────────────────────────
    if lm.janela_aberta(TIPO_RESUMO_ADMIN, agora):
        resumo = await lm.resumo_admin(
            db,
            tenant_id,
            agora,
            com_mensalidade="mensalidade" in modulos,
            com_presenca=features.atividades_corrente,
        )
        admins = await lm.emails_dos_admins(db, tenant_id) if not resumo.vazio else []
        if admins:
            pendentes.append(
                Pendente(
                    tipo=TIPO_RESUMO_ADMIN,
                    medium_id=None,
                    partes=[(hoje.isoformat(), resumo)],
                    destinos=admins,
                    montar=lambda _, resumo=resumo: tpl.conteudo_resumo_admin(
                        terreiro=terreiro,
                        comprovantes=resumo.comprovantes,
                        ausencias=resumo.ausencias,
                        motivos=resumo.motivos,
                        link_comprovantes=base.rstrip("/") + "/admin/financeiro/mensalidades",
                        link_atividades=base.rstrip("/") + "/admin/atividades",
                    ),
                )
            )

    if not pendentes:
        return [], []

    # ── Reserva (ordem fixa: duas rodadas em paralelo travam na mesma ordem, sem deadlock) ──
    pendentes.sort(key=lambda x: (x.tipo, str(x.medium_id or ""), x.partes[0][0]))
    prontos: list[tuple[Pendente, list[Any]]] = []
    for pend in pendentes:
        reservadas = [
            payload
            for ref, payload in sorted(pend.partes, key=lambda par: par[0])
            if await lm.reservar(db, tenant_id, pend.tipo, ref, pend.medium_id)
        ]
        if reservadas:
            prontos.append((pend, reservadas))
    tokens: dict[uuid.UUID, str] = {}
    for pend, _ in prontos:
        if pend.medium_id is not None and pend.medium_id not in tokens and quer_email(pend.medium_id, pend.tipo):
            tokens[pend.medium_id] = (await lm.garantir_preferencia(db, tenant_id, pend.medium_id)).token_descadastro
    await db.commit()

    mensagens = []
    envios: list[web_push.Envio] = []
    for pend, reservadas in prontos:
        if pend.medium_id is not None and quer_push(pend.medium_id, pend.tipo):
            notificacao = medium_push.notificacao(pend.tipo, terreiro, reservadas)
            if notificacao is not None:
                envios.extend(
                    web_push.Envio(i.id, tenant_id, i.endpoint, i.p256dh, i.auth, notificacao)
                    for i in inscricoes[pend.medium_id]
                )
        if pend.medium_id is not None and not quer_email(pend.medium_id, pend.tipo):
            continue
        conteudo = pend.montar(reservadas)
        links = None
        destinos = pend.destinos
        if pend.medium_id is not None:
            token = tokens[pend.medium_id]
            preferencia = PREFERENCIA_DO_TIPO[pend.tipo]
            links = tpl.LinksDescadastro(
                tipo=descadastro_link(base, token, preferencia),
                todos=descadastro_link(base, token, "todos"),
                rotulo_tipo=lm.ROTULO_PREFERENCIA[preferencia],
            )
            destinos = [dest[pend.medium_id].email]
        html = tpl.render_html(conteudo, visual, links)
        texto = tpl.render_texto(conteudo, visual, links)
        for email in destinos:
            mensagens.append(EmailMessage(to_email=email, subject=conteudo.assunto, html_body=html, text_body=texto))
    return mensagens, envios


medium_lembrete_scheduler = MediumLembreteScheduler()
