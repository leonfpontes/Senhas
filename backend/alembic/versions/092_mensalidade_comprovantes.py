"""Pagamento parcial da mensalidade — vários comprovantes por mês (decisão do dono de 09/10).

Tabela nova `mensalidade_comprovantes` (colunas "enum" são texto com CHECK, minúsculas): cada
comprovante enviado para um mês (`pagamento_id` → `mensalidade_pagamentos`), com o arquivo
(BYTEA + nome + tipo + tamanho), quem enviou (`origem` medium | painel, `enviado_por`,
`enviado_em`), o valor que o médium disse ter pago (`valor_informado`, opcional), a conferência
da casa (`status` em_conferencia | conferido | nao_confirmado, `valor_conferido`,
`conferido_por/_em`) e o `motivo` quando não confirmado. Índice parcial da fila "Comprovantes
para conferir" (`status = 'em_conferencia'`).

Migração de dados: cada `mensalidade_pagamentos` com arquivo no slot único vira UM comprovante:
- enviado pela Área (`comprovante_enviado_em` preenchido) → origem `medium`, enviado por
  `comprovante_enviado_por`; senão → origem `painel`, enviado por `registrado_por`, enviado em
  `data_pagamento`/`updated_at`;
- mês PAGO → `conferido` (sem `valor_conferido`: o `valor_pago` do registro continua sendo o
  total do mês); recusado depois do envio → `nao_confirmado` com o motivo; enviado pela Área num
  mês PENDENTE → `em_conferencia`; o resto (anexo do painel, mês isento) → `conferido`.

As colunas antigas (`comprovante_data/_filename/_mime`, `comprovante_enviado_em/_por`,
`recusa_motivo`, `recusado_em`) FICAM, sem escrita nova a partir daqui (o código lê a tabela
nova; o download antigo cai no slot só para registro sem comprovante na tabela). Saem num PR
futuro, depois de um ciclo em produção.

Downgrade: devolve ao slot único o comprovante MAIS RECENTE de cada mês (arquivo, envio pela
Área, recusa) e apaga a tabela — os comprovantes anteriores do mês se perdem.

Revision ID: 092_mensalidade_comprovantes
Revises: 091_mensalidade_gateway
Create Date: 2026-10-09
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "092_mensalidade_comprovantes"
down_revision: str = "091_mensalidade_gateway"
branch_labels = None
depends_on = None

ORIGENS = ("medium", "painel")
STATUS = ("em_conferencia", "conferido", "nao_confirmado")


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


def upgrade() -> None:
    op.create_table(
        "mensalidade_comprovantes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "pagamento_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("mensalidade_pagamentos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "mediun_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("origem", sa.String(10), nullable=False, server_default="medium"),
        sa.Column(
            "enviado_por",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_mensalidade_comprovantes_enviado_por"),
            nullable=True,
        ),
        sa.Column("enviado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("arquivo_data", postgresql.BYTEA(), nullable=False),
        sa.Column("arquivo_filename", sa.String(255), nullable=False),
        sa.Column("arquivo_mime", sa.String(50), nullable=False),
        sa.Column("arquivo_tamanho", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valor_informado", sa.Numeric(10, 2), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="em_conferencia"),
        sa.Column("valor_conferido", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "conferido_por",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_mensalidade_comprovantes_conferido_por"),
            nullable=True,
        ),
        sa.Column("conferido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(_in("origem", ORIGENS), name="ck_mensalidade_comprovantes_origem"),
        sa.CheckConstraint(_in("status", STATUS), name="ck_mensalidade_comprovantes_status"),
        sa.CheckConstraint(
            "valor_informado IS NULL OR valor_informado > 0", name="ck_mensalidade_comprovantes_valor_informado"
        ),
        sa.CheckConstraint(
            "valor_conferido IS NULL OR valor_conferido > 0", name="ck_mensalidade_comprovantes_valor_conferido"
        ),
    )
    op.create_index("ix_mensalidade_comprovantes_pagamento", "mensalidade_comprovantes", ["pagamento_id"])
    op.create_index(
        "ix_mensalidade_comprovantes_tenant_mediun", "mensalidade_comprovantes", ["tenant_id", "mediun_id"]
    )
    op.create_index(
        "ix_mensalidade_comprovantes_conferir",
        "mensalidade_comprovantes",
        ["tenant_id", "enviado_em"],
        postgresql_where=sa.text("status = 'em_conferencia'"),
    )

    # Slot único → um comprovante por registro que tinha arquivo.
    op.execute(
        """
        INSERT INTO mensalidade_comprovantes (
            id, tenant_id, pagamento_id, mediun_id, origem, enviado_por, enviado_em,
            arquivo_data, arquivo_filename, arquivo_mime, arquivo_tamanho,
            status, conferido_em, motivo, created_at, updated_at
        )
        SELECT
            gen_random_uuid(), p.tenant_id, p.id, p.mediun_id,
            CASE WHEN p.comprovante_enviado_em IS NOT NULL THEN 'medium' ELSE 'painel' END,
            CASE WHEN p.comprovante_enviado_em IS NOT NULL THEN p.comprovante_enviado_por ELSE p.registrado_por END,
            COALESCE(p.comprovante_enviado_em, p.data_pagamento, p.updated_at, now()),
            p.comprovante_data,
            COALESCE(NULLIF(p.comprovante_filename, ''), 'comprovante'),
            COALESCE(NULLIF(p.comprovante_mime, ''), 'application/octet-stream'),
            octet_length(p.comprovante_data),
            CASE
                WHEN p.status = 'PAGO' THEN 'conferido'
                WHEN p.recusado_em IS NOT NULL
                     AND (p.comprovante_enviado_em IS NULL OR p.recusado_em >= p.comprovante_enviado_em)
                    THEN 'nao_confirmado'
                WHEN p.comprovante_enviado_em IS NOT NULL AND p.status = 'PENDENTE' THEN 'em_conferencia'
                ELSE 'conferido'
            END,
            CASE
                WHEN p.status = 'PAGO' THEN p.data_pagamento
                WHEN p.recusado_em IS NOT NULL
                     AND (p.comprovante_enviado_em IS NULL OR p.recusado_em >= p.comprovante_enviado_em)
                    THEN p.recusado_em
                ELSE NULL
            END,
            CASE
                WHEN p.status <> 'PAGO' AND p.recusado_em IS NOT NULL
                     AND (p.comprovante_enviado_em IS NULL OR p.recusado_em >= p.comprovante_enviado_em)
                    THEN p.recusa_motivo
                ELSE NULL
            END,
            now(), now()
        FROM mensalidade_pagamentos p
        WHERE p.comprovante_data IS NOT NULL
        """
    )


def downgrade() -> None:
    # O mais recente de cada mês volta ao slot único (os anteriores se perdem).
    op.execute(
        """
        UPDATE mensalidade_pagamentos p SET
            comprovante_data = c.arquivo_data,
            comprovante_filename = c.arquivo_filename,
            comprovante_mime = c.arquivo_mime,
            comprovante_enviado_em = CASE WHEN c.origem = 'medium' THEN c.enviado_em ELSE p.comprovante_enviado_em END,
            comprovante_enviado_por = CASE WHEN c.origem = 'medium' THEN c.enviado_por ELSE p.comprovante_enviado_por END,
            recusado_em = CASE WHEN c.status = 'nao_confirmado' THEN c.conferido_em ELSE NULL END,
            recusa_motivo = CASE WHEN c.status = 'nao_confirmado' THEN c.motivo ELSE NULL END
        FROM (
            SELECT DISTINCT ON (pagamento_id) *
            FROM mensalidade_comprovantes
            ORDER BY pagamento_id, enviado_em DESC, created_at DESC
        ) c
        WHERE c.pagamento_id = p.id
        """
    )
    op.drop_index("ix_mensalidade_comprovantes_conferir", table_name="mensalidade_comprovantes")
    op.drop_index("ix_mensalidade_comprovantes_tenant_mediun", table_name="mensalidade_comprovantes")
    op.drop_index("ix_mensalidade_comprovantes_pagamento", table_name="mensalidade_comprovantes")
    op.drop_table("mensalidade_comprovantes")
