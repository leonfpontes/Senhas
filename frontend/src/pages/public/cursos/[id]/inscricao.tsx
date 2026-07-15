/**
 * Página pública de inscrição em curso presencial.
 * Acesso: /public/cursos/[id]/inscricao
 * Sem autenticação — qualquer pessoa pode acessar via link.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
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
  tipo_formulario: string;
  chave_pix: string | null;
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
  
  // Complete form fields
  genero: string;
  emergencia_contato: string;
  emergencia_fone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  tem_plano_saude: boolean;
  plano_saude_nome: string;
  toma_medicamento: boolean;
  medicamentos_nome: string;
  tem_doenca_tratamento: boolean;
  doenca_tratamento_nome: string;
  tem_diabetes: boolean;
  outras_doencas: string;
  aceita_uso_dados_saude: boolean;
  cpf: string;
  rg: string;
  estado_civil: string;
  profissao: string;
  experiencia_umbanda: string;
  contato_contexto_espiritual: string;
  motivo_busca_desenvolvimento: string;
  interesse_aprendizado: string;
  ja_conhece_terreiro: string; // "Sim", "Não" or ""
  como_conheceu_terreiro: string;
  tratamento_psiquiatrico: boolean;
  tratamento_psiquiatrico_detalhes: string;
  restricoes_saude: string;
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

const maskCPF = (value: string): string => {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
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
    genero: "",
    emergencia_contato: "",
    emergencia_fone: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    tem_plano_saude: false,
    plano_saude_nome: "",
    toma_medicamento: false,
    medicamentos_nome: "",
    tem_doenca_tratamento: false,
    doenca_tratamento_nome: "",
    tem_diabetes: false,
    outras_doencas: "",
    aceita_uso_dados_saude: false,
    cpf: "",
    rg: "",
    estado_civil: "",
    profissao: "",
    experiencia_umbanda: "",
    contato_contexto_espiritual: "",
    motivo_busca_desenvolvimento: "",
    interesse_aprendizado: "",
    ja_conhece_terreiro: "",
    como_conheceu_terreiro: "",
    tratamento_psiquiatrico: false,
    tratamento_psiquiatrico_detalhes: "",
    restricoes_saude: "",
  });

  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<InscricaoResult | null>(null);

  // Complete form collapsible section states and ViaCEP search
  const [openEmergencia, setOpenEmergencia] = useState(true);
  const [openEndereco, setOpenEndereco] = useState(true);
  const [openEspiritual, setOpenEspiritual] = useState(true);
  const [openSaude, setOpenSaude] = useState(true);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");

  const lookupCep = async (rawCep: string) => {
    if (!rawCep) return;
    const digits = rawCep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepError(digits.length > 0 ? "CEP deve ter 8 dígitos" : "");
      return;
    }
    setCepError("");
    setCepLoading(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const json = await resp.json();
      if (json.erro) {
        setCepError("CEP não encontrado");
        return;
      }
      setForm((prev) => ({
        ...prev,
        cep: digits,
        logradouro: json.logradouro || "",
        bairro: json.bairro || "",
        cidade: json.localidade || "",
        estado: json.uf || "",
      }));
    } catch {
      setCepError("Erro ao consultar CEP.");
    } finally {
      setCepLoading(false);
    }
  };

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
    if (curso?.tipo_formulario === "completo" && !form.aceita_uso_dados_saude)
      return "É necessário aceitar o processamento de dados de saúde para formulários completos.";
    if (curso?.chave_pix && !comprovanteFile)
      return "O comprovante de pagamento da matrícula via PIX é obrigatório.";

    if (curso?.tipo_formulario === "completo") {
      if (!form.celular.trim()) return "WhatsApp/Celular é obrigatório.";
      if (!form.data_nascimento) return "Data de nascimento é obrigatória.";
      if (!form.genero) return "Sexo/Gênero é obrigatório.";
      if (!form.cpf.trim()) return "CPF é obrigatório.";
      if (!form.rg.trim()) return "RG é obrigatório.";
      if (!form.estado_civil) return "Estado civil é obrigatório.";
      
      // Endereço
      if (!form.cep.trim()) return "CEP é obrigatório.";
      if (!form.logradouro.trim()) return "Logradouro é obrigatório.";
      if (!form.numero.trim()) return "Número do endereço é obrigatório.";
      if (!form.bairro.trim()) return "Bairro é obrigatório.";
      if (!form.cidade.trim()) return "Cidade é obrigatória.";
      if (!form.estado.trim()) return "Estado é obrigatório.";
      
      if (!form.profissao.trim()) return "Profissão é obrigatória.";
      
      // Contatos de emergência
      if (!form.emergencia_contato.trim()) return "Nome do contato de emergência é obrigatório.";
      if (!form.emergencia_fone.trim()) return "Telefone de emergência é obrigatório.";
      
      // Perguntas espirituais
      if (!form.experiencia_umbanda) return "Por favor, responda se possui experiência com a religião de Umbanda.";
      if (!form.contato_contexto_espiritual) return "Por favor, responda se já foi ou é filho de algum contexto espiritual.";
      if (!form.motivo_busca_desenvolvimento.trim()) return "O campo 'O que te fez buscar o desenvolvimento mediúnico?' é obrigatório.";
      if (!form.interesse_aprendizado.trim()) return "O campo 'Tem interesse em algum aprendizado específico? Qual?' é obrigatório.";
      if (!form.ja_conhece_terreiro) return `Por favor, responda se já conhece o Terreiro ${curso?.tenant_nome || "Terreiro"}.`;
      if (!form.como_conheceu_terreiro.trim()) return `O campo 'Como conheceu o ${curso?.tenant_nome || "Terreiro"}?' é obrigatório.`;
      
      // Ficha Médica
      if (form.tem_plano_saude === undefined || form.tem_plano_saude === null) {
        return "Por favor, selecione se possui plano de saúde.";
      }
      if (form.tem_plano_saude === true && !form.plano_saude_nome.trim()) {
        return "Informe o nome do seu plano de saúde.";
      }
      if (form.toma_medicamento === undefined || form.toma_medicamento === null) {
        return "Por favor, selecione se toma medicamentos controlados.";
      }
      if (form.toma_medicamento === true && !form.medicamentos_nome.trim()) {
        return "Especifique os medicamentos controlados que você toma.";
      }
      if (form.tem_doenca_tratamento === undefined || form.tem_doenca_tratamento === null) {
        return "Por favor, selecione se faz algum tratamento de saúde.";
      }
      if (form.tem_doenca_tratamento === true && !form.doenca_tratamento_nome.trim()) {
        return "Especifique o tratamento de saúde que você realiza.";
      }
      if (form.tem_diabetes === undefined || form.tem_diabetes === null) {
        return "Por favor, selecione se possui diabetes.";
      }
      if (form.tratamento_psiquiatrico === undefined || form.tratamento_psiquiatrico === null) {
        return "Por favor, selecione se faz acompanhamento psiquiátrico.";
      }
      if (form.tratamento_psiquiatrico === true && !form.tratamento_psiquiatrico_detalhes.trim()) {
        return "Especifique o acompanhamento psiquiátrico e remédios controlados.";
      }
      if (!form.restricoes_saude.trim()) {
        return "O campo de restrições de saúde é obrigatório. Se não possuir, digite 'Nenhuma'.";
      }
    }
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
        genero: form.genero || null,
        emergencia_contato: form.emergencia_contato.trim() || null,
        emergencia_fone: form.emergencia_fone
          ? form.emergencia_fone.replace(/\D/g, "")
          : null,
        cep: form.cep ? form.cep.replace(/\D/g, "") : null,
        logradouro: form.logradouro.trim() || null,
        numero: form.numero.trim() || null,
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim() || null,
        cidade: form.cidade.trim() || null,
        estado: form.estado.trim() || null,
        tem_plano_saude: form.tem_plano_saude,
        plano_saude_nome: form.tem_plano_saude ? form.plano_saude_nome.trim() || null : null,
        toma_medicamento: form.toma_medicamento,
        medicamentos_nome: form.toma_medicamento ? form.medicamentos_nome.trim() || null : null,
        tem_doenca_tratamento: form.tem_doenca_tratamento,
        doenca_tratamento_nome: form.tem_doenca_tratamento ? form.doenca_tratamento_nome.trim() || null : null,
        tem_diabetes: form.tem_diabetes,
        outras_doencas: form.outras_doencas.trim() || null,
        aceita_uso_dados_saude: form.aceita_uso_dados_saude,
        cpf: form.cpf ? form.cpf.replace(/\D/g, "") : null,
        rg: form.rg.trim() || null,
        estado_civil: form.estado_civil || null,
        profissao: form.profissao.trim() || null,
        experiencia_umbanda: form.experiencia_umbanda || null,
        contato_contexto_espiritual: form.contato_contexto_espiritual || null,
        motivo_busca_desenvolvimento: form.motivo_busca_desenvolvimento.trim() || null,
        interesse_aprendizado: form.interesse_aprendizado.trim() || null,
        ja_conhece_terreiro: form.ja_conhece_terreiro === "Sim" ? true : form.ja_conhece_terreiro === "Não" ? false : null,
        como_conheceu_terreiro: form.como_conheceu_terreiro.trim() || null,
        tratamento_psiquiatrico: form.tratamento_psiquiatrico,
        tratamento_psiquiatrico_detalhes: form.tratamento_psiquiatrico ? form.tratamento_psiquiatrico_detalhes.trim() || null : null,
        restricoes_saude: form.restricoes_saude.trim() || null,
      };

      const formData = new FormData();
      formData.append("data", JSON.stringify(payload));
      if (comprovanteFile) {
        formData.append("comprovante", comprovanteFile);
      }

      const res = await fetch(
        `/api/v1/public/cursos/${id}/inscricao`,
        {
          method: "POST",
          body: formData,
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
              // next/image needs the tenant logo's host allow-listed in next.config.js
              // images.remotePatterns; not configured yet, and this already has a
              // graceful onError fallback — not worth the config risk for a warning.
              // eslint-disable-next-line @next/next/no-img-element
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

                {/* ── Collapsible Section 1: Gênero, Documentos & Emergência ── */}
                {curso.tipo_formulario === "completo" && (
                  <div className={styles.collapsibleSection}>
                    <button
                      type="button"
                      className={styles.collapsibleHeader}
                      onClick={() => setOpenEmergencia(!openEmergencia)}
                    >
                      <span className={styles.collapsibleTitle}>
                        <span className={styles.collapsibleIcon}>👤</span>
                        Dados Pessoais, Documentos & Emergência
                      </span>
                      <span
                        className={`${styles.collapsibleArrow} ${
                          openEmergencia ? styles.collapsibleArrowOpen : ""
                        }`}
                      >
                        ▼
                      </span>
                    </button>
                    {openEmergencia && (
                      <div className={styles.collapsibleContent}>
                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="cpf">
                              CPF
                            </label>
                            <input
                              id="cpf"
                              type="text"
                              className={styles.input}
                              placeholder="000.000.000-00"
                              value={form.cpf}
                              onChange={(e) => setField("cpf", maskCPF(e.target.value))}
                              disabled={submitting}
                              maxLength={14}
                            />
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="rg">
                              RG
                            </label>
                            <input
                              id="rg"
                              type="text"
                              className={styles.input}
                              placeholder="RG"
                              value={form.rg}
                              onChange={(e) => setField("rg", e.target.value)}
                              disabled={submitting}
                              maxLength={20}
                            />
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="estado_civil">
                              Estado Civil
                            </label>
                            <select
                              id="estado_civil"
                              className={styles.select}
                              value={form.estado_civil}
                              onChange={(e) => setField("estado_civil", e.target.value)}
                              disabled={submitting}
                            >
                              <option value="">Selecione...</option>
                              <option value="Solteiro(a)">Solteiro(a)</option>
                              <option value="Casado(a)">Casado(a)</option>
                              <option value="Divorciado(a)">Divorciado(a)</option>
                              <option value="Viúvo(a)">Viúvo(a)</option>
                              <option value="União Estável">União Estável</option>
                              <option value="Outro">Outro</option>
                            </select>
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="profissao">
                              Profissão
                            </label>
                            <input
                              id="profissao"
                              type="text"
                              className={styles.input}
                              placeholder="Profissão"
                              value={form.profissao}
                              onChange={(e) => setField("profissao", e.target.value)}
                              disabled={submitting}
                              maxLength={100}
                            />
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="genero">
                              Gênero
                            </label>
                            <select
                              id="genero"
                              className={styles.select}
                              value={form.genero}
                              onChange={(e) => setField("genero", e.target.value)}
                              disabled={submitting}
                            >
                              <option value="">Selecione...</option>
                              <option value="Masculino">Masculino</option>
                              <option value="Feminino">Feminino</option>
                              <option value="Outro">Outro</option>
                              <option value="Prefiro não responder">Prefiro não responder</option>
                            </select>
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="emergencia_contato">
                              Nome do Contato de Emergência
                            </label>
                            <input
                              id="emergencia_contato"
                              type="text"
                              className={styles.input}
                              placeholder="Nome do contato"
                              value={form.emergencia_contato}
                              onChange={(e) => setField("emergencia_contato", e.target.value)}
                              disabled={submitting}
                              maxLength={255}
                            />
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="emergencia_fone">
                              Telefone de Emergência
                            </label>
                            <input
                              id="emergencia_fone"
                              type="tel"
                              className={styles.input}
                              placeholder="(11) 99999-9999"
                              value={form.emergencia_fone}
                              onChange={(e) => setField("emergencia_fone", maskPhone(e.target.value))}
                              disabled={submitting}
                              maxLength={16}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Collapsible Section 2: Endereço Residencial ── */}
                {curso.tipo_formulario === "completo" && (
                  <div className={styles.collapsibleSection}>
                    <button
                      type="button"
                      className={styles.collapsibleHeader}
                      onClick={() => setOpenEndereco(!openEndereco)}
                    >
                      <span className={styles.collapsibleTitle}>
                        <span className={styles.collapsibleIcon}>📍</span>
                        Endereço Residencial
                      </span>
                      <span
                        className={`${styles.collapsibleArrow} ${
                          openEndereco ? styles.collapsibleArrowOpen : ""
                        }`}
                      >
                        ▼
                      </span>
                    </button>
                    {openEndereco && (
                      <div className={styles.collapsibleContent}>
                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="cep">
                              CEP
                            </label>
                            <div className={styles.cepSearchRow}>
                              <input
                                id="cep"
                                type="text"
                                className={styles.input}
                                placeholder="00000-000"
                                value={form.cep}
                                onChange={(e) =>
                                  setField(
                                    "cep",
                                    e.target.value.replace(/[^\d-]/g, "").slice(0, 9)
                                  )
                                }
                                onBlur={() => lookupCep(form.cep)}
                                disabled={submitting}
                                maxLength={9}
                              />
                              <button
                                type="button"
                                className={styles.cepBtn}
                                onClick={() => lookupCep(form.cep)}
                                disabled={submitting || cepLoading}
                              >
                                {cepLoading ? "Buscando..." : "Buscar CEP"}
                              </button>
                            </div>
                            {cepError && (
                              <span className={styles.cepErrorText}>{cepError}</span>
                            )}
                          </div>
                          <div className={styles.formGroup} style={{ gridColumn: "span 2" }}>
                            <label className={styles.label} htmlFor="logradouro">
                              Logradouro
                            </label>
                            <input
                              id="logradouro"
                              type="text"
                              className={styles.input}
                              placeholder="Rua, Avenida, etc."
                              value={form.logradouro}
                              onChange={(e) => setField("logradouro", e.target.value)}
                              disabled={submitting}
                              maxLength={255}
                            />
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="numero">
                              Número
                            </label>
                            <input
                              id="numero"
                              type="text"
                              className={styles.input}
                              placeholder="Nº"
                              value={form.numero}
                              onChange={(e) => setField("numero", e.target.value)}
                              disabled={submitting}
                              maxLength={20}
                            />
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="complemento">
                              Complemento
                            </label>
                            <input
                              id="complemento"
                              type="text"
                              className={styles.input}
                              placeholder="Apto, Bloco, etc. (opcional)"
                              value={form.complemento}
                              onChange={(e) => setField("complemento", e.target.value)}
                              disabled={submitting}
                              maxLength={100}
                            />
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="bairro">
                              Bairro
                            </label>
                            <input
                              id="bairro"
                              type="text"
                              className={styles.input}
                              placeholder="Bairro"
                              value={form.bairro}
                              onChange={(e) => setField("bairro", e.target.value)}
                              disabled={submitting}
                              maxLength={100}
                            />
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          <div className={styles.formGroup} style={{ gridColumn: "span 2" }}>
                            <label className={styles.label} htmlFor="cidade">
                              Cidade
                            </label>
                            <input
                              id="cidade"
                              type="text"
                              className={styles.input}
                              placeholder="Cidade"
                              value={form.cidade}
                              onChange={(e) => setField("cidade", e.target.value)}
                              disabled={submitting}
                              maxLength={100}
                            />
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="estado">
                              Estado (UF)
                            </label>
                            <input
                              id="estado"
                              type="text"
                              className={styles.input}
                              placeholder="EX: SP"
                              value={form.estado}
                              onChange={(e) => setField("estado", e.target.value.toUpperCase())}
                              disabled={submitting}
                              maxLength={2}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Collapsible Section 3: Perfil Espiritual & Mediúnico ── */}
                {curso.tipo_formulario === "completo" && (
                  <div className={styles.collapsibleSection}>
                    <button
                      type="button"
                      className={styles.collapsibleHeader}
                      onClick={() => setOpenEspiritual(!openEspiritual)}
                    >
                      <span className={styles.collapsibleTitle}>
                        <span className={styles.collapsibleIcon}>✨</span>
                        Perfil Espiritual & Mediúnico
                      </span>
                      <span
                        className={`${styles.collapsibleArrow} ${
                          openEspiritual ? styles.collapsibleArrowOpen : ""
                        }`}
                      >
                        ▼
                      </span>
                    </button>
                    {openEspiritual && (
                      <div className={styles.collapsibleContent}>
                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="experiencia_umbanda">
                              Já teve experiência ou fez algum estudo sobre a religião de umbanda?
                            </label>
                            <select
                              id="experiencia_umbanda"
                              className={styles.select}
                              value={form.experiencia_umbanda}
                              onChange={(e) => setField("experiencia_umbanda", e.target.value)}
                              disabled={submitting}
                            >
                              <option value="">Selecione...</option>
                              <option value="Sim">Sim</option>
                              <option value="Não">Não</option>
                              <option value="Outros">Outros</option>
                            </select>
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="contato_contexto_espiritual">
                              Já teve contato, foi ou é filho de algum contexto espiritual?
                            </label>
                            <select
                              id="contato_contexto_espiritual"
                              className={styles.select}
                              value={form.contato_contexto_espiritual}
                              onChange={(e) => setField("contato_contexto_espiritual", e.target.value)}
                              disabled={submitting}
                            >
                              <option value="">Selecione...</option>
                              <option value="Sim">Sim</option>
                              <option value="Não">Não</option>
                              <option value="Outros">Outros</option>
                            </select>
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="motivo_busca_desenvolvimento">
                              O que te fez buscar o desenvolvimento mediúnico?
                            </label>
                            <textarea
                              id="motivo_busca_desenvolvimento"
                              className={styles.textarea}
                              placeholder="Descreva o que te motivou..."
                              value={form.motivo_busca_desenvolvimento}
                              onChange={(e) => setField("motivo_busca_desenvolvimento", e.target.value)}
                              disabled={submitting}
                            />
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="interesse_aprendizado">
                              Tem interesse em algum aprendizado específico? Qual?
                            </label>
                            <textarea
                              id="interesse_aprendizado"
                              className={styles.textarea}
                              placeholder="Descreva se houver algum interesse particular..."
                              value={form.interesse_aprendizado}
                              onChange={(e) => setField("interesse_aprendizado", e.target.value)}
                              disabled={submitting}
                            />
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="ja_conhece_terreiro">
                              Já conhece o Terreiro {curso.tenant_nome}?
                            </label>
                            <select
                              id="ja_conhece_terreiro"
                              className={styles.select}
                              value={form.ja_conhece_terreiro}
                              onChange={(e) => setField("ja_conhece_terreiro", e.target.value)}
                              disabled={submitting}
                            >
                              <option value="">Selecione...</option>
                              <option value="Sim">Sim</option>
                              <option value="Não">Não</option>
                            </select>
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="como_conheceu_terreiro">
                              Como conheceu o {curso.tenant_nome}?
                            </label>
                            <input
                              id="como_conheceu_terreiro"
                              type="text"
                              className={styles.input}
                              placeholder="Ex: redes sociais, indicação, etc."
                              value={form.como_conheceu_terreiro}
                              onChange={(e) => setField("como_conheceu_terreiro", e.target.value)}
                              disabled={submitting}
                              maxLength={255}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Collapsible Section 4: Informações de Saúde ── */}
                {curso.tipo_formulario === "completo" && (
                  <div className={styles.collapsibleSection}>
                    <button
                      type="button"
                      className={styles.collapsibleHeader}
                      onClick={() => setOpenSaude(!openSaude)}
                    >
                      <span className={styles.collapsibleTitle}>
                        <span className={styles.collapsibleIcon}>🏥</span>
                        Informações de Saúde
                      </span>
                      <span
                        className={`${styles.collapsibleArrow} ${
                          openSaude ? styles.collapsibleArrowOpen : ""
                        }`}
                      >
                        ▼
                      </span>
                    </button>
                    {openSaude && (
                      <div className={styles.collapsibleContent}>
                        <div className={styles.formRow}>
                          {/* Plano de Saúde */}
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="tem_plano_saude">
                              Tem plano de saúde?
                            </label>
                            <select
                              id="tem_plano_saude"
                              className={styles.select}
                              value={form.tem_plano_saude ? "Sim" : "Não"}
                              onChange={(e) => setField("tem_plano_saude", e.target.value === "Sim")}
                              disabled={submitting}
                            >
                              <option value="Não">Não</option>
                              <option value="Sim">Sim</option>
                            </select>
                            {form.tem_plano_saude && (
                              <div className={styles.conditionalBlock}>
                                <label className={styles.label} htmlFor="plano_saude_nome">
                                  Qual o plano de saúde?
                                </label>
                                <input
                                  id="plano_saude_nome"
                                  type="text"
                                  className={styles.input}
                                  placeholder="Nome da operadora/plano"
                                  value={form.plano_saude_nome}
                                  onChange={(e) => setField("plano_saude_nome", e.target.value)}
                                  disabled={submitting}
                                  maxLength={100}
                                />
                              </div>
                            )}
                          </div>

                          {/* Medicamentos */}
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="toma_medicamento">
                              Toma algum medicamento de uso contínuo?
                            </label>
                            <select
                              id="toma_medicamento"
                              className={styles.select}
                              value={form.toma_medicamento ? "Sim" : "Não"}
                              onChange={(e) => setField("toma_medicamento", e.target.value === "Sim")}
                              disabled={submitting}
                            >
                              <option value="Não">Não</option>
                              <option value="Sim">Sim</option>
                            </select>
                            {form.toma_medicamento && (
                              <div className={styles.conditionalBlock}>
                                <label className={styles.label} htmlFor="medicamentos_nome">
                                  Quais medicamentos?
                                </label>
                                <textarea
                                  id="medicamentos_nome"
                                  className={styles.textarea}
                                  placeholder="Liste os medicamentos e dosagens..."
                                  value={form.medicamentos_nome}
                                  onChange={(e) => setField("medicamentos_nome", e.target.value)}
                                  disabled={submitting}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          {/* Tratamento Médico */}
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="tem_doenca_tratamento">
                              Faz algum tratamento de saúde?
                            </label>
                            <select
                              id="tem_doenca_tratamento"
                              className={styles.select}
                              value={form.tem_doenca_tratamento ? "Sim" : "Não"}
                              onChange={(e) => setField("tem_doenca_tratamento", e.target.value === "Sim")}
                              disabled={submitting}
                            >
                              <option value="Não">Não</option>
                              <option value="Sim">Sim</option>
                            </select>
                            {form.tem_doenca_tratamento && (
                              <div className={styles.conditionalBlock}>
                                <label className={styles.label} htmlFor="doenca_tratamento_nome">
                                  Qual tratamento/doença? Especifique
                                </label>
                                <textarea
                                  id="doenca_tratamento_nome"
                                  className={styles.textarea}
                                  placeholder="Descreva a doença e o tratamento..."
                                  value={form.doenca_tratamento_nome}
                                  onChange={(e) => setField("doenca_tratamento_nome", e.target.value)}
                                  disabled={submitting}
                                />
                              </div>
                            )}
                          </div>

                          {/* Diabetes */}
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="tem_diabetes">
                              Tem diabetes?
                            </label>
                            <select
                              id="tem_diabetes"
                              className={styles.select}
                              value={form.tem_diabetes ? "Sim" : "Não"}
                              onChange={(e) => setField("tem_diabetes", e.target.value === "Sim")}
                              disabled={submitting}
                            >
                              <option value="Não">Não</option>
                              <option value="Sim">Sim</option>
                            </select>
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          {/* Tratamento Psiquiátrico */}
                          <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="tratamento_psiquiatrico">
                              Faz acompanhamento / tratamento psiquiátrico e remédios controlados?
                            </label>
                            <select
                              id="tratamento_psiquiatrico"
                              className={styles.select}
                              value={form.tratamento_psiquiatrico ? "Sim" : "Não"}
                              onChange={(e) => setField("tratamento_psiquiatrico", e.target.value === "Sim")}
                              disabled={submitting}
                            >
                              <option value="Não">Não</option>
                              <option value="Sim">Sim</option>
                            </select>
                            {form.tratamento_psiquiatrico && (
                              <div className={styles.conditionalBlock}>
                                <label className={styles.label} htmlFor="tratamento_psiquiatrico_detalhes">
                                  Especifique o tratamento e remédios controlados:
                                </label>
                                <textarea
                                  id="tratamento_psiquiatrico_detalhes"
                                  className={styles.textarea}
                                  placeholder="Detalhes sobre tratamentos ou medicações psiquiátricas..."
                                  value={form.tratamento_psiquiatrico_detalhes}
                                  onChange={(e) => setField("tratamento_psiquiatrico_detalhes", e.target.value)}
                                  disabled={submitting}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
                            <label className={styles.label} htmlFor="restricoes_saude">
                              É muito importante que saibamos suas restrições para que possamos ter um cuidado maior. Descreva-as se houver:
                            </label>
                            <textarea
                              id="restricoes_saude"
                              className={styles.textarea}
                              placeholder="Restrições alimentares, alergias, limitações físicas, etc..."
                              value={form.restricoes_saude}
                              onChange={(e) => setField("restricoes_saude", e.target.value)}
                              disabled={submitting}
                            />
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
                            <label className={styles.label} htmlFor="outras_doencas">
                              Outras doenças ou condições que devem ser mencionadas (opcional)
                            </label>
                            <textarea
                              id="outras_doencas"
                              className={styles.textarea}
                              placeholder="Ex: alergias graves, hipertensão, problemas cardíacos, etc..."
                              value={form.outras_doencas}
                              onChange={(e) => setField("outras_doencas", e.target.value)}
                              disabled={submitting}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── PIX Payment Instructions and Receipt Upload ── */}
                {curso.chave_pix && (
                  <div className={styles.infoCard} style={{ border: `1.5px solid ${primary}40`, background: `${primary}05` }}>
                    <p className={styles.infoCardTitle} style={{ color: primary, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>💸</span> Confirmação de Matrícula (PIX)
                    </p>
                    <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6, marginBottom: 16 }}>
                      Para garantir sua vaga no curso, faça a transferência da taxa de matrícula para a chave PIX abaixo e anexe o comprovante de pagamento.
                    </p>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 10, marginBottom: 16 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>Chave PIX</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "2px 0 0" }}>{curso.chave_pix}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(curso.chave_pix || "");
                          alert("Chave PIX copiada para a área de transferência!");
                        }}
                        style={{
                          padding: "8px 16px",
                          background: primary,
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer"
                        }}
                      >
                        Copiar Chave
                      </button>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>
                        Comprovante de Pagamento (Matrícula) *
                        <span className={styles.labelOptional}>(JPG, PNG, WebP ou PDF - máx 5MB)</span>
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                        <label
                          htmlFor="comprovante_file"
                          style={{
                            padding: "10px 18px",
                            border: "1.5px solid #d1d5db",
                            borderRadius: 10,
                            background: "#fff",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            color: "#374151"
                          }}
                        >
                          📎 {comprovanteFile ? "Alterar Comprovante" : "Anexar Comprovante"}
                        </label>
                        <input
                          id="comprovante_file"
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (file) {
                              if (file.size > 5 * 1024 * 1024) {
                                alert("O arquivo é muito grande (máximo 5MB).");
                                return;
                              }
                              setComprovanteFile(file);
                            }
                          }}
                        />
                        {comprovanteFile && (
                          <span style={{ fontSize: 14, color: "#166534", fontWeight: 500 }}>
                            ✅ {comprovanteFile.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

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

                  {/* Consentimento de saúde */}
                  {curso.tipo_formulario === "completo" && (
                    <div className={styles.lgpdItem}>
                      <input
                        id="aceita_saude"
                        type="checkbox"
                        className={styles.lgpdCheckbox}
                        checked={form.aceita_uso_dados_saude}
                        onChange={(e) =>
                          setField("aceita_uso_dados_saude", e.target.checked)
                        }
                        style={{ accentColor: primary }}
                      />
                      <label htmlFor="aceita_saude" className={styles.lgpdText}>
                        <strong>Consentimento para processamento de dados de saúde (sensíveis):</strong> Autorizo o processamento dos meus dados de saúde fornecidos neste formulário para fins de cuidados e atendimento rápido em caso de emergência durante as atividades do curso, conforme a <strong>Lei Geral de Proteção de Dados (LGPD – Lei 13.709/2018)</strong>. Meus dados médicos serão mantidos sob estrito sigilo. *
                      </label>
                    </div>
                  )}
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
