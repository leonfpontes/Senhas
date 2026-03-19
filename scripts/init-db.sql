-- init-db.sql
-- Executado na inicialização do container PostgreSQL.
-- NÃO cria tabelas (isso é responsabilidade do Alembic).
-- Apenas habilita extensões e configura o banco.

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Configuração de timezone
SET timezone = 'America/Sao_Paulo';
