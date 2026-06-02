-- Tabela de cursos presenciais
CREATE TABLE cursos_presenciais (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    ementa TEXT,
    data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    data_fim TIMESTAMP WITH TIME ZONE,
    max_participantes INTEGER,
    valor_mensalidade_padrao NUMERIC(10, 2),
    local VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id)
);

-- Índices para facilitar filtros e buscas
CREATE INDEX ix_cursos_presenciais_tenant_id ON cursos_presenciais (tenant_id);
CREATE INDEX ix_cursos_presenciais_data_inicio ON cursos_presenciais (data_inicio);
CREATE INDEX ix_cursos_presenciais_is_active ON cursos_presenciais (is_active);

-- Tabela de participantes
CREATE TABLE curso_participantes (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    curso_id UUID NOT NULL REFERENCES cursos_presenciais(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    data_nascimento DATE,
    celular VARCHAR(20),
    email VARCHAR(255),
    valor_mensalidade NUMERIC(10, 2),
    pago BOOLEAN NOT NULL DEFAULT FALSE,
    valor_pago NUMERIC(10, 2),
    data_pagamento TIMESTAMP WITH TIME ZONE,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id)
);

-- Índices para consultas rápidas por tenant e por curso
CREATE INDEX ix_curso_participantes_tenant_id ON curso_participantes (tenant_id);
CREATE INDEX ix_curso_participantes_curso_id ON curso_participantes (curso_id);

-- Para desfazer a migração, os comandos de downgrade removeriam os índices e as tabelas:
-- DROP INDEX ix_curso_participantes_curso_id;
-- DROP INDEX ix_curso_participantes_tenant_id;
-- DROP TABLE curso_participantes;
-- DROP INDEX ix_cursos_presenciais_is_active;
-- DROP INDEX ix_cursos_presenciais_data_inicio;
-- DROP INDEX ix_cursos_presenciais_tenant_id;
-- DROP TABLE cursos_presenciais;