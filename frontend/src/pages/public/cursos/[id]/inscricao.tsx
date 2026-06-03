/**
 * Página pública de inscrição em curso presencial.
 * Acesso: /public/cursos/[id]/inscricao
 * Sem autenticação — qualquer pessoa pode acessar via link.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import type { GetServerSideProps } from "next";
import styles from "./inscricao.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CursoPublico {
  id: string;
  titulo: string;
  ementa: string | null;
  data_inicio: string;
  data_fim: string | null;
  local: string | null;
  max_participantes: number | null;
  vagas_restantes: number | null;
  valor_mensalidade_padrao: number | null;
  gerar_mensalidade: boolean;
  is_active: boolean;
  observacoes: string | null;
  tenant_nome: string;
  tenant_primary_color: string;
  tenant_secondary_color: string;
  tenant_logo_url: string | null;
  tenant_endereco: string | null;
}

interface FormState {
  nome: string;
  email: string;
  celular: string;
  data_nascimento: string;
  observacoes: string;
  aceita_uso_dados: boolean;
  aceita_uso_imagem: boolean;
}

interface InscricaoResult {
  id: string;
  nome: string;
  email: string;
  curso_titulo: string;
  data_inicio: string;
  valor_mensalidade: number | null;
  mensagem: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const fmtDateShort = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const fmtBRL = (val: number | null | undefined): string => {
  if (val == null) return "";
  return Number(val).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const maskPhone = (value: string): string => {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 11)
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return d;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function InscricaoCursoPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  const [curso, setCurso] = useState<CursoPublico | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const [form, setForm] = useState<FormState>({
    nome: "",
    email: "",
    celular: "",
    data_nascimento: "",
    observacoes: "",
    aceita_uso_dados: false,
    aceita_uso_imagem: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<InscricaoResult | null>(null);

  // ── Fetch course data ──
  const fetchCurso = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/v1/public/cursos/${id}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data: CursoPublico = await res.json();
      setCurso(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCurso();
  }, [fetchCurso]);

  // ── Apply tenant CSS custom property ──
  useEffect(() => {
    if (curso) {
      document.documentElement.style.setProperty(
        "--primary",
        curso.tenant_primary_color
      );
    }
  }, [curso]);

  // ── Form helpers ──
  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const validate = (): string | null => {
    if (!form.nome.trim() || form.nome.trim().length < 3)
      return "Nome completo é obrigatório (mínimo 3 caracteres).";
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email.trim() || !emailRx.test(form.email))
      return "Informe um e-mail válido.";
    if (!form.aceita_uso_dados)
      return "É necessário aceitar o uso dos seus dados pessoais (LGPD).";
    if (!form.aceita_uso_imagem)
      return "É necessário autorizar o uso de imagem e gravações.";
    return null;
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        celular: form.celular
          ? form.celular.replace(/\D/g, "")
          : null,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes || null,
        aceita_uso_dados: form.aceita_uso_dados,
        aceita_uso_imagem: form.aceita_uso_imagem,
      };
      const res = await fetch(
        `/api/v1/public/cursos/${id}/inscricao`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail =
          data?.detail ||
          (res.status === 409
            ? "Este e-mail já está inscrito neste curso."
            : "Erro ao realizar inscrição. Tente novamente.");
        setError(detail);
        return;
      }
      const result: InscricaoResult = await res.json();
      setSuccess(result);
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived state ──
  const primary = curso?.tenant_primary_color || "#4f46e5";
  const secondary = curso?.tenant_secondary_color || "#818cf8";
  const gradient = `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`;
  const isLotado =
    curso?.max_participantes != null &&
    curso.vagas_restantes != null &&
    curso.vagas_restantes <= 0;
  const vagasPct =
    curso?.max_participantes && curso.vagas_restantes != null
      ? Math.round(
          ((curso.max_participantes - curso.vagas_restantes) /
            curso.max_participantes) *
            100
        )
      : null;

  // ───────────────────────────────────────────────────────────────────────────
  // Loading state
  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.spinner} />
      </div>
    );
  }

  // Not found
  if (notFound || !curso) {
    return (
      <div className={styles.loadingWrapper}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h2 style={{ margin: "0 0 8px", color: "#111827" }}>
            Curso não encontrado
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Este link pode estar expirado ou o curso pode ter sido encerrado.
          </p>
        </div>
      </div>
    );
  }

  // ─── Success state ────────────────────────────────────────────────────────
  if (success) {
    return (
      <>
        <Head>
          <title>Inscrição Confirmada — {curso.titulo}</title>
        </Head>
        <div
          className={styles.successWrapper}
          style={{ background: `linear-gradient(160deg, ${primary}18 0%, #f0f2f5 100%)` }}
        >
          <div className={styles.successCard}>
            <div
              className={styles.successIcon}
              style={{ background: `${primary}18` }}
            >
              ✅
            </div>
            <h1 className={styles.successTitle}>Inscrição Confirmada!</h1>
            <p className={styles.successSubtitle}>
              Você está inscrito(a) no curso abaixo.
            </p>

            <div className={styles.successDetails}>
              <div className={styles.successDetailRow}>
                <span className={styles.successDetailLabel}>Curso</span>
                <span style={{ fontWeight: 600 }}>{success.curso_titulo}</span>
              </div>
              <div className={styles.successDetailRow}>
                <span className={styles.successDetailLabel}>Participante</span>
                <span>{success.nome}</span>
              </div>
              <div className={styles.successDetailRow}>
                <span className={styles.successDetailLabel}>E-mail</span>
                <span>{success.email}</span>
              </div>
              <div className={styles.successDetailRow}>
                <span className={styles.successDetailLabel}>Início</span>
                <span>{fmtDate(success.data_inicio)}</span>
              </div>
              {success.valor_mensalidade != null && (
                <div className={styles.successDetailRow}>
                  <span className={styles.successDetailLabel}>Mensalidade</span>
                  <span style={{ fontWeight: 700, color: primary }}>
                    {fmtBRL(success.valor_mensalidade)}/mês
                  </span>
                </div>
              )}
            </div>

            <p className={styles.successMessage}>{success.mensagem}</p>

            <button
              style={{
                background: gradient,
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "14px 32px",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
                width: "100%",
              }}
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: curso.titulo,
                    text: `Confira o curso "${curso.titulo}"!`,
                    url: window.location.href,
                  });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Link copiado!");
                }
              }}
            >
              📤 Compartilhar este curso
            </button>
          </div>
        </div>
      </>
    );
  }

  // ─── Main page ────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>
          {curso.titulo} — {curso.tenant_nome}
        </title>
        <meta
          name="description"
          content={
            curso.ementa ||
            `Inscreva-se no curso ${curso.titulo} promovido por ${curso.tenant_nome}`
          }
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={styles.page}>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <div
            className={styles.heroBg}
            style={{ background: gradient }}
          />
          <div className={styles.heroOverlay} />
          <div className={styles.heroContent}>
            {/* Logo */}
            {curso.tenant_logo_url && !logoError ? (
              <img
                src={curso.tenant_logo_url}
                alt={curso.tenant_nome}
                className={styles.tenantLogo}
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className={styles.tenantLogoFallback}>
                {curso.tenant_nome.charAt(0).toUpperCase()}
              </div>
            )}

            <p className={styles.tenantName}>{curso.tenant_nome}</p>

            {/* Status badge */}
            {isLotado ? (
              <span className={`${styles.statusBadge} ${styles.statusFull}`}>
                🔒 Vagas Esgotadas
              </span>
            ) : (
              <span className={`${styles.statusBadge} ${styles.statusOpen}`}>
                ✅ Inscrições Abertas
              </span>
            )}

            <h1 className={styles.courseTitle}>{curso.titulo}</h1>

            <div className={styles.heroBadgeRow}>
              {curso.data_inicio && (
                <span className={styles.heroBadge}>
                  📅 {fmtDateShort(curso.data_inicio)}
                </span>
              )}
              {curso.data_fim && (
                <span className={styles.heroBadge}>
                  🏁 {fmtDateShort(curso.data_fim)}
                </span>
              )}
              {curso.local && (
                <span className={styles.heroBadge}>📍 {curso.local}</span>
              )}
              {curso.max_participantes && (
                <span className={styles.heroBadge}>
                  👥 {curso.max_participantes} vagas
                </span>
              )}
              {curso.gerar_mensalidade && curso.valor_mensalidade_padrao != null && (
                <span className={styles.heroBadge}>
                  💳 {fmtBRL(curso.valor_mensalidade_padrao)}/mês
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── Body ── */}
        <div className={styles.body}>
          {/* ── Course details card ── */}
          <div className={styles.infoCard}>
            <p className={styles.infoCardTitle}>Detalhes do Curso</p>
            <div className={styles.infoGrid}>
              {curso.data_inicio && (
                <div className={styles.infoItem}>
                  <span className={styles.infoIcon}>📅</span>
                  <div>
                    <p className={styles.infoLabel}>Início</p>
                    <p className={styles.infoValue}>{fmtDate(curso.data_inicio)}</p>
                  </div>
                </div>
              )}
              {curso.data_fim && (
                <div className={styles.infoItem}>
                  <span className={styles.infoIcon}>🏁</span>
                  <div>
                    <p className={styles.infoLabel}>Término</p>
                    <p className={styles.infoValue}>{fmtDate(curso.data_fim)}</p>
                  </div>
                </div>
              )}
              {curso.local && (
                <div className={styles.infoItem}>
                  <span className={styles.infoIcon}>📍</span>
                  <div>
                    <p className={styles.infoLabel}>Local</p>
                    <p className={styles.infoValue}>{curso.local}</p>
                  </div>
                </div>
              )}
              {curso.tenant_endereco && (
                <div className={styles.infoItem}>
                  <span className={styles.infoIcon}>🏛️</span>
                  <div>
                    <p className={styles.infoLabel}>Endereço</p>
                    <p className={styles.infoValue}>{curso.tenant_endereco}</p>
                  </div>
                </div>
              )}
              {curso.max_participantes != null && (
                <div className={styles.infoItem}>
                  <span className={styles.infoIcon}>👥</span>
                  <div>
                    <p className={styles.infoLabel}>Vagas</p>
                    <p className={styles.infoValue}>
                      {curso.vagas_restantes != null
                        ? `${curso.vagas_restantes} de ${curso.max_participantes} disponíveis`
                        : `${curso.max_participantes} no total`}
                    </p>
                  </div>
                </div>
              )}
              {curso.gerar_mensalidade && curso.valor_mensalidade_padrao != null && (
                <div className={styles.infoItem}>
                  <span className={styles.infoIcon}>💳</span>
                  <div>
                    <p className={styles.infoLabel}>Mensalidade</p>
                    <p className={styles.infoValue} style={{ color: primary }}>
                      {fmtBRL(curso.valor_mensalidade_padrao)}/mês
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Vagas progress bar */}
            {vagasPct != null && (
              <div className={styles.vagasBar}>
                <div className={styles.vagasHeader}>
                  <span>Preenchimento de vagas</span>
                  <span>{vagasPct}%</span>
                </div>
                <div className={styles.vagasTrack}>
                  <div
                    className={styles.vagasFill}
                    style={{
                      width: `${vagasPct}%`,
                      background:
                        vagasPct >= 90
                          ? "#ef4444"
                          : vagasPct >= 70
                          ? "#f59e0b"
                          : primary,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Ementa ── */}
          {curso.ementa && (
            <div className={styles.infoCard}>
              <p className={styles.infoCardTitle}>Sobre o Curso</p>
              <p className={styles.ementaText}>{curso.ementa}</p>
            </div>
          )}

          {/* ── Observações ── */}
          {curso.observacoes && (
            <div className={styles.infoCard}>
              <p className={styles.infoCardTitle}>Informações Adicionais</p>
              <p className={styles.ementaText}>{curso.observacoes}</p>
            </div>
          )}

          {/* ── Lotado state ── */}
          {isLotado ? (
            <div className={styles.lotadoCard}>
              <div className={styles.lotadoIcon}>😔</div>
              <h2 className={styles.lotadoTitle}>Vagas Esgotadas</h2>
              <p className={styles.lotadoText}>
                Todas as vagas para este curso já foram preenchidas.
                Entre em contato com o terreiro para verificar possibilidades.
              </p>
              {curso.tenant_endereco && (
                <p style={{ marginTop: 16, fontSize: 14, color: "#6b7280" }}>
                  📍 {curso.tenant_endereco}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* ── Registration form ── */}
              <form onSubmit={handleSubmit}>
                <div className={styles.formCard}>
                  <h2 className={styles.formTitle}>Formulário de Inscrição</h2>
                  <p className={styles.formSubtitle}>
                    Preencha seus dados para se inscrever em{" "}
                    <strong>{curso.titulo}</strong>.
                  </p>

                  {error && (
                    <div className={`${styles.alert} ${styles.alertError}`}>
                      ❌ {error}
                    </div>
                  )}

                  <div className={styles.formGrid}>
                    {/* Nome */}
                    <div
                      className={styles.formGroup}
                      style={{ gridColumn: "1 / -1" }}
                    >
                      <label className={styles.label} htmlFor="nome">
                        Nome Completo *
                      </label>
                      <input
                        id="nome"
                        type="text"
                        className={styles.input}
                        placeholder="Ex.: Maria da Silva"
                        value={form.nome}
                        onChange={(e) => setField("nome", e.target.value)}
                        disabled={submitting}
                        maxLength={255}
                        autoComplete="name"
                      />
                    </div>

                    {/* E-mail */}
                    <div className={styles.formGroup}>
                      <label className={styles.label} htmlFor="email">
                        E-mail *
                      </label>
                      <input
                        id="email"
                        type="email"
                        className={styles.input}
                        placeholder="Ex.: maria@email.com"
                        value={form.email}
                        onChange={(e) => setField("email", e.target.value)}
                        disabled={submitting}
                        autoComplete="email"
                      />
                    </div>

                    {/* Celular */}
                    <div className={styles.formGroup}>
                      <label className={styles.label} htmlFor="celular">
                        Celular
                        <span className={styles.labelOptional}>(opcional)</span>
                      </label>
                      <input
                        id="celular"
                        type="tel"
                        className={styles.input}
                        placeholder="(11) 99999-9999"
                        value={form.celular}
                        onChange={(e) =>
                          setField("celular", maskPhone(e.target.value))
                        }
                        disabled={submitting}
                        autoComplete="tel"
                        maxLength={16}
                      />
                    </div>

                    {/* Data de Nascimento */}
                    <div className={styles.formGroup}>
                      <label className={styles.label} htmlFor="data_nasc">
                        Data de Nascimento
                        <span className={styles.labelOptional}>(opcional)</span>
                      </label>
                      <input
                        id="data_nasc"
                        type="date"
                        className={styles.input}
                        value={form.data_nascimento}
                        onChange={(e) =>
                          setField("data_nascimento", e.target.value)
                        }
                        disabled={submitting}
                        max={new Date().toISOString().substring(0, 10)}
                      />
                    </div>

                    {/* Mensalidade info (read-only) */}
                    {curso.gerar_mensalidade &&
                      curso.valor_mensalidade_padrao != null && (
                        <div
                          className={styles.formGroup}
                          style={{ gridColumn: "1 / -1" }}
                        >
                          <label className={styles.label}>
                            Valor da Mensalidade
                          </label>
                          <div className={styles.valorInfo}>
                            <span style={{ fontSize: 20 }}>💳</span>
                            <div>
                              <p
                                style={{
                                  margin: 0,
                                  fontWeight: 700,
                                  color: primary,
                                }}
                              >
                                {fmtBRL(curso.valor_mensalidade_padrao)}/mês
                              </p>
                              <p
                                className={styles.valorInfoLabel}
                                style={{ margin: 0 }}
                              >
                                Este valor será cobrado mensalmente durante o
                                período do curso.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Observações */}
                    <div
                      className={styles.formGroup}
                      style={{ gridColumn: "1 / -1" }}
                    >
                      <label className={styles.label} htmlFor="obs">
                        Observações
                        <span className={styles.labelOptional}>(opcional)</span>
                      </label>
                      <textarea
                        id="obs"
                        className={styles.textarea}
                        placeholder="Dúvidas, necessidades especiais ou informações adicionais..."
                        value={form.observacoes}
                        onChange={(e) =>
                          setField("observacoes", e.target.value)
                        }
                        disabled={submitting}
                        maxLength={1000}
                      />
                    </div>
                  </div>
                </div>

                {/* ── LGPD Consent ── */}
                <div className={styles.lgpdCard}>
                  <p className={styles.lgpdTitle}>
                    🔒 Autorização e Consentimento (LGPD)
                  </p>

                  {/* Dados pessoais */}
                  <div className={styles.lgpdItem}>
                    <input
                      id="aceita_dados"
                      type="checkbox"
                      className={styles.lgpdCheckbox}
                      checked={form.aceita_uso_dados}
                      onChange={(e) =>
                        setField("aceita_uso_dados", e.target.checked)
                      }
                      style={{ accentColor: primary }}
                    />
                    <label htmlFor="aceita_dados" className={styles.lgpdText}>
                      <strong>Autorizo o uso dos meus dados pessoais</strong>{" "}
                      (nome, e-mail, celular e data de nascimento) para fins de
                      gestão da minha participação neste curso, conforme a{" "}
                      <strong>
                        Lei Geral de Proteção de Dados (LGPD – Lei
                        13.709/2018)
                      </strong>
                      . Meus dados serão utilizados exclusivamente pelo{" "}
                      <strong>{curso.tenant_nome}</strong> e não serão
                      compartilhados com terceiros. *
                    </label>
                  </div>

                  {/* Imagem e gravações */}
                  <div className={styles.lgpdItem}>
                    <input
                      id="aceita_imagem"
                      type="checkbox"
                      className={styles.lgpdCheckbox}
                      checked={form.aceita_uso_imagem}
                      onChange={(e) =>
                        setField("aceita_uso_imagem", e.target.checked)
                      }
                      style={{ accentColor: primary }}
                    />
                    <label htmlFor="aceita_imagem" className={styles.lgpdText}>
                      <strong>
                        Autorizo o uso da minha imagem e voz
                      </strong>{" "}
                      em fotografias e gravações em vídeo/áudio realizadas
                      durante o curso <strong>{curso.titulo}</strong>, para fins
                      de registro e divulgação institucional do{" "}
                      <strong>{curso.tenant_nome}</strong>, incluindo redes
                      sociais e materiais educativos. *
                    </label>
                  </div>
                </div>

                {/* ── Submit button ── */}
                <button
                  type="submit"
                  disabled={submitting}
                  className={styles.submitBtn}
                  style={{ background: submitting ? "#9ca3af" : gradient }}
                >
                  {submitting ? (
                    <>
                      <span
                        className={styles.spinner}
                        style={{
                          width: 20,
                          height: 20,
                          borderTopColor: "#fff",
                          borderColor: "rgba(255,255,255,0.3)",
                          borderWidth: 3,
                        }}
                      />
                      Enviando inscrição...
                    </>
                  ) : (
                    "✅ Confirmar Inscrição"
                  )}
                </button>
              </form>
            </>
          )}

          {/* ── Footer ── */}
          <footer className={styles.footer}>
            <p>
              © {new Date().getFullYear()} {curso.tenant_nome} &nbsp;·&nbsp;
              Desenvolvido com{" "}
              <a
                href="https://girahub.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.footerLink}
              >
                GiraHub
              </a>
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
