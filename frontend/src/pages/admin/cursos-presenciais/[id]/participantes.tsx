import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Paper,
  Button,
  TextField,
  Checkbox,
  Stack,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip,
  Snackbar,
  Alert,
  FormControlLabel,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import PeopleIcon from "@mui/icons-material/People";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import EventIcon from "@mui/icons-material/Event";
import PlaceIcon from "@mui/icons-material/Place";
import WarningIcon from "@mui/icons-material/Warning";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import RefreshIcon from "@mui/icons-material/Refresh";

import AdminLayout from "@/pages/admin/admin_layout";
import CrudDrawer from "@/components/CrudDrawer";
import UpgradePrompt from "@/components/UpgradePrompt";
import { apiClient } from "@/services/api_client";
import { useSubscription } from "@/hooks/useSubscription";
import { useTenant } from "@/providers/ThemeProvider";
import { NumericFormat } from "react-number-format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface CursoPresencial {
  id: string;
  tenant_id: string;
  titulo: string;
  ementa?: string;
  data_inicio: string; // ISO string
  data_fim?: string | null;
  max_participantes?: number | null;
  valor_mensalidade_padrao?: number | null;
  local?: string | null;
  observacoes?: string | null;
  is_active: boolean;
  gerar_mensalidade: boolean;
  tipo_formulario: string;
}

interface Participante {
  id: string;
  curso_id: string;
  tenant_id: string;
  nome: string;
  data_nascimento?: string | null; // YYYY-MM-DD
  celular?: string | null;
  email?: string | null;
  valor_mensalidade?: number | string | null;
  pago: boolean;
  valor_pago?: number | string | null;
  data_pagamento?: string | null; // ISO string
  observacoes?: string | null;
  genero?: string | null;
  emergencia_contato?: string | null;
  emergencia_fone?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  tem_plano_saude?: boolean | null;
  plano_saude_nome?: string | null;
  toma_medicamento?: boolean | null;
  medicamentos_nome?: string | null;
  tem_doenca_tratamento?: boolean | null;
  doenca_tratamento_nome?: string | null;
  tem_diabetes?: boolean | null;
  outras_doencas?: string | null;
  aceita_uso_dados_saude?: boolean;
  cpf?: string | null;
  rg?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
  experiencia_umbanda?: string | null;
  contato_contexto_espiritual?: string | null;
  motivo_busca_desenvolvimento?: string | null;
  interesse_aprendizado?: string | null;
  ja_conhece_terreiro?: boolean | null;
  como_conheceu_terreiro?: string | null;
  tratamento_psiquiatrico?: boolean | null;
  tratamento_psiquiatrico_detalhes?: string | null;
  restricoes_saude?: string | null;
  aceita_uso_dados?: boolean;
  aceita_uso_imagem?: boolean;
  comprovante_inscricao_filename?: string | null;
  comprovante_inscricao_mime?: string | null;
  created_at: string;
  updated_at: string;
}

const fmtBRL = (value: number | string | null | undefined): string => {
  if (value == null || value === "") return "R$ 0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  if (year && month && day) {
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "—";
  }
};

const formatPhone = (phone: string | null | undefined): string => {
  if (!phone) return "—";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }
  return phone;
};

function addMonths(base: Date, n: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + n);
  return d;
}

function toYYYYMM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`;
}

export default function ParticipantesPage() {
  const router = useRouter();
  const { id } = router.query;
  const { subscription, loading: subLoading } = useSubscription();
  const { tenantName } = useTenant();

  const [curso, setCurso] = useState<CursoPresencial | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Drawer states
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [matriculaFile, setMatriculaFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<any>({
    nome: "",
    data_nascimento: "",
    celular: "",
    email: "",
    valor_mensalidade: "",
    observacoes: "",
    pago: false,
    valor_pago: "",
    data_pagamento: "",
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
    cpf: "",
    rg: "",
    estado_civil: "",
    profissao: "",
    experiencia_umbanda: "",
    contato_contexto_espiritual: "",
    motivo_busca_desenvolvimento: "",
    interesse_aprendizado: "",
    ja_conhece_terreiro: null,
    como_conheceu_terreiro: "",
    tratamento_psiquiatrico: false,
    tratamento_psiquiatrico_detalhes: "",
    restricoes_saude: "",
    aceita_uso_dados: false,
    aceita_uso_imagem: false,
    comprovante_inscricao_filename: null,
  });

  // Alert state
  const [alert, setAlert] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const today = new Date();
  const [mes, setMes] = useState<string>(toYYYYMM(today));
  const [tab, setTab] = useState(0);

  const [mensalidadeItems, setMensalidadeItems] = useState<any[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [loadingMensalidades, setLoadingMensalidades] = useState(false);
  const [loadingResumo, setLoadingResumo] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'TODOS' | 'PENDENTE' | 'PAGO' | 'ISENTO'>('TODOS');
  const [searchMensalidades, setSearchMensalidades] = useState('');

  // Payment Drawer state
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [paymentItem, setPaymentItem] = useState<any | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'PAGO' | 'PENDENTE' | 'ISENTO'>('PENDENTE');
  const [paymentValorPago, setPaymentValorPago] = useState<string>('');
  const [paymentDataPag, setPaymentDataPag] = useState<string>('');
  const [paymentObs, setPaymentObs] = useState<string>('');
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);

  const fetchCurso = async () => {
    try {
      const res = await apiClient.get<CursoPresencial>(`/api/v1/admin/cursos-presenciais/${id}`);
      setCurso(res.data);
    } catch (err) {
      console.error("Erro ao buscar curso:", err);
      showAlert("Não foi possível carregar as informações do curso.", "error");
    }
  };

  const fetchParticipantes = async () => {
    try {
      const res = await apiClient.get<Participante[]>(`/api/v1/admin/cursos-presenciais/${id}/participantes`);
      setParticipantes(res.data);
    } catch (err) {
      console.error("Erro ao buscar participantes:", err);
      showAlert("Não foi possível carregar a lista de participantes.", "error");
    }
  };

  const fetchMensalidades = useCallback(async () => {
    if (!id || !curso?.gerar_mensalidade) return;
    setLoadingMensalidades(true);
    try {
      const res = await apiClient.get(`/api/v1/admin/cursos-presenciais/${id}/financeiro/mensalidades?mes=${mes}`);
      setMensalidadeItems(res.data);
    } catch (err) {
      console.error("Erro ao buscar mensalidades do curso:", err);
      showAlert("Não foi possível carregar as mensalidades do curso.", "error");
    } finally {
      setLoadingMensalidades(false);
    }
  }, [id, mes, curso?.gerar_mensalidade]);

  const fetchResumo = useCallback(async () => {
    if (!id || !curso?.gerar_mensalidade) return;
    setLoadingResumo(true);
    try {
      const res = await apiClient.get(`/api/v1/admin/cursos-presenciais/${id}/financeiro/resumo`);
      setResumo(res.data);
    } catch (err) {
      console.error("Erro ao buscar resumo financeiro:", err);
    } finally {
      setLoadingResumo(false);
    }
  }, [id, curso?.gerar_mensalidade]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchCurso(), fetchParticipantes()]);
    setLoading(false);
  };

  useEffect(() => {
    if (id && (subscription?.plan === "pro" || subscription?.plan === "premium")) {
      loadData();
    }
  }, [id, subscription]);

  useEffect(() => {
    if (id && curso?.gerar_mensalidade) {
      fetchMensalidades();
    }
  }, [id, mes, curso?.gerar_mensalidade, fetchMensalidades]);

  useEffect(() => {
    if (id && curso?.gerar_mensalidade && tab === 2) {
      fetchResumo();
    }
  }, [id, tab, curso?.gerar_mensalidade, fetchResumo]);

  const showAlert = (message: string, severity: "success" | "error") => {
    setAlert({ open: true, message, severity });
  };

  const openPaymentDrawer = (item: any) => {
    setPaymentItem(item);
    setPaymentStatus((item.status as 'PAGO' | 'PENDENTE' | 'ISENTO') || 'PENDENTE');
    setPaymentValorPago(item.valor_pago != null ? String(item.valor_pago) : item.valor_mensalidade != null ? String(item.valor_mensalidade) : '');
    setPaymentDataPag(item.data_pagamento ? item.data_pagamento.slice(0, 10) : new Date().toISOString().substring(0, 10));
    setPaymentObs(item.observacao || '');
    setPaymentFile(null);
    setPaymentDrawerOpen(true);
  };

  const handleSavePayment = async () => {
    if (!paymentItem) return;
    setPaymentSaving(true);
    try {
      const form = new FormData();
      form.append('status', paymentStatus);
      if (paymentStatus === 'PAGO') {
        if (paymentValorPago) form.append('valor_pago', paymentValorPago);
        if (paymentDataPag) form.append('data_pagamento', paymentDataPag);
        if (paymentFile) form.append('comprovante', paymentFile);
      }
      if (paymentObs) form.append('observacao', paymentObs);

      await apiClient.post(
        `/api/v1/admin/cursos-presenciais/${id}/financeiro/mensalidades/${paymentItem.participante_id}/${mes}`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      showAlert("Pagamento de mensalidade registrado com sucesso.", "success");
      setPaymentDrawerOpen(false);
      fetchMensalidades();
      fetchResumo();
    } catch (err: any) {
      console.error("Erro ao registrar pagamento:", err);
      const detail = err?.response?.data?.detail || "Erro ao registrar pagamento.";
      showAlert(detail, "error");
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleDownloadComprovante = async (item: any) => {
    try {
      const res = await apiClient.get(
        `/api/v1/admin/cursos-presenciais/${id}/financeiro/mensalidades/${item.participante_id}/${mes}/comprovante`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.comprovante_filename || 'comprovante';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showAlert("Comprovante não encontrado.", "error");
    }
  };

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
      setFormData((prev: any) => ({
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

  const openCreateDrawer = () => {
    setDrawerMode("create");
    setEditingId(null);
    setMatriculaFile(null);
    setFormData({
      nome: "",
      data_nascimento: "",
      celular: "",
      email: "",
      valor_mensalidade: curso?.valor_mensalidade_padrao !== null && curso?.valor_mensalidade_padrao !== undefined
        ? String(curso.valor_mensalidade_padrao)
        : "",
      observacoes: "",
      pago: false,
      valor_pago: "",
      data_pagamento: "",
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
      cpf: "",
      rg: "",
      estado_civil: "",
      profissao: "",
      experiencia_umbanda: "",
      contato_contexto_espiritual: "",
      motivo_busca_desenvolvimento: "",
      interesse_aprendizado: "",
      ja_conhece_terreiro: null,
      como_conheceu_terreiro: "",
      tratamento_psiquiatrico: false,
      tratamento_psiquiatrico_detalhes: "",
      restricoes_saude: "",
      aceita_uso_dados: false,
      aceita_uso_imagem: false,
      comprovante_inscricao_filename: null,
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (p: Participante) => {
    setDrawerMode("edit");
    setEditingId(p.id);
    setMatriculaFile(null);
    setFormData({
      nome: p.nome,
      data_nascimento: p.data_nascimento || "",
      celular: p.celular || "",
      email: p.email || "",
      valor_mensalidade: p.valor_mensalidade !== null && p.valor_mensalidade !== undefined
        ? String(p.valor_mensalidade)
        : "",
      observacoes: p.observacoes || "",
      pago: p.pago,
      valor_pago: p.valor_pago !== null && p.valor_pago !== undefined
        ? String(p.valor_pago)
        : p.valor_mensalidade !== null && p.valor_mensalidade !== undefined
        ? String(p.valor_mensalidade)
        : "",
      data_pagamento: p.data_pagamento ? p.data_pagamento.substring(0, 10) : new Date().toISOString().substring(0, 10),
      genero: p.genero || "",
      emergencia_contato: p.emergencia_contato || "",
      emergencia_fone: p.emergencia_fone || "",
      cep: p.cep || "",
      logradouro: p.logradouro || "",
      numero: p.numero || "",
      complemento: p.complemento || "",
      bairro: p.bairro || "",
      cidade: p.cidade || "",
      estado: p.estado || "",
      tem_plano_saude: !!p.tem_plano_saude,
      plano_saude_nome: p.plano_saude_nome || "",
      toma_medicamento: !!p.toma_medicamento,
      medicamentos_nome: p.medicamentos_nome || "",
      tem_doenca_tratamento: !!p.tem_doenca_tratamento,
      doenca_tratamento_nome: p.doenca_tratamento_nome || "",
      tem_diabetes: !!p.tem_diabetes,
      outras_doencas: p.outras_doencas || "",
      cpf: p.cpf || "",
      rg: p.rg || "",
      estado_civil: p.estado_civil || "",
      profissao: p.profissao || "",
      experiencia_umbanda: p.experiencia_umbanda || "",
      contato_contexto_espiritual: p.contato_contexto_espiritual || "",
      motivo_busca_desenvolvimento: p.motivo_busca_desenvolvimento || "",
      interesse_aprendizado: p.interesse_aprendizado || "",
      ja_conhece_terreiro: p.ja_conhece_terreiro,
      como_conheceu_terreiro: p.como_conheceu_terreiro || "",
      tratamento_psiquiatrico: !!p.tratamento_psiquiatrico,
      tratamento_psiquiatrico_detalhes: p.tratamento_psiquiatrico_detalhes || "",
      restricoes_saude: p.restricoes_saude || "",
      aceita_uso_dados: !!p.aceita_uso_dados,
      aceita_uso_imagem: !!p.aceita_uso_imagem,
      comprovante_inscricao_filename: p.comprovante_inscricao_filename || null,
    });
    setDrawerOpen(true);
  };

  const handleDelete = async (p: Participante) => {
    if (window.confirm(`Deseja remover o participante "${p.nome}" do curso?`)) {
      try {
        await apiClient.delete(`/api/v1/admin/cursos-presenciais/${id}/participantes/${p.id}`);
        showAlert("Participante removido com sucesso.", "success");
        fetchParticipantes();
      } catch (err) {
        console.error("Erro ao remover participante:", err);
        showAlert("Erro ao remover participante.", "error");
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const payload: any = {
      nome: formData.nome,
      data_nascimento: formData.data_nascimento || null,
      celular: formData.celular || null,
      email: formData.email || null,
      valor_mensalidade: formData.valor_mensalidade ? parseFloat(formData.valor_mensalidade) : null,
      observacoes: formData.observacoes || null,
      genero: formData.genero || null,
      emergencia_contato: formData.emergencia_contato || null,
      emergencia_fone: formData.emergencia_fone || null,
      cep: formData.cep || null,
      logradouro: formData.logradouro || null,
      numero: formData.numero || null,
      complemento: formData.complemento || null,
      bairro: formData.bairro || null,
      cidade: formData.cidade || null,
      estado: formData.estado || null,
      tem_plano_saude: formData.tem_plano_saude,
      plano_saude_nome: formData.tem_plano_saude ? formData.plano_saude_nome || null : null,
      toma_medicamento: formData.toma_medicamento,
      medicamentos_nome: formData.toma_medicamento ? formData.medicamentos_nome || null : null,
      tem_doenca_tratamento: formData.tem_doenca_tratamento,
      doenca_tratamento_nome: formData.tem_doenca_tratamento ? formData.doenca_tratamento_nome || null : null,
      tem_diabetes: formData.tem_diabetes,
      outras_doencas: formData.outras_doencas || null,
      cpf: formData.cpf || null,
      rg: formData.rg || null,
      estado_civil: formData.estado_civil || null,
      profissao: formData.profissao || null,
      experiencia_umbanda: formData.experiencia_umbanda || null,
      contato_contexto_espiritual: formData.contato_contexto_espiritual || null,
      motivo_busca_desenvolvimento: formData.motivo_busca_desenvolvimento || null,
      interesse_aprendizado: formData.interesse_aprendizado || null,
      ja_conhece_terreiro: formData.ja_conhece_terreiro,
      como_conheceu_terreiro: formData.como_conheceu_terreiro || null,
      tratamento_psiquiatrico: formData.tratamento_psiquiatrico,
      tratamento_psiquiatrico_detalhes: formData.tratamento_psiquiatrico ? formData.tratamento_psiquiatrico_detalhes || null : null,
      restricoes_saude: formData.restricoes_saude || null,
      aceita_uso_dados: formData.aceita_uso_dados,
      aceita_uso_imagem: formData.aceita_uso_imagem,
    };

    if (drawerMode === "edit") {
      payload.pago = formData.pago;
      if (formData.pago) {
        payload.valor_pago = formData.valor_pago ? parseFloat(formData.valor_pago) : null;
        payload.data_pagamento = formData.data_pagamento ? new Date(formData.data_pagamento).toISOString() : null;
      }
    }

    try {
      let savedParticipantId = editingId;
      if (drawerMode === "create") {
        const res = await apiClient.post(`/api/v1/admin/cursos-presenciais/${id}/participantes`, payload);
        savedParticipantId = res.data.id;
        showAlert("Participante cadastrado com sucesso.", "success");
      } else if (editingId) {
        await apiClient.put(`/api/v1/admin/cursos-presenciais/${id}/participantes/${editingId}`, payload);
        showAlert("Cadastro do participante atualizado.", "success");
      }

      // Se houver um arquivo de comprovante selecionado, faz o upload
      if (matriculaFile && savedParticipantId) {
        const form = new FormData();
        form.append("comprovante", matriculaFile);
        await apiClient.post(
          `/api/v1/admin/cursos-presenciais/${id}/participantes/${savedParticipantId}/comprovante`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
      }

      setDrawerOpen(false);
      fetchParticipantes();
    } catch (err: any) {
      console.error("Erro ao salvar participante:", err);
      const detail = err?.response?.data?.detail || "Erro ao salvar participante.";
      showAlert(detail, "error");
    } finally {
      setSaving(false);
    }
  };

  const isPlanAllowed = subscription?.plan === "pro" || subscription?.plan === "premium";

  if (subLoading) {
    return (
      <AdminLayout title="Participantes">
        <Stack alignItems="center" mt={8}>
          <CircularProgress />
        </Stack>
      </AdminLayout>
    );
  }

  if (!isPlanAllowed) {
    return (
      <AdminLayout title="Participantes">
        <UpgradePrompt feature="Cursos Presenciais" minPlan="Pro" />
      </AdminLayout>
    );
  }

  if (loading) {
    return (
      <AdminLayout title="Participantes">
        <Stack alignItems="center" mt={8}>
          <CircularProgress />
        </Stack>
      </AdminLayout>
    );
  }

  const filteredParticipantes = searchQuery.trim().length === 0 ? participantes : participantes.filter((p) =>
    p.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalVagas = curso?.max_participantes ?? null;
  const vagasPreenchidas = participantes.length;
  const faturamentoEstimado = participantes.reduce((sum, p) => sum + Number(p.valor_mensalidade ?? 0), 0);

  // KPI calculations for monthly billing
  const totalEsperado =
    mensalidadeItems.filter((i) => i.status !== 'ISENTO').reduce((s, i) => s + Number(i.valor_mensalidade ?? 0), 0);
  const totalArrecadado =
    mensalidadeItems.filter((i) => i.status === 'PAGO').reduce((s, i) => s + Number(i.valor_pago ?? 0), 0);
  const totalInadimplentesCount =
    mensalidadeItems.filter((i) => i.status !== 'PAGO' && i.status !== 'ISENTO').length;
  const totalEmAberto = Math.max(0, totalEsperado - totalArrecadado);

  const filteredMensalidadeItems = mensalidadeItems.filter((i) => {
    const matchStatus = filterStatus === 'TODOS' || i.status === filterStatus;
    const matchSearch = i.participante_nome.toLowerCase().includes(searchMensalidades.toLowerCase());
    return matchStatus && matchSearch;
  });

  const statusChip = (item: any) => {
    const s = item.status;
    if (s === 'PAGO') return <Chip label="Pago" color="success" size="small" />;
    if (s === 'ISENTO') return <Chip label="Isento" size="small" />;
    
    const [y, m] = mes.split('-').map(Number);
    const vencimento = new Date(y, m - 1, 10); // default to 10th
    const hoje = new Date();
    if (!s || s === 'PENDENTE') {
      if (hoje > vencimento) return <Chip label="Inadimplente" color="error" size="small" />;
      return <Chip label="Pendente" color="warning" size="small" />;
    }
    return <Chip label={s} size="small" />;
  };

  const chartData = resumo
    ? [
        ...resumo.historico.map((h: any) => ({
          mes: mesLabel(h.mes),
          Esperado: h.esperado,
          Arrecadado: h.arrecadado,
          projecao: false,
        })),
        ...resumo.projecao.map((p: any) => ({
          mes: mesLabel(p.mes),
          Projetado: p.projetado,
          projecao: true,
        })),
      ]
    : [];

  const handlePrevMes = () => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    setMes(toYYYYMM(addMonths(d, -1)));
  };

  const handleNextMes = () => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    setMes(toYYYYMM(addMonths(d, 1)));
  };

  return (
    <AdminLayout title={`Participantes - ${curso?.titulo || ""}`}>
      {/* Voltar e Cabeçalho */}
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push("/admin/cursos-presenciais")}
          sx={{ mb: 2, textTransform: "none" }}
          variant="text"
          size="small"
        >
          Voltar para Cursos
        </Button>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {curso?.titulo}
        </Typography>
        {curso?.ementa && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {curso.ementa}
          </Typography>
        )}
        <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
          {curso?.local && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <PlaceIcon fontSize="small" color="action" />
              <Typography variant="body2">{curso.local}</Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={0.5} alignItems="center">
            <EventIcon fontSize="small" color="action" />
            <Typography variant="body2">
              Início: {curso?.data_inicio ? new Date(curso.data_inicio).toLocaleDateString("pt-BR") : "—"}
              {curso?.data_fim ? ` | Término: ${new Date(curso.data_fim).toLocaleDateString("pt-BR")}` : ""}
            </Typography>
          </Stack>
          {curso?.valor_mensalidade_padrao !== null && curso?.valor_mensalidade_padrao !== undefined && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <AttachMoneyIcon fontSize="small" color="action" />
              <Typography variant="body2">
                Mensalidade Padrão: {fmtBRL(curso.valor_mensalidade_padrao)}
              </Typography>
            </Stack>
          )}
        </Stack>
      </Box>

      {/* KPI Cards */}
      {curso?.gerar_mensalidade ? (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Esperado', value: fmtBRL(totalEsperado), color: 'text.primary' },
            { label: 'Arrecadado', value: fmtBRL(totalArrecadado), color: 'success.main' },
            { label: 'Inadimplentes', value: String(totalInadimplentesCount), color: totalInadimplentesCount > 0 ? 'error.main' : 'success.main' },
            { label: 'Em aberto', value: fmtBRL(totalEmAberto), color: 'warning.main' },
          ].map(({ label, value, color }) => (
            <Grid item xs={6} md={3} key={label}>
              <Card variant="outlined">
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" color="text.secondary" textTransform="uppercase">{label}</Typography>
                  <Typography variant="h6" fontWeight={700} color={color}>{value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight={600}>
                  Vagas Preenchidas
                </Typography>
                <Typography variant="h6" fontWeight={700} color={totalVagas && vagasPreenchidas >= totalVagas ? "warning.main" : "text.primary"}>
                  {vagasPreenchidas} / {totalVagas !== null ? totalVagas : "Sem limite"}
                </Typography>
                {totalVagas && vagasPreenchidas >= totalVagas && (
                  <Stack direction="row" spacing={0.5} alignItems="center" mt={0.5}>
                    <WarningIcon fontSize="inherit" color="warning" />
                    <Typography variant="caption" color="warning.main" fontWeight={600}>
                      Curso lotado
                    </Typography>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight={600}>
                  Faturamento Mensal Estimado
                </Typography>
                <Typography variant="h6" fontWeight={700} color="success.main">
                  {fmtBRL(faturamentoEstimado)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs para cursos com controle mensal */}
      {curso?.gerar_mensalidade && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
          <Tab label="Matrículas" />
          <Tab label="Mensalidades" />
          <Tab label="Gráfico" />
        </Tabs>
      )}

      {/* Aba 0 ou Modo Tradicional: Matrículas */}
      {(!curso?.gerar_mensalidade || tab === 0) && (
        <>
          {/* Busca e Novo Participante */}
          <Box sx={{ mb: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
              <TextField
                size="small"
                placeholder="Buscar participante por nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ width: 350, maxWidth: "100%" }}
              />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openCreateDrawer}
                size="small"
                disabled={totalVagas !== null && vagasPreenchidas >= totalVagas}
                sx={{ textTransform: "none" }}
              >
                Matricular Participante
              </Button>
            </Stack>
          </Box>

          {/* Tabela de Participantes */}
          <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Nome</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Contato</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Nascimento</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Mensalidade Individual</TableCell>
                  {!curso?.gerar_mensalidade && (
                    <>
                      <TableCell sx={{ fontWeight: 600 }}>Status Pagamento</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Detalhes do Pagamento</TableCell>
                    </>
                  )}
                  <TableCell sx={{ fontWeight: 600 }}>Comp. Inscrição</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredParticipantes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={curso?.gerar_mensalidade ? 5 : 7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      Nenhum participante matriculado ou encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParticipantes.map((p) => {
                    const isCustomFee = curso?.valor_mensalidade_padrao !== null &&
                      p.valor_mensalidade !== curso?.valor_mensalidade_padrao;
                    const isFichaIncompleta =
                      curso?.tipo_formulario === "completo" &&
                      (!p.cep || !p.emergencia_contato || !p.emergencia_fone);

                    return (
                      <TableRow key={p.id} hover>
                        <TableCell sx={{ fontWeight: 500 }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <span>{p.nome}</span>
                            {isFichaIncompleta && (
                              <Tooltip title="Ficha médica/endereço pendente">
                                <Chip
                                  label="Ficha Incompleta"
                                  color="warning"
                                  size="small"
                                  sx={{ height: 18, fontSize: "10px", fontWeight: 600 }}
                                />
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {p.email || "—"}
                          </Typography>
                          {p.celular && (
                            <Typography variant="caption" color="text.secondary">
                              {formatPhone(p.celular)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(p.data_nascimento)}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography fontWeight={isCustomFee ? 700 : 400}>
                              {fmtBRL(p.valor_mensalidade)}
                            </Typography>
                            {isCustomFee && (
                              <Tooltip title="Valor customizado para este participante">
                                <Chip
                                  label="Customizado"
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: "9px" }}
                                />
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                        {!curso?.gerar_mensalidade && (
                          <>
                            <TableCell>
                              <Box
                                sx={{
                                  display: "inline-block",
                                  px: 2,
                                  py: 0.5,
                                  borderRadius: 1,
                                  backgroundColor: p.pago ? "#c8e6c9" : "#ffe0b2",
                                  color: p.pago ? "#2e7d32" : "#e65100",
                                  fontSize: "0.875rem",
                                  fontWeight: 500,
                                }}
                              >
                                {p.pago ? "Pago" : "Pendente"}
                              </Box>
                            </TableCell>
                            <TableCell>
                              {p.pago ? (
                                <Box>
                                  <Typography variant="body2" fontWeight={500}>
                                    {fmtBRL(p.valor_pago)}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {formatDateTime(p.data_pagamento)}
                                  </Typography>
                                </Box>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </>
                        )}
                        <TableCell>
                          {p.comprovante_inscricao_filename ? (
                            <Tooltip title={p.comprovante_inscricao_filename}>
                              <IconButton
                                size="small"
                                onClick={async () => {
                                  try {
                                    const res = await apiClient.get(
                                      `/api/v1/admin/cursos-presenciais/${id}/participantes/${p.id}/comprovante`,
                                      { responseType: 'blob' },
                                    );
                                    const url = URL.createObjectURL(res.data);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = p.comprovante_inscricao_filename || 'comprovante-inscricao';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  } catch {
                                    showAlert("Comprovante de inscrição não encontrado.", "error");
                                  }
                                }}
                              >
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <AttachFileIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Tooltip title={curso?.gerar_mensalidade ? "Editar Matrícula" : "Editar Matrícula / Pagamento"}>
                              <IconButton
                                size="small"
                                onClick={() => openEditDrawer(p)}
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remover Matrícula">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDelete(p)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Aba 1: Mensalidades */}
      {curso?.gerar_mensalidade && tab === 1 && (
        <>
          {/* Navegador de Mês */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <IconButton onClick={handlePrevMes} size="small">
              <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>
            <Typography variant="h6" sx={{ minWidth: 100, textAlign: 'center', fontWeight: 600 }}>
              {mesLabel(mes)}
            </Typography>
            <IconButton onClick={handleNextMes} size="small">
              <ArrowForwardIosIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={fetchMensalidades} size="small" title="Atualizar">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Filtros da listagem mensal */}
          <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
            <TextField
              size="small"
              placeholder="Buscar aluno..."
              value={searchMensalidades}
              onChange={(e) => setSearchMensalidades(e.target.value)}
              sx={{ minWidth: 250 }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                label="Status"
                onChange={(e) => setFilterStatus(e.target.value as any)}
              >
                <MenuItem value="TODOS">Todos</MenuItem>
                <MenuItem value="PENDENTE">Pendente / Inadimplente</MenuItem>
                <MenuItem value="PAGO">Pago</MenuItem>
                <MenuItem value="ISENTO">Isento</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Tabela de mensalidades mensais */}
          {loadingMensalidades ? (
            <Stack alignItems="center" py={4}>
              <CircularProgress />
            </Stack>
          ) : filteredMensalidadeItems.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <CheckCircleIcon sx={{ fontSize: 48, color: 'success.light', mb: 1 }} />
              <Typography color="text.secondary">
                Nenhum participante com pendências ou resultados neste mês.
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Nome</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Vencimento</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Data Pag.</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Valor Pago</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Comprovante</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredMensalidadeItems.map((item) => (
                    <TableRow key={item.participante_id} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{item.participante_nome}</TableCell>
                      <TableCell>{statusChip(item)}</TableCell>
                      <TableCell>10/{mes.slice(5, 7)}/{mes.slice(0, 4)}</TableCell>
                      <TableCell>
                        {item.data_pagamento
                          ? new Date(item.data_pagamento).toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell align="right">
                        {item.status === 'PAGO' ? fmtBRL(item.valor_pago) : "—"}
                      </TableCell>
                      <TableCell>
                        {item.comprovante_filename ? (
                          <Tooltip title={item.comprovante_filename}>
                            <IconButton size="small" onClick={() => handleDownloadComprovante(item)}>
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <AttachFileIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Registrar Pagamento">
                          <IconButton size="small" onClick={() => openPaymentDrawer(item)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Aba 2: Gráfico */}
      {curso?.gerar_mensalidade && tab === 2 && (
        <Box>
          {loadingResumo ? (
            <Stack alignItems="center" py={4}>
              <CircularProgress />
            </Stack>
          ) : !resumo ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              Nenhum dado disponível para gerar o gráfico.
            </Typography>
          ) : (
            <>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Histórico de Cobrança e Arrecadação
              </Typography>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(v: number) => fmtBRL(v)} />
                  <Legend />
                  <Bar dataKey="Esperado" fill="#bdbdbd" />
                  <Bar dataKey="Arrecadado" fill="#7C3AED" />
                  <Bar dataKey="Projetado" fill="#c5cae9" />
                </BarChart>
              </ResponsiveContainer>

              <Grid container spacing={2} sx={{ mt: 3 }}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">Alunos Matriculados Ativos</Typography>
                      <Typography variant="h6" fontWeight={700}>{resumo.config.count_ativos}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">Projeção de Faturamento Mensal</Typography>
                      <Typography variant="h6" fontWeight={700}>{fmtBRL(resumo.projecao[0]?.projetado ?? 0)}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                * A projeção é baseada nas mensalidades vigentes configuradas para cada aluno matriculado ativo.
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* Drawer Matrícula (Criar/Editar cadastro do aluno) */}
      <CrudDrawer
        title={drawerMode === "create" ? "Matricular Participante" : "Editar Matrícula"}
        subtitle={
          drawerMode === "create"
            ? "Preencha as informações do novo participante."
            : "Atualize os dados cadastrais e observações do participante."
        }
        icon={<PeopleIcon />}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!formData.nome}
      >
        <Stack spacing={2} mt={1}>
          <TextField
            label="Nome do Participante"
            required
            fullWidth
            value={formData.nome || ""}
            onChange={(e) =>
              setFormData((prev: any) => ({ ...prev, nome: e.target.value }))
            }
          />
          <TextField
            label="Data de Nascimento"
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={formData.data_nascimento || ""}
            onChange={(e) =>
              setFormData((prev: any) => ({ ...prev, data_nascimento: e.target.value }))
            }
          />
          <TextField
            label="Celular"
            fullWidth
            placeholder="(11) 99999-9999"
            value={formData.celular || ""}
            onChange={(e) =>
              setFormData((prev: any) => ({ ...prev, celular: e.target.value }))
            }
          />
          <TextField
            label="E-mail"
            type="email"
            fullWidth
            value={formData.email || ""}
            onChange={(e) =>
              setFormData((prev: any) => ({ ...prev, email: e.target.value }))
            }
          />
          <TextField
            label="Valor da Mensalidade Individual (R$)"
            type="number"
            fullWidth
            helperText="Se não informado, herdará o valor padrão do curso."
            value={formData.valor_mensalidade || ""}
            onChange={(e) =>
              setFormData((prev: any) => ({ ...prev, valor_mensalidade: e.target.value }))
            }
          />
          <TextField
            label="Observações"
            multiline
            rows={3}
            fullWidth
            value={formData.observacoes || ""}
            onChange={(e) =>
              setFormData((prev: any) => ({ ...prev, observacoes: e.target.value }))
            }
          />

          {curso?.tipo_formulario === "completo" && (
            <>
              {/* Seção Gênero & Emergência */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} color="text.secondary" gutterBottom>
                  Dados Pessoais, Documentos & Emergência
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={2}>
                  <Stack direction="row" spacing={2}>
                    <TextField
                      label="CPF"
                      size="small"
                      placeholder="000.000.000-00"
                      fullWidth
                      value={formData.cpf || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, cpf: e.target.value }))
                      }
                    />
                    <TextField
                      label="RG"
                      size="small"
                      fullWidth
                      value={formData.rg || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, rg: e.target.value }))
                      }
                    />
                  </Stack>
                  <Stack direction="row" spacing={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="estado-civil-label">Estado Civil</InputLabel>
                      <Select
                        labelId="estado-civil-label"
                        id="estado-civil-select"
                        value={formData.estado_civil || ""}
                        label="Estado Civil"
                        onChange={(e) =>
                          setFormData((prev: any) => ({ ...prev, estado_civil: e.target.value }))
                        }
                      >
                        <MenuItem value="Solteiro(a)">Solteiro(a)</MenuItem>
                        <MenuItem value="Casado(a)">Casado(a)</MenuItem>
                        <MenuItem value="Divorciado(a)">Divorciado(a)</MenuItem>
                        <MenuItem value="Viúvo(a)">Viúvo(a)</MenuItem>
                        <MenuItem value="União Estável">União Estável</MenuItem>
                        <MenuItem value="Outro">Outro</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      label="Profissão"
                      size="small"
                      fullWidth
                      value={formData.profissao || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, profissao: e.target.value }))
                      }
                    />
                  </Stack>
                  <FormControl fullWidth size="small">
                    <InputLabel id="genero-label">Gênero</InputLabel>
                    <Select
                      labelId="genero-label"
                      id="genero-select"
                      value={formData.genero || ""}
                      label="Gênero"
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, genero: e.target.value }))
                      }
                    >
                      <MenuItem value="Masculino">Masculino</MenuItem>
                      <MenuItem value="Feminino">Feminino</MenuItem>
                      <MenuItem value="Outro">Outro</MenuItem>
                      <MenuItem value="Prefiro não responder">Prefiro não responder</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="Nome do Contato de Emergência"
                    fullWidth
                    size="small"
                    value={formData.emergencia_contato || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, emergencia_contato: e.target.value }))
                    }
                  />
                  <TextField
                    label="Telefone de Emergência"
                    fullWidth
                    placeholder="(11) 99999-9999"
                    size="small"
                    value={formData.emergencia_fone || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, emergencia_fone: e.target.value }))
                    }
                  />
                </Stack>
              </Box>

              {/* Seção Endereço */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} color="text.secondary" gutterBottom>
                  Endereço Residencial
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      label="CEP"
                      size="small"
                      placeholder="00000-000"
                      value={formData.cep || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, cep: e.target.value.replace(/[^\d-]/g, "").slice(0, 9) }))
                      }
                      onBlur={() => lookupCep(formData.cep)}
                      error={!!cepError}
                      helperText={cepError}
                      fullWidth
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={cepLoading}
                      onClick={() => lookupCep(formData.cep)}
                    >
                      {cepLoading ? <CircularProgress size={20} /> : "Buscar"}
                    </Button>
                  </Stack>
                  <TextField
                    label="Logradouro"
                    size="small"
                    value={formData.logradouro || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, logradouro: e.target.value }))
                    }
                    fullWidth
                  />
                  <Stack direction="row" spacing={2}>
                    <TextField
                      label="Número"
                      size="small"
                      value={formData.numero || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, numero: e.target.value }))
                      }
                      sx={{ width: "120px" }}
                    />
                    <TextField
                      label="Complemento"
                      size="small"
                      value={formData.complemento || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, complemento: e.target.value }))
                      }
                      fullWidth
                    />
                  </Stack>
                  <TextField
                    label="Bairro"
                    size="small"
                    value={formData.bairro || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, bairro: e.target.value }))
                    }
                    fullWidth
                  />
                  <Stack direction="row" spacing={2}>
                    <TextField
                      label="Cidade"
                      size="small"
                      value={formData.cidade || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, cidade: e.target.value }))
                      }
                      fullWidth
                    />
                    <TextField
                      label="Estado"
                      size="small"
                      value={formData.estado || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, estado: e.target.value.toUpperCase().slice(0, 2) }))
                      }
                      sx={{ width: "100px" }}
                    />
                  </Stack>
                </Stack>
              </Box>

              {/* Seção Perfil Espiritual */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} color="text.secondary" gutterBottom>
                  Ficha e Perfil Espiritual
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="umbanda-exp-label">Já teve experiência/estudo sobre Umbanda?</InputLabel>
                    <Select
                      labelId="umbanda-exp-label"
                      value={formData.experiencia_umbanda || ""}
                      label="Já teve experiência/estudo sobre Umbanda?"
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, experiencia_umbanda: e.target.value }))
                      }
                    >
                      <MenuItem value="Sim">Sim</MenuItem>
                      <MenuItem value="Não">Não</MenuItem>
                      <MenuItem value="Outros">Outros</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel id="filho-contexto-label">Já foi/é filho de algum contexto espiritual?</InputLabel>
                    <Select
                      labelId="filho-contexto-label"
                      value={formData.contato_contexto_espiritual || ""}
                      label="Já foi/é filho de algum contexto espiritual?"
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, contato_contexto_espiritual: e.target.value }))
                      }
                    >
                      <MenuItem value="Sim">Sim</MenuItem>
                      <MenuItem value="Não">Não</MenuItem>
                      <MenuItem value="Outros">Outros</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="O que motivou a busca pelo desenvolvimento mediúnico?"
                    size="small"
                    multiline
                    rows={2}
                    value={formData.motivo_busca_desenvolvimento || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, motivo_busca_desenvolvimento: e.target.value }))
                    }
                    fullWidth
                  />
                  <TextField
                    label="Tem interesse em algum aprendizado específico? Qual?"
                    size="small"
                    multiline
                    rows={2}
                    value={formData.interesse_aprendizado || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, interesse_aprendizado: e.target.value }))
                    }
                    fullWidth
                  />
                  <FormControl fullWidth size="small">
                    <InputLabel id="conhece-terreiro-label">{`Já conhece o Terreiro ${tenantName || "Terreiro"}?`}</InputLabel>
                    <Select
                      labelId="conhece-terreiro-label"
                      value={formData.ja_conhece_terreiro === true ? "Sim" : formData.ja_conhece_terreiro === false ? "Não" : ""}
                      label={`Já conhece o Terreiro ${tenantName || "Terreiro"}?`}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData((prev: any) => ({
                          ...prev,
                          ja_conhece_terreiro: val === "Sim" ? true : val === "Não" ? false : null
                        }));
                      }}
                    >
                      <MenuItem value="Sim">Sim</MenuItem>
                      <MenuItem value="Não">Não</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label={`Como conheceu o Terreiro ${tenantName || "Terreiro"}?`}
                    size="small"
                    value={formData.como_conheceu_terreiro || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, como_conheceu_terreiro: e.target.value }))
                    }
                    fullWidth
                  />
                </Stack>
              </Box>

              {/* Seção Ficha Médica */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} color="text.secondary" gutterBottom>
                  Ficha Médica & Saúde
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={2}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.tem_plano_saude || false}
                        onChange={(e) =>
                          setFormData((prev: any) => ({ ...prev, tem_plano_saude: e.target.checked }))
                        }
                      />
                    }
                    label="Possui Plano de Saúde"
                  />
                  {formData.tem_plano_saude && (
                    <TextField
                      label="Nome do Plano de Saúde"
                      size="small"
                      value={formData.plano_saude_nome || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, plano_saude_nome: e.target.value }))
                      }
                      fullWidth
                    />
                  )}

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.toma_medicamento || false}
                        onChange={(e) =>
                          setFormData((prev: any) => ({ ...prev, toma_medicamento: e.target.checked }))
                        }
                      />
                    }
                    label="Toma Algum Medicamento de Uso Contínuo"
                  />
                  {formData.toma_medicamento && (
                    <TextField
                      label="Medicamentos em Uso"
                      size="small"
                      multiline
                      rows={2}
                      value={formData.medicamentos_nome || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, medicamentos_nome: e.target.value }))
                      }
                      fullWidth
                    />
                  )}

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.tem_doenca_tratamento || false}
                        onChange={(e) =>
                          setFormData((prev: any) => ({ ...prev, tem_doenca_tratamento: e.target.checked }))
                        }
                      />
                    }
                    label="Faz Algum Tratamento de Doença"
                  />
                  {formData.tem_doenca_tratamento && (
                    <TextField
                      label="Tratamento/Doença"
                      size="small"
                      multiline
                      rows={2}
                      value={formData.doenca_tratamento_nome || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, doenca_tratamento_nome: e.target.value }))
                      }
                      fullWidth
                    />
                  )}

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.tem_diabetes || false}
                        onChange={(e) =>
                          setFormData((prev: any) => ({ ...prev, tem_diabetes: e.target.checked }))
                        }
                      />
                    }
                    label="Possui Diabetes"
                  />

                  <TextField
                    label="Outras Condições/Doenças a Mencionar"
                    size="small"
                    multiline
                    rows={2}
                    value={formData.outras_doencas || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, outras_doencas: e.target.value }))
                    }
                    fullWidth
                  />

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.tratamento_psiquiatrico || false}
                        onChange={(e) =>
                          setFormData((prev: any) => ({ ...prev, tratamento_psiquiatrico: e.target.checked }))
                        }
                      />
                    }
                    label="Faz Acompanhamento Psiquiátrico / Remédios Controlados"
                  />
                  {formData.tratamento_psiquiatrico && (
                    <TextField
                      label="Especifique Tratamentos e Remédios Psiquiátricos"
                      size="small"
                      multiline
                      rows={2}
                      value={formData.tratamento_psiquiatrico_detalhes || ""}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, tratamento_psiquiatrico_detalhes: e.target.value }))
                      }
                      fullWidth
                    />
                  )}

                  <TextField
                    label="Restrições Médicas, Físicas ou de Cuidado Especial"
                    size="small"
                    multiline
                    rows={2}
                    value={formData.restricoes_saude || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, restricoes_saude: e.target.value }))
                    }
                    fullWidth
                  />
                </Stack>
              </Box>

              {/* Seção LGPD / Termos */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} color="text.secondary" gutterBottom>
                  Termos e Consentimento (LGPD)
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={1}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.aceita_uso_dados || false}
                        onChange={(e) =>
                          setFormData((prev: any) => ({ ...prev, aceita_uso_dados: e.target.checked }))
                        }
                      />
                    }
                    label="Autoriza o uso dos dados pessoais (LGPD)"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.aceita_uso_imagem || false}
                        onChange={(e) =>
                          setFormData((prev: any) => ({ ...prev, aceita_uso_imagem: e.target.checked }))
                        }
                      />
                    }
                    label="Autoriza o uso de imagem e voz"
                  />
                </Stack>
              </Box>

              {/* Seção Comprovante de Inscrição */}
              <Box sx={{ mt: 2, pt: 2, borderTop: "1px dashed", borderColor: "divider" }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Comprovante de Inscrição (Matrícula)
                </Typography>
                {formData.comprovante_inscricao_filename && (
                  <Box sx={{ mb: 2, p: 1.5, bgcolor: "grey.100", borderRadius: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {formData.comprovante_inscricao_filename}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={async () => {
                          try {
                            const res = await apiClient.get(
                              `/api/v1/admin/cursos-presenciais/${id}/participantes/${editingId}/comprovante`,
                              { responseType: 'blob' },
                            );
                            const url = URL.createObjectURL(res.data);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = formData.comprovante_inscricao_filename || 'comprovante';
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch {
                            showAlert("Erro ao baixar comprovante.", "error");
                          }
                        }}
                      >
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={async () => {
                          if (window.confirm("Deseja remover este comprovante de inscrição?")) {
                            try {
                              await apiClient.delete(`/api/v1/admin/cursos-presenciais/${id}/participantes/${editingId}/comprovante`);
                              setFormData((prev: any) => ({ ...prev, comprovante_inscricao_filename: null }));
                              showAlert("Comprovante de inscrição removido.", "success");
                              fetchParticipantes();
                            } catch {
                              showAlert("Erro ao remover comprovante.", "error");
                            }
                          }
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {formData.comprovante_inscricao_filename ? "Alterar comprovante de inscrição (JPG, PNG, WebP, PDF)" : "Anexar comprovante de inscrição (JPG, PNG, WebP, PDF)"}
                  </Typography>
                  <Button
                    variant="outlined"
                    component="label"
                    size="small"
                    startIcon={<AttachFileIcon />}
                    sx={{ mt: 0.5 }}
                  >
                    {matriculaFile ? matriculaFile.name : 'Selecionar arquivo'}
                    <input
                      type="file"
                      hidden
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      onChange={(e) => setMatriculaFile(e.target.files?.[0] ?? null)}
                    />
                  </Button>
                </Box>
              </Box>
            </>
          )}

          {/* Seção Exclusiva de Pagamento Tradicional (Apenas se gerar_mensalidade for falso e for edição) */}
          {!curso?.gerar_mensalidade && drawerMode === "edit" && (
            <Box
              sx={{
                mt: 2,
                pt: 2,
                borderTop: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Informações de Pagamento
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.pago || false}
                    onChange={(e) =>
                      setFormData((prev: any) => ({
                        ...prev,
                        pago: e.target.checked,
                        valor_pago: e.target.checked && !prev.valor_pago ? prev.valor_mensalidade : prev.valor_pago,
                        data_pagamento: e.target.checked && !prev.data_pagamento ? new Date().toISOString().substring(0, 10) : prev.data_pagamento,
                      }))
                    }
                  />
                }
                label="Marcar como Pago"
              />

              {formData.pago && (
                <Stack spacing={2} mt={1}>
                  <TextField
                    label="Valor Pago (R$)"
                    type="number"
                    fullWidth
                    required
                    value={formData.valor_pago || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, valor_pago: e.target.value }))
                    }
                  />
                  <TextField
                    label="Data do Pagamento"
                    type="date"
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    value={formData.data_pagamento || ""}
                    onChange={(e) =>
                      setFormData((prev: any) => ({ ...prev, data_pagamento: e.target.value }))
                    }
                  />
                </Stack>
              )}
            </Box>
          )}
        </Stack>
      </CrudDrawer>

      {/* Drawer de Pagamento Mensal */}
      <CrudDrawer
        open={paymentDrawerOpen}
        onClose={() => setPaymentDrawerOpen(false)}
        title={paymentItem ? `Mensalidade — ${paymentItem.participante_nome}` : "Registrar Mensalidade"}
        onSave={handleSavePayment}
        saving={paymentSaving}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {mes < toYYYYMM(today) && (
            <Alert severity="warning">
              Você está editando um mês passado. Verifique os dados antes de salvar.
            </Alert>
          )}

          <FormControl size="small" fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={paymentStatus}
              label="Status"
              onChange={(e) => setPaymentStatus(e.target.value as any)}
            >
              <MenuItem value="PAGO">Pago</MenuItem>
              <MenuItem value="PENDENTE">Pendente</MenuItem>
              <MenuItem value="ISENTO">Isento</MenuItem>
            </Select>
          </FormControl>

          {paymentStatus === 'PAGO' && (
            <>
              <TextField
                size="small"
                label="Data do pagamento"
                type="date"
                value={paymentDataPag}
                onChange={(e) => setPaymentDataPag(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <NumericFormat
                customInput={TextField}
                size="small"
                label="Valor pago (R$)"
                fullWidth
                value={paymentValorPago}
                onValueChange={(values) => setPaymentValorPago(values.value)}
                thousandSeparator="."
                decimalSeparator=","
                decimalScale={2}
                fixedDecimalScale
                prefix="R$ "
                allowNegative={false}
              />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Comprovante (JPG, PNG, WebP, PDF — max 5MB)
                </Typography>
                <Button
                  variant="outlined"
                  component="label"
                  size="small"
                  startIcon={<AttachFileIcon />}
                  sx={{ mt: 0.5, display: 'block' }}
                >
                  {paymentFile ? paymentFile.name : 'Anexar arquivo'}
                  <input
                    type="file"
                    hidden
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => setPaymentFile(e.target.files?.[0] ?? null)}
                  />
                </Button>
              </Box>
            </>
          )}

          <TextField
            size="small"
            label="Observação"
            multiline
            rows={3}
            value={paymentObs}
            onChange={(e) => setPaymentObs(e.target.value)}
            fullWidth
          />
        </Box>
      </CrudDrawer>

      {/* Alerts */}
      <Snackbar
        open={alert.open}
        autoHideDuration={6000}
        onClose={() => setAlert((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setAlert((prev) => ({ ...prev, open: false }))}
          severity={alert.severity}
          sx={{ width: "100%" }}
        >
          {alert.message}
        </Alert>
      </Snackbar>
    </AdminLayout>
  );
}
