/**
 * Admin — Participantes de um curso presencial.
 *
 * - Matrículas: `DataTable` (cartões no celular), busca, "Matricular" (desabilitado com o texto
 *   "Turma lotada" quando não há vaga), ficha do participante em `CrudDrawer` com as seções do
 *   formulário completo em `Accordion`. Um único campo de moeda (`MoneyInput`).
 * - Cursos com cobrança mensal: abas Matrículas / Mensalidades (`MonthNavigator` + KPIs só com a
 *   lista do mês carregada + `CobrancaMensal`) / Histórico (gráfico).
 * Gate de plano = `site_builder` (o mesmo do backend); RBAC `cursos_presenciais`.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowLeft,
  CalendarDays,
  Download,
  Loader2,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import AdminLayout from '@/pages/admin/admin_layout';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { KpiCard } from '@/components/admin/KpiCard';
import { ChartCard } from '@/components/charts/ChartCard';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { DateField, MaskedInput, MoneyInput, TextField } from '@/components/fields';
import { maskTelefone } from '@/components/fields/MaskedInput';
import { MonthNavigator } from '@/components/financeiro/MonthNavigator';
import {
  CobrancaKpisGrid,
  CobrancaMensal,
  computeCobrancaKpis,
  type CobrancaItem,
  type CobrancaPagamento,
} from '@/components/financeiro/CobrancaMensal';
import { baixarComprovante, montarFormPagamento, MULTIPART } from '@/components/financeiro/comprovante';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchAllPages } from '@/services/fetchAllPages';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { useTenant } from '@/providers/ThemeProvider';
import { chartTokens, chartTooltipStyle } from '@/lib/chartTokens';
import { currentMonthBr, formatBRL, formatDateBr, formatDateTimeBr, monthLabelShort, toNum, todayBr } from '@/lib/dateBr';
import { IconCurso } from '@/lib/icons';
import { minPlanFor } from '@/constants/plans';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CursoPresencial {
  id: string;
  tenant_id: string;
  titulo: string;
  ementa?: string | null;
  data_inicio: string;
  data_fim?: string | null;
  max_participantes?: number | null;
  valor_mensalidade_padrao?: number | string | null;
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
  data_nascimento?: string | null;
  celular?: string | null;
  email?: string | null;
  valor_mensalidade?: number | string | null;
  pago: boolean;
  valor_pago?: number | string | null;
  data_pagamento?: string | null;
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
  aceita_uso_dados_saude?: boolean;
  comprovante_inscricao_filename?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParticipanteForm {
  nome: string;
  data_nascimento: string | null;
  celular: string;
  email: string;
  valor_mensalidade: number;
  observacoes: string;
  pago: boolean;
  valor_pago: number;
  data_pagamento: string | null;
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
  cpf: string;
  rg: string;
  estado_civil: string;
  profissao: string;
  experiencia_umbanda: string;
  contato_contexto_espiritual: string;
  motivo_busca_desenvolvimento: string;
  interesse_aprendizado: string;
  ja_conhece_terreiro: boolean | null;
  como_conheceu_terreiro: string;
  tratamento_psiquiatrico: boolean;
  tratamento_psiquiatrico_detalhes: string;
  restricoes_saude: string;
  aceita_uso_dados: boolean;
  aceita_uso_imagem: boolean;
  /** Consentimento LGPD explícito para dados de saúde (art. 11) — nunca inferido. */
  aceita_uso_dados_saude: boolean;
  comprovante_inscricao_filename: string | null;
}

/** Linha de GET .../financeiro/mensalidades (Decimal chega como string). */
interface MensalidadeItem {
  participante_id: string;
  participante_nome: string;
  email?: string | null;
  celular?: string | null;
  status: 'PAGO' | 'PENDENTE' | 'ISENTO' | null;
  valor_mensalidade: number | string | null;
  valor_vigente?: number | string | null;
  valor_pago: number | string | null;
  data_pagamento: string | null;
  observacao: string | null;
  comprovante_filename: string | null;
}

interface ResumoFinanceiro {
  historico: { mes: string; esperado: number; arrecadado: number }[];
  projecao: { mes: string; projetado: number }[];
  config: { count_ativos: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Dia de vencimento das mensalidades de curso (o backend não tem configuração própria). */
const DIA_VENCIMENTO_CURSO = 10;

export { toNum };

export function mensalidadeToCobranca(i: MensalidadeItem): CobrancaItem {
  return {
    id: i.participante_id,
    nome: i.participante_nome,
    descricao: i.email || (i.celular ? maskTelefone(i.celular) : null),
    status: i.status,
    data_pagamento: i.data_pagamento,
    valor_vigente: toNum(i.valor_vigente) ?? toNum(i.valor_mensalidade),
    valor_pago: toNum(i.valor_pago),
    comprovante_filename: i.comprovante_filename,
    observacao: i.observacao,
  };
}

/** Data (sem hora) de um instante ISO no fuso de Brasília. */
const dataBr = (iso: string | null | undefined) => (iso ? formatDateTimeBr(iso).slice(0, 10) : '—');

/** Turma lotada: há limite e as vagas acabaram. */
export function turmaLotada(max: number | null | undefined, ocupadas: number): boolean {
  return max != null && max > 0 && ocupadas >= max;
}

function emptyForm(valorPadrao: number | null): ParticipanteForm {
  return {
    nome: '',
    data_nascimento: null,
    celular: '',
    email: '',
    valor_mensalidade: valorPadrao ?? 0,
    observacoes: '',
    pago: false,
    valor_pago: 0,
    data_pagamento: null,
    genero: '',
    emergencia_contato: '',
    emergencia_fone: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    tem_plano_saude: false,
    plano_saude_nome: '',
    toma_medicamento: false,
    medicamentos_nome: '',
    tem_doenca_tratamento: false,
    doenca_tratamento_nome: '',
    tem_diabetes: false,
    outras_doencas: '',
    cpf: '',
    rg: '',
    estado_civil: '',
    profissao: '',
    experiencia_umbanda: '',
    contato_contexto_espiritual: '',
    motivo_busca_desenvolvimento: '',
    interesse_aprendizado: '',
    ja_conhece_terreiro: null,
    como_conheceu_terreiro: '',
    tratamento_psiquiatrico: false,
    tratamento_psiquiatrico_detalhes: '',
    restricoes_saude: '',
    aceita_uso_dados: false,
    aceita_uso_imagem: false,
    aceita_uso_dados_saude: false,
    comprovante_inscricao_filename: null,
  };
}

function participanteToForm(p: Participante): ParticipanteForm {
  const valorMensal = toNum(p.valor_mensalidade) ?? 0;
  return {
    nome: p.nome,
    data_nascimento: p.data_nascimento || null,
    celular: p.celular || '',
    email: p.email || '',
    valor_mensalidade: valorMensal,
    observacoes: p.observacoes || '',
    pago: p.pago,
    valor_pago: toNum(p.valor_pago) ?? valorMensal,
    data_pagamento: p.data_pagamento ? p.data_pagamento.slice(0, 10) : todayBr(),
    genero: p.genero || '',
    emergencia_contato: p.emergencia_contato || '',
    emergencia_fone: p.emergencia_fone || '',
    cep: p.cep || '',
    logradouro: p.logradouro || '',
    numero: p.numero || '',
    complemento: p.complemento || '',
    bairro: p.bairro || '',
    cidade: p.cidade || '',
    estado: p.estado || '',
    tem_plano_saude: !!p.tem_plano_saude,
    plano_saude_nome: p.plano_saude_nome || '',
    toma_medicamento: !!p.toma_medicamento,
    medicamentos_nome: p.medicamentos_nome || '',
    tem_doenca_tratamento: !!p.tem_doenca_tratamento,
    doenca_tratamento_nome: p.doenca_tratamento_nome || '',
    tem_diabetes: !!p.tem_diabetes,
    outras_doencas: p.outras_doencas || '',
    cpf: p.cpf || '',
    rg: p.rg || '',
    estado_civil: p.estado_civil || '',
    profissao: p.profissao || '',
    experiencia_umbanda: p.experiencia_umbanda || '',
    contato_contexto_espiritual: p.contato_contexto_espiritual || '',
    motivo_busca_desenvolvimento: p.motivo_busca_desenvolvimento || '',
    interesse_aprendizado: p.interesse_aprendizado || '',
    ja_conhece_terreiro: p.ja_conhece_terreiro ?? null,
    como_conheceu_terreiro: p.como_conheceu_terreiro || '',
    tratamento_psiquiatrico: !!p.tratamento_psiquiatrico,
    tratamento_psiquiatrico_detalhes: p.tratamento_psiquiatrico_detalhes || '',
    restricoes_saude: p.restricoes_saude || '',
    aceita_uso_dados: !!p.aceita_uso_dados,
    aceita_uso_imagem: !!p.aceita_uso_imagem,
    aceita_uso_dados_saude: !!p.aceita_uso_dados_saude,
    comprovante_inscricao_filename: p.comprovante_inscricao_filename || null,
  };
}

/** Payload do POST/PUT de participante (mesmo formato de antes da migração). */
export function formToPayload(f: ParticipanteForm, mode: 'create' | 'edit'): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nome: f.nome.trim(),
    data_nascimento: f.data_nascimento || null,
    celular: f.celular || null,
    email: f.email.trim() || null,
    valor_mensalidade: f.valor_mensalidade > 0 ? f.valor_mensalidade : null,
    observacoes: f.observacoes || null,
    genero: f.genero || null,
    emergencia_contato: f.emergencia_contato || null,
    emergencia_fone: f.emergencia_fone || null,
    cep: f.cep || null,
    logradouro: f.logradouro || null,
    numero: f.numero || null,
    complemento: f.complemento || null,
    bairro: f.bairro || null,
    cidade: f.cidade || null,
    estado: f.estado || null,
    tem_plano_saude: f.tem_plano_saude,
    plano_saude_nome: f.tem_plano_saude ? f.plano_saude_nome || null : null,
    toma_medicamento: f.toma_medicamento,
    medicamentos_nome: f.toma_medicamento ? f.medicamentos_nome || null : null,
    tem_doenca_tratamento: f.tem_doenca_tratamento,
    doenca_tratamento_nome: f.tem_doenca_tratamento ? f.doenca_tratamento_nome || null : null,
    tem_diabetes: f.tem_diabetes,
    outras_doencas: f.outras_doencas || null,
    cpf: f.cpf || null,
    rg: f.rg || null,
    estado_civil: f.estado_civil || null,
    profissao: f.profissao || null,
    experiencia_umbanda: f.experiencia_umbanda || null,
    contato_contexto_espiritual: f.contato_contexto_espiritual || null,
    motivo_busca_desenvolvimento: f.motivo_busca_desenvolvimento || null,
    interesse_aprendizado: f.interesse_aprendizado || null,
    ja_conhece_terreiro: f.ja_conhece_terreiro,
    como_conheceu_terreiro: f.como_conheceu_terreiro || null,
    tratamento_psiquiatrico: f.tratamento_psiquiatrico,
    tratamento_psiquiatrico_detalhes: f.tratamento_psiquiatrico ? f.tratamento_psiquiatrico_detalhes || null : null,
    restricoes_saude: f.restricoes_saude || null,
    aceita_uso_dados: f.aceita_uso_dados,
    aceita_uso_imagem: f.aceita_uso_imagem,
    aceita_uso_dados_saude: f.aceita_uso_dados_saude,
  };
  if (mode === 'edit') {
    payload.pago = f.pago;
    if (f.pago) {
      payload.valor_pago = f.valor_pago > 0 ? f.valor_pago : null;
      // Data pura (sem hora): meio-dia de Brasília cai no MESMO dia em UTC. `new Date('YYYY-MM-DD')`
      // virava meia-noite UTC = 21h do dia anterior em Brasília (exibia um dia antes).
      payload.data_pagamento = f.data_pagamento ? `${f.data_pagamento}T12:00:00-03:00` : null;
    }
  }
  return payload;
}

// ─── Campos auxiliares ────────────────────────────────────────────────────────

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = 'Selecione',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CheckField({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <Label htmlFor={id} className="font-normal leading-snug">
        {label}
      </Label>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ParticipantesPage() {
  return (
    <AdminLayout title="Participantes">
      <ParticipantesContent />
    </AdminLayout>
  );
}

function ParticipantesContent() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const { can, loading: subLoading } = useSubscription();
  const { tenantName } = useTenant();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('cursos_presenciais', 'view');
  const canInsert = canGroup('cursos_presenciais', 'insert');
  const canEdit = canGroup('cursos_presenciais', 'edit');
  const canDelete = canGroup('cursos_presenciais', 'delete');
  const isPlanAllowed = can('site_builder');

  const [curso, setCurso] = useState<CursoPresencial | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState('matriculas');

  // Ficha
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ParticipanteForm>(() => emptyForm(null));
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matriculaFile, setMatriculaFile] = useState<File | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');

  // Remoções
  const [removeTarget, setRemoveTarget] = useState<Participante | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeCompOpen, setRemoveCompOpen] = useState(false);

  // Mensalidades
  const [mes, setMes] = useState<string>(currentMonthBr());
  const [mensalidades, setMensalidades] = useState<CobrancaItem[] | null>(null);
  const [loadingMensalidades, setLoadingMensalidades] = useState(false);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [loadingResumo, setLoadingResumo] = useState(false);

  const gerarMensalidade = !!curso?.gerar_mensalidade;
  const valorPadrao = toNum(curso?.valor_mensalidade_padrao);
  const base = `/api/v1/admin/cursos-presenciais/${id}`;

  // ── Fetchers ────────────────────────────────────────────────────────
  const fetchParticipantes = useCallback(async () => {
    if (!id || !canView) return;
    try {
      // Backend corta em 100 por padrão: busca todas as páginas (máx. 1000/página).
      const lista = await fetchAllPages<Participante>(`/api/v1/admin/cursos-presenciais/${id}/participantes`, { pageSize: 1000 });
      setParticipantes(lista);
    } catch {
      showError('Não foi possível carregar a lista de participantes.');
    }
  }, [id, canView, showError]);

  const loadData = useCallback(async () => {
    if (!id || !canView || !isPlanAllowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchCurso = apiClient
      .get<CursoPresencial>(`/api/v1/admin/cursos-presenciais/${id}`)
      .then((res) => setCurso(res.data))
      .catch(() => showError('Não foi possível carregar as informações do curso.'));
    await Promise.all([fetchCurso, fetchParticipantes()]);
    setLoading(false);
  }, [id, canView, isPlanAllowed, fetchParticipantes, showError]);

  const fetchMensalidades = useCallback(async () => {
    if (!id || !gerarMensalidade || !canView) return;
    setLoadingMensalidades(true);
    setMensalidades(null);
    try {
      const res = await apiClient.get<MensalidadeItem[]>(
        `/api/v1/admin/cursos-presenciais/${id}/financeiro/mensalidades?mes=${mes}`,
      );
      setMensalidades(res.data.map(mensalidadeToCobranca));
    } catch {
      showError('Não foi possível carregar as mensalidades do curso.');
    } finally {
      setLoadingMensalidades(false);
    }
  }, [id, mes, gerarMensalidade, canView, showError]);

  const fetchResumo = useCallback(async () => {
    if (!id || !gerarMensalidade || !canView) return;
    setLoadingResumo(true);
    try {
      const res = await apiClient.get<ResumoFinanceiro>(`/api/v1/admin/cursos-presenciais/${id}/financeiro/resumo`);
      setResumo(res.data);
    } catch {
      setResumo(null);
    } finally {
      setLoadingResumo(false);
    }
  }, [id, gerarMensalidade, canView]);

  useEffect(() => {
    if (subLoading || !router.isReady) return;
    loadData();
  }, [subLoading, router.isReady, loadData]);

  useEffect(() => {
    if (tab === 'mensalidades') fetchMensalidades();
  }, [tab, fetchMensalidades]);

  useEffect(() => {
    if (tab === 'historico') fetchResumo();
  }, [tab, fetchResumo]);

  // ── Ficha ───────────────────────────────────────────────────────────
  const setField = <K extends keyof ParticipanteForm>(key: K, value: ParticipanteForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const openCreate = () => {
    setDrawerMode('create');
    setEditingId(null);
    setMatriculaFile(null);
    setForm(emptyForm(valorPadrao));
    setCepError('');
    setDirty(false);
    setTouched(false);
    setDrawerOpen(true);
  };

  const openEdit = (p: Participante) => {
    setDrawerMode('edit');
    setEditingId(p.id);
    setMatriculaFile(null);
    setForm(participanteToForm(p));
    setCepError('');
    setDirty(false);
    setTouched(false);
    setDrawerOpen(true);
  };

  const lookupCep = async (rawCep: string) => {
    if (!rawCep) return;
    const digits = rawCep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepError(digits.length > 0 ? 'CEP deve ter 8 dígitos' : '');
      return;
    }
    setCepError('');
    setCepLoading(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const json = await resp.json();
      if (json.erro) {
        setCepError('CEP não encontrado');
        return;
      }
      setForm((prev) => ({
        ...prev,
        cep: digits,
        logradouro: json.logradouro || '',
        bairro: json.bairro || '',
        cidade: json.localidade || '',
        estado: json.uf || '',
      }));
      setDirty(true);
    } catch {
      setCepError('Erro ao consultar CEP.');
    } finally {
      setCepLoading(false);
    }
  };

  const handleSave = async () => {
    setTouched(true);
    if (!form.nome.trim()) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    try {
      let savedId = editingId;
      const payload = formToPayload(form, drawerMode);
      if (drawerMode === 'create') {
        const res = await apiClient.post(`${base}/participantes`, payload);
        savedId = res.data.id;
        showSuccess('Participante matriculado.');
      } else if (editingId) {
        await apiClient.put(`${base}/participantes/${editingId}`, payload);
        showSuccess('Cadastro do participante atualizado.');
      }
      if (matriculaFile && savedId && canInsert) {
        const fd = new FormData();
        fd.append('comprovante', matriculaFile);
        await apiClient.post(`${base}/participantes/${savedId}/comprovante`, fd, MULTIPART);
      }
      setDrawerOpen(false);
      setDirty(false);
      fetchParticipantes();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Erro ao salvar participante.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget || !canDelete) return;
    setRemoving(true);
    try {
      await apiClient.delete(`${base}/participantes/${removeTarget.id}`);
      showSuccess('Participante removido.');
      fetchParticipantes();
    } catch {
      showError('Erro ao remover participante.');
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  const baixarInscricao = (participanteId: string, filename: string | null | undefined) =>
    baixarComprovante(`${base}/participantes/${participanteId}/comprovante`, filename || 'comprovante-inscricao').catch(() =>
      showError('Comprovante de inscrição não encontrado.'),
    );

  const handleRemoveComprovante = async () => {
    if (!canDelete || !editingId) return;
    try {
      await apiClient.delete(`${base}/participantes/${editingId}/comprovante`);
      setForm((prev) => ({ ...prev, comprovante_inscricao_filename: null }));
      showSuccess('Comprovante de inscrição removido.');
      fetchParticipantes();
    } catch {
      showError('Erro ao remover comprovante.');
    } finally {
      setRemoveCompOpen(false);
    }
  };

  // ── Mensalidades ────────────────────────────────────────────────────
  const registrarMensalidade = async (item: CobrancaItem, p: CobrancaPagamento) => {
    try {
      await apiClient.post(`${base}/financeiro/mensalidades/${item.id}/${mes}`, montarFormPagamento(p), MULTIPART);
    } catch (err) {
      throw new Error(extractApiErrorMessage(err, 'Erro ao registrar pagamento.'));
    }
  };

  const baixarMensalidade = (item: CobrancaItem) =>
    baixarComprovante(`${base}/financeiro/mensalidades/${item.id}/${mes}/comprovante`, item.comprovante_filename).catch(() =>
      showError('Comprovante não encontrado.'),
    );

  const kpis = useMemo(
    () =>
      mensalidades && !loadingMensalidades
        ? computeCobrancaKpis([{ items: mensalidades, valor: valorPadrao }], mes, DIA_VENCIMENTO_CURSO)
        : null,
    [mensalidades, loadingMensalidades, valorPadrao, mes],
  );

  // ── Derivados ───────────────────────────────────────────────────────
  const filteredParticipantes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return participantes;
    return participantes.filter((p) => p.nome.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q));
  }, [participantes, searchQuery]);

  const totalVagas = curso?.max_participantes ?? null;
  const ocupadas = participantes.length;
  const lotada = turmaLotada(totalVagas, ocupadas);
  const faturamentoEstimado = participantes.reduce((sum, p) => sum + (toNum(p.valor_mensalidade) ?? 0), 0);

  const chartData = useMemo(
    () =>
      resumo
        ? [
            ...resumo.historico.map((h) => ({ mes: monthLabelShort(h.mes), Esperado: h.esperado, Arrecadado: h.arrecadado })),
            ...resumo.projecao.map((p) => ({ mes: monthLabelShort(p.mes), Projetado: p.projetado })),
          ]
        : [],
    [resumo],
  );

  const RowActions = ({ p }: { p: Participante }) =>
    canEdit || canDelete ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${p.nome}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem onSelect={() => openEdit(p)}>
              <Pencil />
              {gerarMensalidade ? 'Editar matrícula' : 'Editar matrícula / pagamento'}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem variant="destructive" onSelect={() => setRemoveTarget(p)}>
              <Trash2 />
              Remover matrícula
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const fichaIncompleta = (p: Participante) =>
    curso?.tipo_formulario === 'completo' && (!p.cep || !p.emergencia_contato || !p.emergencia_fone);
  const valorCustomizado = (p: Participante) =>
    valorPadrao != null && toNum(p.valor_mensalidade) != null && toNum(p.valor_mensalidade) !== valorPadrao;

  const columns = useMemo<ColumnDef<Participante>[]>(() => {
    const cols: ColumnDef<Participante>[] = [
      {
        accessorKey: 'nome',
        header: 'Nome',
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className="truncate">{row.original.nome}</span>
            {fichaIncompleta(row.original) && (
              <Badge className="border-transparent bg-warning text-warning-foreground" title="Ficha médica/endereço pendente">
                Ficha incompleta
              </Badge>
            )}
            {/* Imagem e voz são opcionais na inscrição: avisa quem não pode aparecer em fotos/vídeos. */}
            {!row.original.aceita_uso_imagem && (
              <Badge variant="outline" title="Não autorizou o uso de imagem e voz — não usar em fotos, vídeos ou divulgação">
                Sem uso de imagem
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: 'contato',
        header: 'Contato',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{row.original.email || '—'}</span>
            {row.original.celular && (
              <span className="text-xs text-muted-foreground">{maskTelefone(row.original.celular)}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'data_nascimento',
        header: 'Nascimento',
        cell: ({ getValue }) => formatDateBr(getValue<string | null>()),
      },
      {
        id: 'mensalidade',
        header: 'Mensalidade',
        accessorFn: (p) => toNum(p.valor_mensalidade) ?? 0,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
            <span className={valorCustomizado(row.original) ? 'font-bold' : undefined}>
              {formatBRL(toNum(row.original.valor_mensalidade) ?? 0)}
            </span>
            {valorCustomizado(row.original) && (
              <Badge variant="outline" className="text-[0.65rem]" title="Valor diferente do padrão do curso">
                personalizado
              </Badge>
            )}
          </span>
        ),
      },
    ];
    if (!gerarMensalidade) {
      cols.push({
        id: 'pagamento',
        header: 'Pagamento',
        accessorFn: (p) => (p.pago ? 1 : 0),
        cell: ({ row }) =>
          row.original.pago ? (
            <div className="flex flex-col">
              <Badge className="w-fit border-transparent bg-success text-success-foreground">Pago</Badge>
              <span className="mt-0.5 text-xs text-muted-foreground">
                {formatBRL(toNum(row.original.valor_pago) ?? 0)} · {formatDateBr(row.original.data_pagamento)}
              </span>
            </div>
          ) : (
            <Badge className="border-transparent bg-warning text-warning-foreground">Pendente</Badge>
          ),
      });
    }
    cols.push({
      id: 'comprovante',
      header: 'Inscrição',
      enableSorting: false,
      meta: { align: 'center' },
      cell: ({ row }) =>
        row.original.comprovante_inscricao_filename ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title={row.original.comprovante_inscricao_filename}
            aria-label={`Baixar comprovante de inscrição de ${row.original.nome}`}
            onClick={() => baixarInscricao(row.original.id, row.original.comprovante_inscricao_filename)}
          >
            <Download />
          </Button>
        ) : (
          <Paperclip className="mx-auto size-4 text-ghost" aria-label="Sem comprovante" />
        ),
    });
    if (canEdit || canDelete) {
      cols.push({
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => <RowActions p={row.original} />,
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gerarMensalidade, canEdit, canDelete, valorPadrao, curso?.tipo_formulario, id]);

  const renderCard = (p: Participante) => (
    <div className="flex items-start gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 font-medium">
          <span className="truncate">{p.nome}</span>
          {fichaIncompleta(p) && (
            <Badge className="border-transparent bg-warning text-warning-foreground">Ficha incompleta</Badge>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[p.email, p.celular ? maskTelefone(p.celular) : null].filter(Boolean).join(' · ') || 'Sem contato'}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs">
          <span>Mensalidade {formatBRL(toNum(p.valor_mensalidade) ?? 0)}</span>
          {!gerarMensalidade &&
            (p.pago ? (
              <Badge className="border-transparent bg-success text-success-foreground">Pago</Badge>
            ) : (
              <Badge className="border-transparent bg-warning text-warning-foreground">Pendente</Badge>
            ))}
        </span>
        {p.comprovante_inscricao_filename && (
          <Button
            variant="outline"
            size="sm"
            className="mt-1 self-start"
            onClick={() => baixarInscricao(p.id, p.comprovante_inscricao_filename)}
          >
            <Download />
            Comprovante de inscrição
          </Button>
        )}
      </div>
      <RowActions p={p} />
    </div>
  );

  // ── Gates ───────────────────────────────────────────────────────────
  if (subLoading || (loading && !curso)) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!isPlanAllowed) return <PlanLocked feature="Cursos Presenciais" minPlan={minPlanFor('site_builder').label} />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar participantes." />;

  const completo = curso?.tipo_formulario === 'completo';
  const nomeTerreiro = tenantName || 'Terreiro';

  // ── Blocos ──────────────────────────────────────────────────────────
  const matriculas = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard
          label="Vagas preenchidas"
          value={`${ocupadas} / ${totalVagas ?? 'sem limite'}`}
          color={lotada ? 'var(--warning)' : undefined}
          subtitle={lotada ? 'Turma lotada' : undefined}
        />
        <KpiCard
          label="Faturamento mensal estimado"
          value={formatBRL(faturamentoEstimado)}
          icon={<Wallet />}
          color="var(--success)"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <TextField
          aria-label="Buscar participante"
          placeholder="Buscar por nome ou e-mail..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          startAdornment={<Search />}
          size="small"
          className="sm:max-w-sm"
        />
        {canInsert && (
          <Button onClick={openCreate} disabled={lotada}>
            <UserPlus />
            {lotada ? 'Turma lotada' : 'Matricular'}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredParticipantes}
        getRowId={(p) => p.id}
        loading={loading}
        pageSize={25}
        renderCard={renderCard}
        emptyMessage={participantes.length === 0 ? 'Nenhum participante matriculado.' : 'Nenhum participante encontrado.'}
      />
    </div>
  );

  const mensalidadesBloco = (
    <div className="flex flex-col gap-4">
      <MonthNavigator value={mes} onChange={setMes} onRefresh={fetchMensalidades} refreshing={loadingMensalidades} />
      <CobrancaKpisGrid kpis={kpis} loading={!kpis} />
      <CobrancaMensal
        mes={mes}
        items={mensalidades ?? []}
        loading={loadingMensalidades || mensalidades === null}
        diaVencimento={DIA_VENCIMENTO_CURSO}
        valorPadrao={valorPadrao}
        canEdit={canInsert}
        entidade="participante"
        onRegistrar={registrarMensalidade}
        onChanged={fetchMensalidades}
        onDownloadComprovante={baixarMensalidade}
      />
    </div>
  );

  const historico = (
    <div className="flex flex-col gap-4">
      <ChartCard
        title="Cobrança e arrecadação"
        subtitle="Histórico mensal e projeção pelas mensalidades vigentes"
        loading={loadingResumo}
        empty={chartData.length === 0}
        height={300}
        footer="A projeção usa as mensalidades vigentes de cada participante ativo."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.grid} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: chartTokens.tick }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
              tick={{ fontSize: 11, fill: chartTokens.tick }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatBRL(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
            <Bar dataKey="Esperado" fill={chartTokens.muted} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="Arrecadado" fill={chartTokens.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="Projetado" fill={chartTokens.info} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard label="Participantes ativos" value={resumo?.config.count_ativos ?? '—'} loading={loadingResumo} />
        <KpiCard
          label="Projeção do próximo mês"
          value={resumo ? formatBRL(resumo.projecao[0]?.projetado ?? 0) : '—'}
          loading={loadingResumo}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => router.push('/admin/cursos-presenciais')}>
          <ArrowLeft />
          Cursos
        </Button>
        <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">{curso?.titulo ?? 'Curso'}</h1>
        {curso?.ementa && <p className="m-0 text-sm text-muted-foreground">{curso.ementa}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {curso?.local && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4" aria-hidden />
              {curso.local}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-4" aria-hidden />
            Início {dataBr(curso?.data_inicio)}
            {curso?.data_fim ? ` · término ${dataBr(curso.data_fim)}` : ''}
          </span>
          {valorPadrao != null && (
            <span className="inline-flex items-center gap-1">
              <Wallet className="size-4" aria-hidden />
              Mensalidade padrão {formatBRL(valorPadrao)}
            </span>
          )}
        </div>
      </div>

      {gerarMensalidade ? (
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="matriculas">Matrículas</TabsTrigger>
            <TabsTrigger value="mensalidades">Mensalidades</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>
          <TabsContent value="matriculas">{matriculas}</TabsContent>
          <TabsContent value="mensalidades">{mensalidadesBloco}</TabsContent>
          <TabsContent value="historico">{historico}</TabsContent>
        </Tabs>
      ) : (
        matriculas
      )}

      {/* Ficha do participante */}
      <CrudDrawer
        title={drawerMode === 'create' ? 'Matricular participante' : 'Editar matrícula'}
        subtitle={
          drawerMode === 'create'
            ? 'Preencha as informações do novo participante.'
            : 'Atualize os dados cadastrais e observações do participante.'
        }
        icon={<IconCurso />}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        saving={saving}
        isDirty={dirty}
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nome do participante"
            required
            value={form.nome}
            onChange={(e) => setField('nome', e.target.value)}
            error={touched && !form.nome.trim() ? 'Informe o nome' : undefined}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DateField
              label="Data de nascimento"
              value={form.data_nascimento}
              max={todayBr()}
              onChange={(v) => setField('data_nascimento', v)}
            />
            <MaskedInput mask="telefone" label="Celular" value={form.celular} onChange={(v) => setField('celular', v)} />
          </div>
          <TextField label="E-mail" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
          <MoneyInput
            label="Mensalidade individual"
            value={form.valor_mensalidade}
            onChange={(v) => setField('valor_mensalidade', v)}
            helperText="Deixe R$ 0,00 para usar o valor padrão do curso."
          />
          <TextField label="Observações" multiline rows={3} value={form.observacoes} onChange={(e) => setField('observacoes', e.target.value)} />

          {completo && (
            <Accordion type="multiple" defaultValue={['pessoais']} className="rounded-lg border px-3">
              <AccordionItem value="pessoais">
                <AccordionTrigger>Dados pessoais, documentos e emergência</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-4 px-0.5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <MaskedInput mask="cpf" label="CPF" value={form.cpf} onChange={(v) => setField('cpf', v)} />
                    <TextField label="RG" value={form.rg} onChange={(e) => setField('rg', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <SelectField
                      id="part-estado-civil"
                      label="Estado civil"
                      value={form.estado_civil}
                      onChange={(v) => setField('estado_civil', v)}
                      options={['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável', 'Outro']}
                    />
                    <TextField label="Profissão" value={form.profissao} onChange={(e) => setField('profissao', e.target.value)} />
                  </div>
                  <SelectField
                    id="part-genero"
                    label="Gênero"
                    value={form.genero}
                    onChange={(v) => setField('genero', v)}
                    options={['Masculino', 'Feminino', 'Outro', 'Prefiro não responder']}
                  />
                  <TextField
                    label="Contato de emergência"
                    value={form.emergencia_contato}
                    onChange={(e) => setField('emergencia_contato', e.target.value)}
                  />
                  <MaskedInput
                    mask="telefone"
                    label="Telefone de emergência"
                    value={form.emergencia_fone}
                    onChange={(v) => setField('emergencia_fone', v)}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="endereco">
                <AccordionTrigger>Endereço residencial</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-4 px-0.5">
                  <div className="flex items-start gap-2">
                    <TextField
                      label="CEP"
                      placeholder="00000-000"
                      inputMode="numeric"
                      value={form.cep}
                      onChange={(e) => setField('cep', e.target.value.replace(/[^\d-]/g, '').slice(0, 9))}
                      onBlur={() => lookupCep(form.cep)}
                      error={cepError || undefined}
                    />
                    <Button type="button" variant="outline" className="mt-[1.375rem]" disabled={cepLoading} onClick={() => lookupCep(form.cep)}>
                      {cepLoading ? <Loader2 className="animate-spin" /> : 'Buscar'}
                    </Button>
                  </div>
                  <TextField label="Logradouro" value={form.logradouro} onChange={(e) => setField('logradouro', e.target.value)} />
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4">
                    <TextField label="Número" value={form.numero} onChange={(e) => setField('numero', e.target.value)} />
                    <TextField label="Complemento" value={form.complemento} onChange={(e) => setField('complemento', e.target.value)} />
                  </div>
                  <TextField label="Bairro" value={form.bairro} onChange={(e) => setField('bairro', e.target.value)} />
                  <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-4">
                    <TextField label="Cidade" value={form.cidade} onChange={(e) => setField('cidade', e.target.value)} />
                    <TextField
                      label="UF"
                      value={form.estado}
                      onChange={(e) => setField('estado', e.target.value.toUpperCase().slice(0, 2))}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="espiritual">
                <AccordionTrigger>Ficha e perfil espiritual</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-4 px-0.5">
                  <SelectField
                    id="part-exp-umbanda"
                    label="Já teve experiência/estudo sobre Umbanda?"
                    value={form.experiencia_umbanda}
                    onChange={(v) => setField('experiencia_umbanda', v)}
                    options={['Sim', 'Não', 'Outros']}
                  />
                  <SelectField
                    id="part-contexto"
                    label="Já foi/é filho de algum contexto espiritual?"
                    value={form.contato_contexto_espiritual}
                    onChange={(v) => setField('contato_contexto_espiritual', v)}
                    options={['Sim', 'Não', 'Outros']}
                  />
                  <TextField
                    label="O que motivou a busca pelo desenvolvimento mediúnico?"
                    multiline
                    rows={2}
                    value={form.motivo_busca_desenvolvimento}
                    onChange={(e) => setField('motivo_busca_desenvolvimento', e.target.value)}
                  />
                  <TextField
                    label="Tem interesse em algum aprendizado específico? Qual?"
                    multiline
                    rows={2}
                    value={form.interesse_aprendizado}
                    onChange={(e) => setField('interesse_aprendizado', e.target.value)}
                  />
                  <SelectField
                    id="part-conhece"
                    label={`Já conhece o Terreiro ${nomeTerreiro}?`}
                    value={form.ja_conhece_terreiro === true ? 'Sim' : form.ja_conhece_terreiro === false ? 'Não' : ''}
                    onChange={(v) => setField('ja_conhece_terreiro', v === 'Sim' ? true : v === 'Não' ? false : null)}
                    options={['Sim', 'Não']}
                  />
                  <TextField
                    label={`Como conheceu o Terreiro ${nomeTerreiro}?`}
                    value={form.como_conheceu_terreiro}
                    onChange={(e) => setField('como_conheceu_terreiro', e.target.value)}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="saude">
                <AccordionTrigger>Ficha médica e saúde</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3 px-0.5">
                  <CheckField id="part-plano" label="Possui plano de saúde" checked={form.tem_plano_saude} onChange={(v) => setField('tem_plano_saude', v)} />
                  {form.tem_plano_saude && (
                    <TextField label="Nome do plano de saúde" value={form.plano_saude_nome} onChange={(e) => setField('plano_saude_nome', e.target.value)} />
                  )}
                  <CheckField
                    id="part-medicamento"
                    label="Toma algum medicamento de uso contínuo"
                    checked={form.toma_medicamento}
                    onChange={(v) => setField('toma_medicamento', v)}
                  />
                  {form.toma_medicamento && (
                    <TextField
                      label="Medicamentos em uso"
                      multiline
                      rows={2}
                      value={form.medicamentos_nome}
                      onChange={(e) => setField('medicamentos_nome', e.target.value)}
                    />
                  )}
                  <CheckField
                    id="part-doenca"
                    label="Faz algum tratamento de doença"
                    checked={form.tem_doenca_tratamento}
                    onChange={(v) => setField('tem_doenca_tratamento', v)}
                  />
                  {form.tem_doenca_tratamento && (
                    <TextField
                      label="Tratamento/doença"
                      multiline
                      rows={2}
                      value={form.doenca_tratamento_nome}
                      onChange={(e) => setField('doenca_tratamento_nome', e.target.value)}
                    />
                  )}
                  <CheckField id="part-diabetes" label="Possui diabetes" checked={form.tem_diabetes} onChange={(v) => setField('tem_diabetes', v)} />
                  <TextField
                    label="Outras condições/doenças a mencionar"
                    multiline
                    rows={2}
                    value={form.outras_doencas}
                    onChange={(e) => setField('outras_doencas', e.target.value)}
                  />
                  <CheckField
                    id="part-psiq"
                    label="Faz acompanhamento psiquiátrico / remédios controlados"
                    checked={form.tratamento_psiquiatrico}
                    onChange={(v) => setField('tratamento_psiquiatrico', v)}
                  />
                  {form.tratamento_psiquiatrico && (
                    <TextField
                      label="Tratamentos e remédios psiquiátricos"
                      multiline
                      rows={2}
                      value={form.tratamento_psiquiatrico_detalhes}
                      onChange={(e) => setField('tratamento_psiquiatrico_detalhes', e.target.value)}
                    />
                  )}
                  <TextField
                    label="Restrições médicas, físicas ou de cuidado especial"
                    multiline
                    rows={2}
                    value={form.restricoes_saude}
                    onChange={(e) => setField('restricoes_saude', e.target.value)}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="lgpd">
                <AccordionTrigger>Termos e consentimento (LGPD)</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3 px-0.5">
                  <CheckField
                    id="part-lgpd-dados"
                    label="Autoriza o uso dos dados pessoais (LGPD)"
                    checked={form.aceita_uso_dados}
                    onChange={(v) => setField('aceita_uso_dados', v)}
                  />
                  <CheckField
                    id="part-lgpd-imagem"
                    label="Autoriza o uso de imagem e voz"
                    checked={form.aceita_uso_imagem}
                    onChange={(v) => setField('aceita_uso_imagem', v)}
                  />
                  <CheckField
                    id="part-lgpd-saude"
                    label="Autoriza o tratamento dos dados de saúde informados (LGPD, art. 11)"
                    checked={form.aceita_uso_dados_saude}
                    onChange={(v) => setField('aceita_uso_dados_saude', v)}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Comprovante de inscrição */}
          {(canInsert || form.comprovante_inscricao_filename) && (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <span className="text-sm font-medium">Comprovante de inscrição (matrícula)</span>
              {form.comprovante_inscricao_filename && editingId && (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5">
                  <span className="truncate text-sm">{form.comprovante_inscricao_filename}</span>
                  <span className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Baixar comprovante de inscrição"
                      onClick={() => baixarInscricao(editingId, form.comprovante_inscricao_filename)}
                    >
                      <Download />
                    </Button>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label="Remover comprovante de inscrição"
                        onClick={() => setRemoveCompOpen(true)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </span>
                </div>
              )}
              {canInsert && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <label className="cursor-pointer">
                      <Paperclip />
                      {form.comprovante_inscricao_filename ? 'Trocar arquivo' : 'Anexar arquivo'}
                      <input
                        type="file"
                        className="sr-only"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={(e) => {
                          setMatriculaFile(e.target.files?.[0] ?? null);
                          setDirty(true);
                        }}
                      />
                    </label>
                  </Button>
                  {matriculaFile && (
                    <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
                      <span className="max-w-[12rem] truncate">{matriculaFile.name}</span>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label="Remover arquivo" onClick={() => setMatriculaFile(null)}>
                        <X />
                      </Button>
                    </span>
                  )}
                  <span className="w-full text-xs text-muted-foreground">JPG, PNG, WebP ou PDF.</span>
                </div>
              )}
            </div>
          )}

          {/* Pagamento único (curso sem cobrança mensal, só na edição) */}
          {!gerarMensalidade && drawerMode === 'edit' && (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="part-pago">Pagamento recebido</Label>
                <Switch
                  id="part-pago"
                  checked={form.pago}
                  onCheckedChange={(v) => {
                    setForm((prev) => ({
                      ...prev,
                      pago: v,
                      valor_pago: v && !prev.valor_pago ? prev.valor_mensalidade : prev.valor_pago,
                      data_pagamento: v && !prev.data_pagamento ? todayBr() : prev.data_pagamento,
                    }));
                    setDirty(true);
                  }}
                />
              </div>
              {form.pago && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <MoneyInput label="Valor pago" value={form.valor_pago} onChange={(v) => setField('valor_pago', v)} />
                  <DateField
                    label="Data do pagamento"
                    value={form.data_pagamento}
                    max={todayBr()}
                    onChange={(v) => setField('data_pagamento', v)}
                  />
                </div>
              )}
            </div>
          )}

          {drawerMode === 'create' && lotada && (
            <Alert variant="warning">
              <AlertDescription>Turma lotada: não há vagas disponíveis.</AlertDescription>
            </Alert>
          )}
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remover participante"
        message={
          <>
            Remover <strong>{removeTarget?.nome}</strong> do curso?
          </>
        }
        confirmText="Remover"
        destructive
        loading={removing}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={removeCompOpen}
        title="Remover comprovante"
        message="Deseja remover este comprovante de inscrição?"
        confirmText="Remover"
        destructive
        onConfirm={handleRemoveComprovante}
        onCancel={() => setRemoveCompOpen(false)}
      />
    </div>
  );
}
