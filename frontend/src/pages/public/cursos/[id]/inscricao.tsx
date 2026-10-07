/**
 * Página pública de inscrição em curso presencial.
 * Acesso: /public/cursos/[id]/inscricao — sem autenticação.
 *
 * Mesmos campos e mesma API de antes (GET /api/v1/public/cursos/{id} e
 * POST multipart /api/v1/public/cursos/{id}/inscricao com `data` JSON + `comprovante`).
 * Formulário em react-hook-form + zod com erro inline e foco no primeiro campo inválido;
 * o formulário completo anda em 4 etapas (Stepper) com blocos em Accordion; o simples é
 * uma etapa só. Toasts (Sonner) no lugar de alert(); upload como input de arquivo
 * estilizado; sucesso com .ics e próximos passos.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CircleCheck,
  Copy,
  CreditCard,
  Flag,
  HeartPulse,
  Loader2,
  Lock,
  MapPin,
  Paperclip,
  SearchX,
  Share2,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldWrapper, MaskedInput, TextField } from '@/components/fields';
import { Stepper } from '@/components/Stepper';
import { PublicLoading, PublicNotice, PublicShell, downloadIcs } from '@/components/public';

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

interface InscricaoResult {
  id: string;
  nome: string;
  email: string;
  curso_titulo: string;
  data_inicio: string;
  valor_mensalidade: number | null;
  mensagem: string;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const isFile = (v: unknown): v is File => typeof File !== 'undefined' && v instanceof File;

const baseSchema = z.object({
  nome: z.string(),
  email: z.string(),
  celular: z.string(),
  data_nascimento: z.string(),
  observacoes: z.string().max(1000, 'Máximo de 1000 caracteres.'),
  aceita_uso_dados: z.boolean(),
  aceita_uso_imagem: z.boolean(),
  genero: z.string(),
  emergencia_contato: z.string(),
  emergencia_fone: z.string(),
  cep: z.string(),
  logradouro: z.string(),
  numero: z.string(),
  complemento: z.string(),
  bairro: z.string(),
  cidade: z.string(),
  estado: z.string(),
  // Perguntas de saúde começam sem resposta (null) — o formulário completo exige Sim/Não explícito.
  tem_plano_saude: z.boolean().nullable(),
  plano_saude_nome: z.string(),
  toma_medicamento: z.boolean().nullable(),
  medicamentos_nome: z.string(),
  tem_doenca_tratamento: z.boolean().nullable(),
  doenca_tratamento_nome: z.string(),
  tem_diabetes: z.boolean().nullable(),
  outras_doencas: z.string(),
  aceita_uso_dados_saude: z.boolean(),
  cpf: z.string(),
  rg: z.string(),
  estado_civil: z.string(),
  profissao: z.string(),
  experiencia_umbanda: z.string(),
  contato_contexto_espiritual: z.string(),
  motivo_busca_desenvolvimento: z.string(),
  interesse_aprendizado: z.string(),
  ja_conhece_terreiro: z.string(),
  como_conheceu_terreiro: z.string(),
  tratamento_psiquiatrico: z.boolean().nullable(),
  tratamento_psiquiatrico_detalhes: z.string(),
  restricoes_saude: z.string(),
  comprovante: z.custom<File | null>((v) => v === null || isFile(v)),
});

type FormValues = z.infer<typeof baseSchema>;
type FieldName = FieldPath<FormValues>;

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildSchema(curso: CursoPublico | null) {
  const completo = curso?.tipo_formulario === 'completo';
  const terreiro = curso?.tenant_nome || 'Terreiro';
  return baseSchema.superRefine((v, ctx) => {
    const issue = (path: FieldName, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    const required = (path: FieldName, message: string) => {
      const val = v[path];
      if (typeof val === 'string' ? val.trim().length === 0 : !val) issue(path, message);
    };

    if (v.nome.trim().length < 3) issue('nome', 'Nome completo é obrigatório (mínimo 3 caracteres).');
    if (!v.email.trim() || !EMAIL_RX.test(v.email.trim())) issue('email', 'Informe um e-mail válido.');
    if (v.celular && v.celular.replace(/\D/g, '').length < 10) issue('celular', 'Celular incompleto — use DDD + número.');
    if (!v.aceita_uso_dados) issue('aceita_uso_dados', 'É necessário aceitar o uso dos seus dados pessoais (LGPD).');
    if (completo && !v.aceita_uso_dados_saude) {
      issue('aceita_uso_dados_saude', 'É necessário aceitar o processamento de dados de saúde para formulários completos.');
    }
    if (curso?.chave_pix && !v.comprovante) issue('comprovante', 'O comprovante de pagamento da matrícula via PIX é obrigatório.');

    if (!completo) return;

    required('celular', 'WhatsApp/Celular é obrigatório.');
    required('data_nascimento', 'Data de nascimento é obrigatória.');
    required('genero', 'Sexo/Gênero é obrigatório.');
    if (v.cpf.replace(/\D/g, '').length === 0) issue('cpf', 'CPF é obrigatório.');
    else if (v.cpf.replace(/\D/g, '').length !== 11) issue('cpf', 'CPF incompleto.');
    required('rg', 'RG é obrigatório.');
    required('estado_civil', 'Estado civil é obrigatório.');
    required('cep', 'CEP é obrigatório.');
    required('logradouro', 'Logradouro é obrigatório.');
    required('numero', 'Número do endereço é obrigatório.');
    required('bairro', 'Bairro é obrigatório.');
    required('cidade', 'Cidade é obrigatória.');
    required('estado', 'Estado é obrigatório.');
    required('profissao', 'Profissão é obrigatória.');
    required('emergencia_contato', 'Nome do contato de emergência é obrigatório.');
    required('emergencia_fone', 'Telefone de emergência é obrigatório.');
    required('experiencia_umbanda', 'Por favor, responda se possui experiência com a religião de Umbanda.');
    required('contato_contexto_espiritual', 'Por favor, responda se já foi ou é filho de algum contexto espiritual.');
    required('motivo_busca_desenvolvimento', "O campo 'O que te fez buscar o desenvolvimento mediúnico?' é obrigatório.");
    required('interesse_aprendizado', "O campo 'Tem interesse em algum aprendizado específico? Qual?' é obrigatório.");
    required('ja_conhece_terreiro', `Por favor, responda se já conhece o Terreiro ${terreiro}.`);
    // "Como conheceu" só aparece (e só é exigido) para quem já conhece o terreiro.
    if (v.ja_conhece_terreiro === 'Sim') required('como_conheceu_terreiro', `O campo 'Como conheceu o ${terreiro}?' é obrigatório.`);
    const answer = (path: FieldName, message: string) => {
      if (v[path] === null) issue(path, message);
    };
    answer('tem_plano_saude', 'Responda se tem plano de saúde.');
    answer('toma_medicamento', 'Responda se toma algum medicamento de uso contínuo.');
    answer('tem_doenca_tratamento', 'Responda se faz algum tratamento de saúde.');
    answer('tem_diabetes', 'Responda se tem diabetes.');
    answer('tratamento_psiquiatrico', 'Responda se faz acompanhamento psiquiátrico.');
    if (v.tem_plano_saude) required('plano_saude_nome', 'Informe o nome do seu plano de saúde.');
    if (v.toma_medicamento) required('medicamentos_nome', 'Especifique os medicamentos controlados que você toma.');
    if (v.tem_doenca_tratamento) required('doenca_tratamento_nome', 'Especifique o tratamento de saúde que você realiza.');
    if (v.tratamento_psiquiatrico) {
      required('tratamento_psiquiatrico_detalhes', 'Especifique o acompanhamento psiquiátrico e remédios controlados.');
    }
    required('restricoes_saude', "O campo de restrições de saúde é obrigatório. Se não possuir, digite 'Nenhuma'.");
  });
}

const DEFAULTS: FormValues = {
  nome: '', email: '', celular: '', data_nascimento: '', observacoes: '',
  aceita_uso_dados: false, aceita_uso_imagem: false,
  genero: '', emergencia_contato: '', emergencia_fone: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  tem_plano_saude: null, plano_saude_nome: '', toma_medicamento: null, medicamentos_nome: '',
  tem_doenca_tratamento: null, doenca_tratamento_nome: '', tem_diabetes: null, outras_doencas: '',
  aceita_uso_dados_saude: false, cpf: '', rg: '', estado_civil: '', profissao: '',
  experiencia_umbanda: '', contato_contexto_espiritual: '', motivo_busca_desenvolvimento: '',
  interesse_aprendizado: '', ja_conhece_terreiro: '', como_conheceu_terreiro: '',
  tratamento_psiquiatrico: null, tratamento_psiquiatrico_detalhes: '', restricoes_saude: '',
  comprovante: null,
};

// ─── Etapas ───────────────────────────────────────────────────────────────────

const STEP_DADOS: FieldName[] = ['nome', 'email', 'celular', 'data_nascimento', 'observacoes'];
const STEP_DOCS: FieldName[] = [
  'cpf', 'rg', 'estado_civil', 'profissao', 'genero', 'emergencia_contato', 'emergencia_fone',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
];
const STEP_PERFIL: FieldName[] = [
  'experiencia_umbanda', 'contato_contexto_espiritual', 'motivo_busca_desenvolvimento', 'interesse_aprendizado',
  'ja_conhece_terreiro', 'como_conheceu_terreiro', 'tem_plano_saude', 'plano_saude_nome', 'toma_medicamento',
  'medicamentos_nome', 'tem_doenca_tratamento', 'doenca_tratamento_nome', 'tem_diabetes', 'tratamento_psiquiatrico',
  'tratamento_psiquiatrico_detalhes', 'restricoes_saude', 'outras_doencas',
];
const STEP_CONFIRMA: FieldName[] = ['comprovante', 'aceita_uso_dados', 'aceita_uso_imagem', 'aceita_uso_dados_saude'];

const STEPS_COMPLETO = [
  { label: 'Seus dados', fields: STEP_DADOS },
  { label: 'Documentos e endereço', fields: STEP_DOCS },
  { label: 'Espiritual e saúde', fields: STEP_PERFIL },
  { label: 'Confirmação', fields: STEP_CONFIRMA },
];
const STEPS_SIMPLES = [{ label: 'Inscrição', fields: [...STEP_DADOS, ...STEP_CONFIRMA] }];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const fmtDateShort = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtBRL = (val: number | null | undefined): string => {
  if (val == null) return '';
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const maskCep = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

/** Evento .ics de 2h no início do curso. */
export function buildCursoIcs(curso: CursoPublico): string | null {
  const start = new Date(curso.data_inicio);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  const location = [curso.local, curso.tenant_endereco].filter(Boolean).join(' · ');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GiraHub//Curso//PT', 'BEGIN:VEVENT',
    `UID:curso-${curso.id}-${stamp(start)}@girahub`,
    `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${curso.titulo} — ${curso.tenant_nome}`)}`,
    location ? `LOCATION:${esc(location)}` : '',
    curso.ementa ? `DESCRIPTION:${esc(curso.ementa)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function focusField(name: string) {
  const el = document.getElementById(name);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}

// ─── Campos auxiliares ────────────────────────────────────────────────────────

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

function SelectField({ id, label, value, onChange, options, error, required, disabled, placeholder = 'Selecione…' }: SelectFieldProps) {
  return (
    <FieldWrapper id={id} label={label} error={error} required={required} disabled={disabled}>
      {(control) => (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger {...control} className="h-12 w-full text-base">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FieldWrapper>
  );
}

interface BoolFieldProps {
  id: string;
  label: string;
  /** null = ainda não respondida (nenhuma opção marcada). */
  value: boolean | null;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

function BoolField({ id, label, value, onChange, disabled, required, error }: BoolFieldProps) {
  const selected = value === null ? '' : value ? 'sim' : 'nao';
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0 flex flex-col gap-1.5">
      <legend className="p-0 mb-1.5 text-sm leading-snug font-medium">
        {label}
        {required && <span aria-hidden className="text-destructive"> *</span>}
      </legend>
      <RadioGroup
        id={id}
        value={selected}
        onValueChange={(v) => onChange(v === 'sim')}
        disabled={disabled}
        className="flex gap-2"
        aria-label={label}
        aria-invalid={Boolean(error) || undefined}
        aria-required={required || undefined}
      >
        {(['nao', 'sim'] as const).map((opt) => (
          <Label
            key={opt}
            htmlFor={`${id}-${opt}`}
            className={cn(
              'flex min-h-12 flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 text-base font-normal',
              selected === opt && 'border-primary bg-primary/5',
            )}
          >
            <RadioGroupItem id={`${id}-${opt}`} value={opt} className="size-5" />
            {opt === 'sim' ? 'Sim' : 'Não'}
          </Label>
        ))}
      </RadioGroup>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}

const SIM_NAO_OUTROS = [
  { value: 'Sim', label: 'Sim' },
  { value: 'Não', label: 'Não' },
  { value: 'Outros', label: 'Outros' },
];
const SIM_NAO = SIM_NAO_OUTROS.slice(0, 2);
const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável', 'Outro'].map((v) => ({ value: v, label: v }));
const GENERO = ['Masculino', 'Feminino', 'Outro', 'Prefiro não responder'].map((v) => ({ value: v, label: v }));

// ─── Component ────────────────────────────────────────────────────────────────

export default function InscricaoCursoPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };

  const [curso, setCurso] = useState<CursoPublico | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [step, setStep] = useState(0);
  const [openDocs, setOpenDocs] = useState<string[]>(['documentos', 'emergencia', 'endereco']);
  const [openPerfil, setOpenPerfil] = useState<string[]>(['espiritual', 'saude']);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<InscricaoResult | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  const completo = curso?.tipo_formulario === 'completo';
  const steps = completo ? STEPS_COMPLETO : STEPS_SIMPLES;
  const isLast = step === steps.length - 1;

  const schema = useMemo(() => buildSchema(curso), [curso]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: DEFAULTS,
  });
  const { register, control, handleSubmit, trigger, getValues, setValue, formState: { errors } } = form;

  const temPlano = useWatch({ control, name: 'tem_plano_saude' });
  const tomaMed = useWatch({ control, name: 'toma_medicamento' });
  const temDoenca = useWatch({ control, name: 'tem_doenca_tratamento' });
  const psiq = useWatch({ control, name: 'tratamento_psiquiatrico' });
  const jaConhece = useWatch({ control, name: 'ja_conhece_terreiro' });
  const comprovante = useWatch({ control, name: 'comprovante' });

  // ── Fetch course data ──
  const fetchCurso = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadFailed(false);
    setNotFound(false);
    try {
      const res = await fetch(`/api/v1/public/cursos/${id}`);
      if (!res.ok) {
        if (res.status === 404) setNotFound(true);
        else setLoadFailed(true);
        return;
      }
      const data: CursoPublico = await res.json();
      setCurso(data);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCurso(); }, [fetchCurso]);

  // ── ViaCEP ──
  const lookupCep = async (rawCep: string) => {
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
      setValue('logradouro', json.logradouro || '', { shouldValidate: true });
      setValue('bairro', json.bairro || '', { shouldValidate: true });
      setValue('cidade', json.localidade || '', { shouldValidate: true });
      setValue('estado', json.uf || '', { shouldValidate: true });
      focusField('numero');
    } catch {
      setCepError('Erro ao consultar CEP.');
    } finally {
      setCepLoading(false);
    }
  };

  // ── Navegação entre etapas ──
  const firstInvalid = (fields: FieldName[]): FieldName | undefined =>
    fields.find((f) => form.getFieldState(f).invalid);

  const openAll = () => {
    setOpenDocs(['documentos', 'emergencia', 'endereco']);
    setOpenPerfil(['espiritual', 'saude']);
  };

  const goNext = async () => {
    const ok = await trigger(steps[step].fields);
    if (!ok) {
      openAll();
      const name = firstInvalid(steps[step].fields);
      if (name) setTimeout(() => focusField(name), 50);
      toast.error('Confira os campos destacados antes de continuar.');
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onInvalid = () => {
    openAll();
    const idx = steps.findIndex((s) => firstInvalid(s.fields));
    const target = idx >= 0 ? idx : step;
    const name = idx >= 0 ? firstInvalid(steps[idx].fields) : undefined;
    setStep(target);
    if (name) setTimeout(() => focusField(name), 50);
    toast.error('Confira os campos destacados antes de enviar.');
  };

  // ── Submit ──
  const onSubmit = async (f: FormValues) => {
    if (!curso) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const payload = {
        nome: f.nome.trim(),
        email: f.email.trim().toLowerCase(),
        celular: f.celular ? f.celular.replace(/\D/g, '') : null,
        data_nascimento: f.data_nascimento || null,
        observacoes: f.observacoes || null,
        aceita_uso_dados: f.aceita_uso_dados,
        aceita_uso_imagem: f.aceita_uso_imagem,
        genero: f.genero || null,
        emergencia_contato: f.emergencia_contato.trim() || null,
        emergencia_fone: f.emergencia_fone ? f.emergencia_fone.replace(/\D/g, '') : null,
        cep: f.cep ? f.cep.replace(/\D/g, '') : null,
        logradouro: f.logradouro.trim() || null,
        numero: f.numero.trim() || null,
        complemento: f.complemento.trim() || null,
        bairro: f.bairro.trim() || null,
        cidade: f.cidade.trim() || null,
        estado: f.estado.trim() || null,
        tem_plano_saude: f.tem_plano_saude,
        plano_saude_nome: f.tem_plano_saude ? f.plano_saude_nome.trim() || null : null,
        toma_medicamento: f.toma_medicamento,
        medicamentos_nome: f.toma_medicamento ? f.medicamentos_nome.trim() || null : null,
        tem_doenca_tratamento: f.tem_doenca_tratamento,
        doenca_tratamento_nome: f.tem_doenca_tratamento ? f.doenca_tratamento_nome.trim() || null : null,
        tem_diabetes: f.tem_diabetes,
        outras_doencas: f.outras_doencas.trim() || null,
        aceita_uso_dados_saude: f.aceita_uso_dados_saude,
        cpf: f.cpf ? f.cpf.replace(/\D/g, '') : null,
        rg: f.rg.trim() || null,
        estado_civil: f.estado_civil || null,
        profissao: f.profissao.trim() || null,
        experiencia_umbanda: f.experiencia_umbanda || null,
        contato_contexto_espiritual: f.contato_contexto_espiritual || null,
        motivo_busca_desenvolvimento: f.motivo_busca_desenvolvimento.trim() || null,
        interesse_aprendizado: f.interesse_aprendizado.trim() || null,
        ja_conhece_terreiro: f.ja_conhece_terreiro === 'Sim' ? true : f.ja_conhece_terreiro === 'Não' ? false : null,
        como_conheceu_terreiro: f.ja_conhece_terreiro === 'Sim' ? f.como_conheceu_terreiro.trim() || null : null,
        tratamento_psiquiatrico: f.tratamento_psiquiatrico,
        tratamento_psiquiatrico_detalhes: f.tratamento_psiquiatrico ? f.tratamento_psiquiatrico_detalhes.trim() || null : null,
        restricoes_saude: f.restricoes_saude.trim() || null,
      };

      const formData = new FormData();
      formData.append('data', JSON.stringify(payload));
      if (f.comprovante) formData.append('comprovante', f.comprovante);

      const res = await fetch(`/api/v1/public/cursos/${id}/inscricao`, { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail =
          (typeof data?.detail === 'string' && data.detail) ||
          (res.status === 409 ? 'Este e-mail já está inscrito neste curso.' : 'Erro ao realizar inscrição. Tente novamente.');
        setSubmitError(detail);
        toast.error(detail);
        requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return;
      }
      const result: InscricaoResult = await res.json();
      setSuccess(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      const msg = 'Erro de conexão. Verifique sua internet e tente novamente.';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const submit = handleSubmit(onSubmit, onInvalid);

  const copyPix = async () => {
    if (!curso?.chave_pix) return;
    try {
      await navigator.clipboard.writeText(curso.chave_pix);
      toast.success('Chave PIX copiada.');
    } catch {
      toast.error('Não foi possível copiar. Selecione a chave e copie manualmente.');
    }
  };

  const share = async () => {
    if (!curso) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: curso.titulo, text: `Confira o curso "${curso.titulo}"!`, url });
      } catch {
        /* cancelado pelo usuário */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  // ── Derived ──
  const isLotado = curso?.max_participantes != null && curso.vagas_restantes != null && curso.vagas_restantes <= 0;
  const vagasPct =
    curso?.max_participantes && curso.vagas_restantes != null
      ? Math.round(((curso.max_participantes - curso.vagas_restantes) / curso.max_participantes) * 100)
      : null;
  const brand = { primary: curso?.tenant_primary_color, secondary: curso?.tenant_secondary_color };

  // ───────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PublicShell title="Carregando o curso…" hideHeader wide>
        <PublicLoading label="Carregando o curso…" />
      </PublicShell>
    );
  }

  if (notFound || loadFailed || !curso) {
    return (
      <PublicShell title={notFound ? 'Curso não encontrado' : 'Não foi possível carregar'} hideHeader wide>
        {notFound ? (
          <PublicNotice
            tone="warning"
            icon={<SearchX />}
            title="Curso não encontrado"
            description="Este link pode estar expirado ou o curso pode ter sido encerrado."
          />
        ) : (
          <PublicNotice
            tone="error"
            title="Não foi possível carregar"
            description="Verifique sua conexão e tente de novo."
            actions={<Button type="button" size="touch" className="w-full" onClick={fetchCurso}>Tentar de novo</Button>}
          />
        )}
      </PublicShell>
    );
  }

  // ─── Sucesso ──────────────────────────────────────────────────────────────
  if (success) {
    const ics = buildCursoIcs(curso);
    return (
      <PublicShell
        title={`Inscrição confirmada — ${curso.titulo}`}
        tenantName={curso.tenant_nome}
        logoUrl={curso.tenant_logo_url}
        subtitle="Inscrição em curso"
        brand={brand}
        wide
      >
        <Card className="gap-5 py-6">
          <CardContent className="flex flex-col gap-5 px-5">
            <div className="text-center">
              <span aria-hidden className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-success/10 text-success-strong [&_svg]:size-7">
                <CircleCheck />
              </span>
              <h1 className="text-2xl font-bold leading-tight">Inscrição confirmada!</h1>
              <p className="mt-1 text-base text-muted-foreground">Você está inscrito(a) no curso abaixo.</p>
            </div>

            <dl className="divide-y rounded-lg border text-base">
              {[
                ['Curso', <strong key="c">{success.curso_titulo}</strong>],
                ['Participante', success.nome],
                ['E-mail', success.email],
                ['Início', fmtDate(success.data_inicio)],
                ...(success.valor_mensalidade != null && curso.gerar_mensalidade
                  ? [['Mensalidade', <strong key="m" className="text-(color:--brand-text)">{fmtBRL(success.valor_mensalidade)}/mês</strong>]]
                  : []),
              ].map(([k, v]) => (
                <div key={String(k)} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>

            <p className="text-base text-muted-foreground">{success.mensagem}</p>

            <div>
              <h2 className="text-base font-bold">Próximos passos</h2>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-muted-foreground">
                <li>Você recebe um e-mail de confirmação em {success.email}.</li>
                {curso.chave_pix && <li>O terreiro confere o comprovante da matrícula e confirma sua vaga.</li>}
                {success.valor_mensalidade != null && curso.gerar_mensalidade && <li>A mensalidade é cobrada durante o período do curso.</li>}
                <li>Anote a data de início: {fmtDate(success.data_inicio)}{curso.local ? ` · ${curso.local}` : ''}.</li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              {ics && (
                <Button type="button" size="touch" className="w-full" onClick={() => downloadIcs(ics, `curso-${curso.id}.ics`)}>
                  <CalendarPlus /> Adicionar à agenda
                </Button>
              )}
              <Button type="button" variant="outline" size="touch" className="w-full" onClick={share}>
                <Share2 /> Compartilhar este curso
              </Button>
            </div>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  // ─── Página principal ─────────────────────────────────────────────────────
  const footer = !isLotado ? (
    <div className="flex gap-2">
      {step > 0 && (
        <Button type="button" variant="outline" size="touch" onClick={goBack} disabled={submitting}>
          <ArrowLeft /> Voltar
        </Button>
      )}
      {isLast ? (
        <Button type="submit" form="inscricao-form" size="touch" className="flex-1" disabled={submitting} aria-busy={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <CircleCheck />}
          {submitting ? 'Enviando inscrição…' : 'Confirmar inscrição'}
        </Button>
      ) : (
        <Button type="button" size="touch" className="flex-1" onClick={goNext}>
          Continuar <ArrowRight />
        </Button>
      )}
    </div>
  ) : undefined;

  const err = (name: FieldName) => (errors[name]?.message as string | undefined) ?? undefined;

  return (
    <PublicShell
      title={`${curso.titulo} — ${curso.tenant_nome}`}
      description={curso.ementa || `Inscreva-se no curso ${curso.titulo} promovido por ${curso.tenant_nome}`}
      tenantName={curso.tenant_nome}
      logoUrl={curso.tenant_logo_url}
      subtitle="Inscrição em curso"
      brand={brand}
      footer={footer}
      wide
    >
      {/* ── Cabeçalho do curso ── */}
      <section aria-labelledby="curso-titulo" className="px-1 pt-1">
        <Badge
          variant="secondary"
          className={cn('mb-2 gap-1 text-sm', isLotado ? 'bg-destructive/10 text-destructive-strong' : 'bg-success/10 text-success-strong')}
        >
          {isLotado ? <Lock /> : <CircleCheck />}
          {isLotado ? 'Vagas esgotadas' : 'Inscrições abertas'}
        </Badge>
        <h1 id="curso-titulo" className="text-2xl font-bold leading-tight [text-wrap:balance]">{curso.titulo}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <Badge variant="outline" className="gap-1 text-sm font-normal"><CalendarDays /> {fmtDateShort(curso.data_inicio)}</Badge>
          {curso.data_fim && <Badge variant="outline" className="gap-1 text-sm font-normal"><Flag /> {fmtDateShort(curso.data_fim)}</Badge>}
          {curso.local && <Badge variant="outline" className="gap-1 text-sm font-normal"><MapPin /> {curso.local}</Badge>}
          {curso.max_participantes && <Badge variant="outline" className="gap-1 text-sm font-normal"><Users /> {curso.max_participantes} vagas</Badge>}
          {curso.gerar_mensalidade && curso.valor_mensalidade_padrao != null && (
            <Badge variant="outline" className="gap-1 text-sm font-normal"><CreditCard /> {fmtBRL(curso.valor_mensalidade_padrao)}/mês</Badge>
          )}
        </div>
      </section>

      {/* ── Detalhes ── */}
      <Card className="gap-3 py-4">
        <CardContent className="flex flex-col gap-3 px-5">
          <h2 className="text-base font-bold">Detalhes do curso</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-base sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">Início</dt><dd>{fmtDate(curso.data_inicio)}</dd></div>
            {curso.data_fim && <div><dt className="text-sm text-muted-foreground">Término</dt><dd>{fmtDate(curso.data_fim)}</dd></div>}
            {curso.local && <div><dt className="text-sm text-muted-foreground">Local</dt><dd>{curso.local}</dd></div>}
            {curso.tenant_endereco && <div><dt className="text-sm text-muted-foreground">Endereço</dt><dd>{curso.tenant_endereco}</dd></div>}
            {curso.max_participantes != null && (
              <div>
                <dt className="text-sm text-muted-foreground">Vagas</dt>
                <dd>{curso.vagas_restantes != null ? `${curso.vagas_restantes} de ${curso.max_participantes} disponíveis` : `${curso.max_participantes} no total`}</dd>
              </div>
            )}
            {curso.gerar_mensalidade && curso.valor_mensalidade_padrao != null && (
              <div><dt className="text-sm text-muted-foreground">Mensalidade</dt><dd className="font-semibold text-(color:--brand-text)">{fmtBRL(curso.valor_mensalidade_padrao)}/mês</dd></div>
            )}
          </dl>
          {vagasPct != null && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Preenchimento de vagas</span>
                <span>{vagasPct}%</span>
              </div>
              <Progress value={vagasPct} aria-label={`${vagasPct}% das vagas preenchidas`} />
            </div>
          )}
        </CardContent>
      </Card>

      {(curso.ementa || curso.observacoes) && (
        <Accordion type="multiple" defaultValue={['sobre']} className="rounded-xl border bg-card px-5">
          {curso.ementa && (
            <AccordionItem value="sobre">
              <AccordionTrigger className="text-base">Sobre o curso</AccordionTrigger>
              <AccordionContent className="whitespace-pre-line text-base text-muted-foreground">{curso.ementa}</AccordionContent>
            </AccordionItem>
          )}
          {curso.observacoes && (
            <AccordionItem value="obs">
              <AccordionTrigger className="text-base">Informações adicionais</AccordionTrigger>
              <AccordionContent className="whitespace-pre-line text-base text-muted-foreground">{curso.observacoes}</AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}

      {/* ── Lotado ── */}
      {isLotado ? (
        <PublicNotice
          tone="warning"
          icon={<Lock />}
          title="Vagas esgotadas"
          description={
            <>
              Todas as vagas para este curso já foram preenchidas. Entre em contato com o terreiro para verificar possibilidades.
              {curso.tenant_endereco && <><br />{curso.tenant_endereco}</>}
            </>
          }
        />
      ) : (
        <form id="inscricao-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          {steps.length > 1 && (
            <Stepper steps={steps.map((s) => ({ label: s.label }))} active={step} onStepClick={(i) => { setStep(i); window.scrollTo({ top: 0 }); }} />
          )}

          {submitError && (
            <div ref={errorRef}>
              <Alert variant="destructive">
                <AlertTitle>Não foi possível concluir a inscrição</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            </div>
          )}

          {/* Etapa 1 — Seus dados */}
          {steps[step].fields === STEP_DADOS || !completo ? (
            <Card className="gap-4 py-5">
              <CardContent className="flex flex-col gap-4 px-5">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold"><UserRound aria-hidden className="size-5 text-muted-foreground" /> Seus dados</h2>
                  <p className="text-base text-muted-foreground">Preencha seus dados para se inscrever em <strong className="text-foreground">{curso.titulo}</strong>.</p>
                </div>
                <TextField id="nome" label="Nome completo" required placeholder="Ex.: Maria da Silva" autoComplete="name" autoCapitalize="words" maxLength={255} inputClassName="h-12" error={err('nome')} {...register('nome')} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField id="email" label="E-mail" type="email" required placeholder="Ex.: maria@email.com" autoComplete="email" inputMode="email" inputClassName="h-12" error={err('email')} {...register('email')} />
                  <Controller control={control} name="celular" render={({ field }) => (
                    <MaskedInput id="celular" mask="telefone" label="Celular (WhatsApp)" required={completo} placeholder="(11) 99999-9999" autoComplete="tel-national" inputMode="tel" inputClassName="h-12"
                      value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} error={err('celular')} helperText={!completo && !err('celular') ? 'Opcional' : undefined} />
                  )} />
                  <TextField id="data_nascimento" label="Data de nascimento" type="date" required={completo} max={new Date().toISOString().substring(0, 10)} inputClassName="h-12" error={err('data_nascimento')} helperText={!completo && !err('data_nascimento') ? 'Opcional' : undefined} {...register('data_nascimento')} />
                </div>
                {curso.gerar_mensalidade && curso.valor_mensalidade_padrao != null && (
                  <Alert variant="info">
                    <CreditCard />
                    <AlertTitle>Mensalidade: {fmtBRL(curso.valor_mensalidade_padrao)}/mês</AlertTitle>
                    <AlertDescription>Este valor será cobrado mensalmente durante o período do curso.</AlertDescription>
                  </Alert>
                )}
                <TextField id="observacoes" label="Observações" multiline rows={3} placeholder="Dúvidas, necessidades especiais ou informações adicionais…" maxLength={1000} error={err('observacoes')} helperText={!err('observacoes') ? 'Opcional' : undefined} {...register('observacoes')} />
              </CardContent>
            </Card>
          ) : null}

          {/* Etapa 2 — Documentos e endereço */}
          {completo && steps[step].fields === STEP_DOCS && (
            <Accordion type="multiple" value={openDocs} onValueChange={setOpenDocs} className="rounded-xl border bg-card px-5">
              <AccordionItem value="documentos">
                <AccordionTrigger className="text-base font-bold"><span className="flex items-center gap-2"><UserRound aria-hidden className="size-5 text-muted-foreground" /> Documentos e perfil</span></AccordionTrigger>
                <AccordionContent className="grid gap-4 sm:grid-cols-2">
                  <Controller control={control} name="cpf" render={({ field }) => (
                    <MaskedInput id="cpf" mask="cpf" label="CPF" required placeholder="000.000.000-00" inputClassName="h-12" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} error={err('cpf')} />
                  )} />
                  <TextField id="rg" label="RG" required maxLength={20} inputClassName="h-12" error={err('rg')} {...register('rg')} />
                  <Controller control={control} name="estado_civil" render={({ field }) => (
                    <SelectField id="estado_civil" label="Estado civil" required value={field.value} onChange={field.onChange} options={ESTADO_CIVIL} error={err('estado_civil')} />
                  )} />
                  <TextField id="profissao" label="Profissão" required maxLength={100} inputClassName="h-12" error={err('profissao')} {...register('profissao')} />
                  <Controller control={control} name="genero" render={({ field }) => (
                    <SelectField id="genero" label="Gênero" required value={field.value} onChange={field.onChange} options={GENERO} error={err('genero')} />
                  )} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="emergencia">
                <AccordionTrigger className="text-base font-bold"><span className="flex items-center gap-2"><HeartPulse aria-hidden className="size-5 text-muted-foreground" /> Contato de emergência</span></AccordionTrigger>
                <AccordionContent className="grid gap-4 sm:grid-cols-2">
                  <TextField id="emergencia_contato" label="Nome do contato de emergência" required maxLength={255} autoCapitalize="words" inputClassName="h-12" error={err('emergencia_contato')} {...register('emergencia_contato')} />
                  <Controller control={control} name="emergencia_fone" render={({ field }) => (
                    <MaskedInput id="emergencia_fone" mask="telefone" label="Telefone de emergência" required placeholder="(11) 99999-9999" inputMode="tel" inputClassName="h-12" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} error={err('emergencia_fone')} />
                  )} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="endereco">
                <AccordionTrigger className="text-base font-bold"><span className="flex items-center gap-2"><MapPin aria-hidden className="size-5 text-muted-foreground" /> Endereço residencial</span></AccordionTrigger>
                <AccordionContent className="grid gap-4 sm:grid-cols-6">
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Controller control={control} name="cep" render={({ field }) => (
                      <MaskedInput id="cep" mask={maskCep} label="CEP" required placeholder="00000-000" inputMode="numeric" autoComplete="postal-code" inputClassName="h-12" className="flex-1"
                        value={field.value} onChange={field.onChange} onBlur={(e) => { field.onBlur(); lookupCep(e.target.value); }} ref={field.ref} error={err('cep') || cepError || undefined} />
                    )} />
                    <Button type="button" variant="outline" size="touch" className="shrink-0" onClick={() => lookupCep(getValues('cep'))} disabled={cepLoading}>
                      {cepLoading ? <Loader2 className="animate-spin" /> : 'Buscar'}
                    </Button>
                  </div>
                  <TextField id="logradouro" label="Logradouro" required placeholder="Rua, Avenida, etc." maxLength={255} autoComplete="address-line1" inputClassName="h-12" className="sm:col-span-4" error={err('logradouro')} {...register('logradouro')} />
                  <TextField id="numero" label="Número" required placeholder="Nº" maxLength={20} inputClassName="h-12" className="sm:col-span-2" error={err('numero')} {...register('numero')} />
                  <TextField id="complemento" label="Complemento" placeholder="Apto, bloco… (opcional)" maxLength={100} autoComplete="address-line2" inputClassName="h-12" className="sm:col-span-2" error={err('complemento')} {...register('complemento')} />
                  <TextField id="bairro" label="Bairro" required maxLength={100} inputClassName="h-12" className="sm:col-span-2" error={err('bairro')} {...register('bairro')} />
                  <TextField id="cidade" label="Cidade" required maxLength={100} autoComplete="address-level2" inputClassName="h-12" className="sm:col-span-4" error={err('cidade')} {...register('cidade')} />
                  <TextField id="estado" label="Estado (UF)" required placeholder="SP" maxLength={2} autoCapitalize="characters" autoComplete="address-level1" inputClassName="h-12 uppercase" className="sm:col-span-2" error={err('estado')} {...register('estado', { setValueAs: (v: string) => (v || '').toUpperCase() })} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Etapa 3 — Espiritual e saúde */}
          {completo && steps[step].fields === STEP_PERFIL && (
            <Accordion type="multiple" value={openPerfil} onValueChange={setOpenPerfil} className="rounded-xl border bg-card px-5">
              <AccordionItem value="espiritual">
                <AccordionTrigger className="text-base font-bold"><span className="flex items-center gap-2"><Sparkles aria-hidden className="size-5 text-muted-foreground" /> Perfil espiritual e mediúnico</span></AccordionTrigger>
                <AccordionContent className="grid gap-4 sm:grid-cols-2">
                  <Controller control={control} name="experiencia_umbanda" render={({ field }) => (
                    <SelectField id="experiencia_umbanda" label="Já teve experiência ou fez algum estudo sobre a religião de umbanda?" required value={field.value} onChange={field.onChange} options={SIM_NAO_OUTROS} error={err('experiencia_umbanda')} />
                  )} />
                  <Controller control={control} name="contato_contexto_espiritual" render={({ field }) => (
                    <SelectField id="contato_contexto_espiritual" label="Já teve contato, foi ou é filho de algum contexto espiritual?" required value={field.value} onChange={field.onChange} options={SIM_NAO_OUTROS} error={err('contato_contexto_espiritual')} />
                  )} />
                  <TextField id="motivo_busca_desenvolvimento" label="O que te fez buscar o desenvolvimento mediúnico?" required multiline rows={3} placeholder="Descreva o que te motivou…" error={err('motivo_busca_desenvolvimento')} {...register('motivo_busca_desenvolvimento')} />
                  <TextField id="interesse_aprendizado" label="Tem interesse em algum aprendizado específico? Qual?" required multiline rows={3} placeholder="Descreva se houver algum interesse particular…" error={err('interesse_aprendizado')} {...register('interesse_aprendizado')} />
                  <Controller control={control} name="ja_conhece_terreiro" render={({ field }) => (
                    <SelectField id="ja_conhece_terreiro" label={`Já conhece o Terreiro ${curso.tenant_nome}?`} required value={field.value} onChange={field.onChange} options={SIM_NAO} error={err('ja_conhece_terreiro')} />
                  )} />
                  {jaConhece === 'Sim' && (
                    <TextField id="como_conheceu_terreiro" label={`Como conheceu o ${curso.tenant_nome}?`} required placeholder="Ex: redes sociais, indicação, etc." maxLength={255} inputClassName="h-12" error={err('como_conheceu_terreiro')} {...register('como_conheceu_terreiro')} />
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="saude">
                <AccordionTrigger className="text-base font-bold"><span className="flex items-center gap-2"><HeartPulse aria-hidden className="size-5 text-muted-foreground" /> Informações de saúde</span></AccordionTrigger>
                <AccordionContent className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-3">
                      <Controller control={control} name="tem_plano_saude" render={({ field }) => (
                        <BoolField id="tem_plano_saude" label="Tem plano de saúde?" required value={field.value} onChange={field.onChange} error={err('tem_plano_saude')} />
                      )} />
                      {temPlano && <TextField id="plano_saude_nome" label="Qual o plano de saúde?" required placeholder="Nome da operadora/plano" maxLength={100} inputClassName="h-12" error={err('plano_saude_nome')} {...register('plano_saude_nome')} />}
                    </div>
                    <div className="flex flex-col gap-3">
                      <Controller control={control} name="toma_medicamento" render={({ field }) => (
                        <BoolField id="toma_medicamento" label="Toma algum medicamento de uso contínuo?" required value={field.value} onChange={field.onChange} error={err('toma_medicamento')} />
                      )} />
                      {tomaMed && <TextField id="medicamentos_nome" label="Quais medicamentos?" required multiline rows={2} placeholder="Liste os medicamentos e dosagens…" error={err('medicamentos_nome')} {...register('medicamentos_nome')} />}
                    </div>
                    <div className="flex flex-col gap-3">
                      <Controller control={control} name="tem_doenca_tratamento" render={({ field }) => (
                        <BoolField id="tem_doenca_tratamento" label="Faz algum tratamento de saúde?" required value={field.value} onChange={field.onChange} error={err('tem_doenca_tratamento')} />
                      )} />
                      {temDoenca && <TextField id="doenca_tratamento_nome" label="Qual tratamento/doença? Especifique" required multiline rows={2} placeholder="Descreva a doença e o tratamento…" error={err('doenca_tratamento_nome')} {...register('doenca_tratamento_nome')} />}
                    </div>
                    <Controller control={control} name="tem_diabetes" render={({ field }) => (
                      <BoolField id="tem_diabetes" label="Tem diabetes?" required value={field.value} onChange={field.onChange} error={err('tem_diabetes')} />
                    )} />
                    <div className="flex flex-col gap-3 sm:col-span-2">
                      <Controller control={control} name="tratamento_psiquiatrico" render={({ field }) => (
                        <BoolField id="tratamento_psiquiatrico" label="Faz acompanhamento / tratamento psiquiátrico e remédios controlados?" required value={field.value} onChange={field.onChange} error={err('tratamento_psiquiatrico')} />
                      )} />
                      {psiq && <TextField id="tratamento_psiquiatrico_detalhes" label="Especifique o tratamento e remédios controlados" required multiline rows={2} placeholder="Detalhes sobre tratamentos ou medicações psiquiátricas…" error={err('tratamento_psiquiatrico_detalhes')} {...register('tratamento_psiquiatrico_detalhes')} />}
                    </div>
                  </div>
                  <TextField id="restricoes_saude" label="É muito importante que saibamos suas restrições para que possamos ter um cuidado maior. Descreva-as se houver:" required multiline rows={3} placeholder="Restrições alimentares, alergias, limitações físicas, etc. Se não tiver, escreva 'Nenhuma'." error={err('restricoes_saude')} {...register('restricoes_saude')} />
                  <TextField id="outras_doencas" label="Outras doenças ou condições que devem ser mencionadas" multiline rows={3} placeholder="Ex: alergias graves, hipertensão, problemas cardíacos, etc." helperText={!err('outras_doencas') ? 'Opcional' : undefined} error={err('outras_doencas')} {...register('outras_doencas')} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Última etapa — PIX + LGPD */}
          {isLast && (
            <>
              {curso.chave_pix && (
                <Card className="gap-4 border-primary/40 bg-primary/5 py-5">
                  <CardContent className="flex flex-col gap-4 px-5">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-(color:--brand-text)"><CreditCard aria-hidden className="size-5" /> Confirmação de matrícula (PIX)</h2>
                      <p className="text-base text-muted-foreground">Para garantir sua vaga, faça a transferência da taxa de matrícula para a chave PIX abaixo e anexe o comprovante.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Chave PIX</p>
                        <p className="break-all text-base font-bold">{curso.chave_pix}</p>
                      </div>
                      <Button type="button" variant="outline" size="touch" onClick={copyPix}><Copy /> Copiar chave</Button>
                    </div>
                    <Controller control={control} name="comprovante" render={({ field }) => (
                      <FieldWrapper id="comprovante" label="Comprovante de pagamento (matrícula)" required error={err('comprovante')} helperText={!err('comprovante') ? 'JPG, PNG, WebP ou PDF — máx. 5 MB' : undefined}>
                        {(ctl) => (
                          <div className="flex flex-wrap items-center gap-3">
                            <Label
                              htmlFor="comprovante"
                              className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-md border bg-background px-5 text-base font-medium hover:bg-accent focus-within:ring-[3px] focus-within:ring-ring/50"
                            >
                              <Paperclip aria-hidden className="size-5" />
                              {comprovante ? 'Trocar comprovante' : 'Anexar comprovante'}
                              <input
                                {...ctl}
                                ref={field.ref}
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp,.pdf"
                                className="sr-only"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  if (file && file.size > 5 * 1024 * 1024) {
                                    toast.error('O arquivo é muito grande (máximo 5 MB).');
                                    e.target.value = '';
                                    return;
                                  }
                                  field.onChange(file);
                                }}
                              />
                            </Label>
                            {comprovante && (
                              <span className="flex items-center gap-1 text-base text-success">
                                <CircleCheck aria-hidden className="size-4" /> {comprovante.name}
                              </span>
                            )}
                          </div>
                        )}
                      </FieldWrapper>
                    )} />
                  </CardContent>
                </Card>
              )}

              <Card className="gap-4 py-5">
                <CardContent className="flex flex-col gap-4 px-5">
                  <h2 className="flex items-center gap-2 text-lg font-bold"><Lock aria-hidden className="size-5 text-muted-foreground" /> Autorização e consentimento (LGPD)</h2>
                  {/* Dados e saúde são condição da inscrição; imagem e voz são opcionais — consentimento
                      condicionado não é livre (LGPD, art. 8º, §4º). O texto de dados segue a Política de
                      Privacidade: o terreiro é o controlador e o GiraHub, o operador. */}
                  {([
                    ['aceita_uso_dados', true, <>
                      <strong>Autorizo o {curso.tenant_nome} a usar os dados pessoais desta ficha</strong> para organizar a minha participação no curso <strong>{curso.titulo}</strong> (inscrição, contato, pagamento e avisos), conforme a <strong>Lei Geral de Proteção de Dados (LGPD – Lei 13.709/2018)</strong>. O {curso.tenant_nome} é o responsável pelos meus dados; eles ficam guardados no GiraHub, sistema que a casa usa, e passam só pelos serviços necessários para ele funcionar (hospedagem, cópias de segurança e envio de e-mails). Não são vendidos nem usados para propaganda. Posso pedir à casa, a qualquer momento, acesso, correção ou exclusão. Saiba mais na{' '}
                      <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-2">Política de Privacidade</a>.
                    </>],
                    ...(completo ? [['aceita_uso_dados_saude', true, <>
                      <strong>Consentimento para dados de saúde (sensíveis):</strong> autorizo o {curso.tenant_nome} a usar as informações de saúde desta ficha só para cuidar de mim e agir rápido em caso de emergência durante as atividades do curso, conforme a <strong>LGPD (art. 11)</strong>. Esses dados ficam visíveis apenas para quem a casa autorizar e são mantidos em sigilo.
                    </>] as const] : []),
                    ['aceita_uso_imagem', false, <>
                      <strong>Autorizo o uso da minha imagem e voz</strong> em fotos e gravações feitas durante o curso <strong>{curso.titulo}</strong>, para registro e divulgação do <strong>{curso.tenant_nome}</strong>, inclusive em redes sociais e materiais educativos. <span className="text-muted-foreground">Opcional: você pode se inscrever sem autorizar, e pode retirar a autorização depois falando com a casa.</span>
                    </>],
                  ] as [FieldName, boolean, React.ReactNode][]).map(([name, obrigatorio, text]) => (
                    <Controller key={name} control={control} name={name} render={({ field }) => (
                      <div className={cn('rounded-lg border p-3', err(name) && 'border-destructive')}>
                        <Label htmlFor={name} className="flex cursor-pointer items-start gap-3 text-base leading-relaxed font-normal">
                          <Checkbox
                            id={name}
                            className="mt-1 size-5"
                            checked={Boolean(field.value)}
                            onCheckedChange={(c) => field.onChange(c === true)}
                            aria-invalid={Boolean(err(name)) || undefined}
                            aria-describedby={err(name) ? `${name}-error` : undefined}
                          />
                          <span>
                            {text}
                            {obrigatorio && <span aria-hidden className="text-destructive"> *</span>}
                          </span>
                        </Label>
                        {err(name) && <p id={`${name}-error`} role="alert" className="mt-2 text-sm text-destructive">{err(name)}</p>}
                      </div>
                    )} />
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </form>
      )}

      {/* O "Powered by GiraHub" vem do PublicShell. */}
      <p className="text-center text-sm text-muted-foreground">© {new Date().getFullYear()} {curso.tenant_nome}</p>
    </PublicShell>
  );
}
