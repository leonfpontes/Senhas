/**
 * Public Gira Page — link direto de uma gira para emissão de senha.
 * Route: /public/gira/[id]
 *
 * Estados: carregando · gira não encontrada · emissão ainda não configurada ·
 * aguardando (contagem regressiva) · aberta (formulário / fila de espera) ·
 * esgotada ou encerrada · sucesso (Bilhete).
 *
 * Formulário com react-hook-form + zod (erro inline no blur), botão fixo no rodapé
 * sempre ativo — ao enviar com campo pendente, o foco vai para ele. Erros acionáveis:
 * recusa por horário (error_code TIME_SLOT_*: lotado, removido, inválido, obrigatório) limpa o
 * horário escolhido e recarrega a lista; 409 (já tem senha) oferece "Reenviar meu e-mail"
 * (POST /api/v1/public/resend-ticket-email, só desta gira); rede/5xx oferece "Tentar de novo";
 * 410 (lotou) e 400/404 (acompanhantes, associado) mostram a mensagem do backend e recarregam a gira.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowRight, CalendarX2, Clock, Hourglass, Loader2, Mail, SearchX, Star, WifiOff } from 'lucide-react';
import { guardarBilhete } from '@/lib/bilheteGuardado';
import { PRIORITY_CATEGORY_LABELS, PRIORITY_ORDER } from 'shared-types';
import type { GiraPublic } from 'shared-types';
import { apiClient } from '@/services/api_client';
import { useGiraCountdown, parseCountdownParts } from '@/hooks/useGiraCountdown';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TextField, MaskedInput } from '@/components/fields';
import {
  Bilhete,
  PublicLoading,
  PublicNotice,
  PublicShell,
  errorStatus,
  formatGiraDate,
  isTimeSlotError,
  publicErrorMessage,
  tenantAgendaPath,
  ticketIdFromLink,
  type PublicTicket,
} from '@/components/public';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AcompanhanteEmitido {
  name: string;
  ticket_number: string;
}

interface EmitResponse {
  ticket_number?: string;
  numero?: number | string;
  rescue_link?: string;
  message?: string;
  waitlisted?: boolean;
  waitlist_position?: number | null;
  priority_upgraded?: boolean;
  acompanhantes?: AcompanhanteEmitido[];
}

interface EmitSuccess {
  ticket: PublicTicket;
  ticketId: string | null;
  /** Link do bilhete (rescue_link) — vai na mensagem do WhatsApp. */
  shareLink: string | null;
  email: string;
  waitlisted: boolean;
  waitlistPosition: number | null;
  priorityUpgraded: boolean;
  /** Beta "Senha para outra pessoa": primeiro nome de quem vai. */
  paraQuem: string | null;
}

type SubmitErrorKind = 'conflict' | 'gone' | 'slot' | 'network' | 'generic';
interface SubmitError {
  kind: SubmitErrorKind;
  message: string;
}

type LoadError = 'notfound' | 'network';

// ─── Schema ───────────────────────────────────────────────────────────────────

const PRIORITY_VALUES = PRIORITY_ORDER as readonly string[];

function buildSchema(opts: { requiresSlot: boolean; acompanhantesAtivos: boolean }) {
  return z
    .object({
      nome: z.string().trim().min(3, 'Digite seu nome completo'),
      email: z.string().trim().min(1, 'Digite seu e-mail').email('Digite um e-mail válido'),
      telefone: z.string().refine((v) => {
        const d = v.replace(/\D/g, '');
        return d.length === 0 || d.length >= 10;
      }, 'Celular incompleto — use DDD + número'),
      preferencial: z.enum(['nao', 'sim']),
      priorityCategory: z.string().nullable(),
      timeSlotId: z.string().nullable(),
      levarAcompanhantes: z.boolean(),
      acompanhantes: z.array(z.object({ nome: z.string() })),
      paraOutraPessoa: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (v.preferencial === 'sim' && !(v.priorityCategory && PRIORITY_VALUES.includes(v.priorityCategory))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['priorityCategory'], message: 'Escolha o tipo de atendimento preferencial' });
      }
      if (opts.requiresSlot && !v.timeSlotId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['timeSlotId'], message: 'Escolha um horário de atendimento' });
      }
      if (opts.acompanhantesAtivos && v.levarAcompanhantes) {
        v.acompanhantes.forEach((a, i) => {
          if (a.nome.trim().length < 2) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acompanhantes', i, 'nome'], message: 'Digite o nome do acompanhante' });
          }
        });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const LEGAL_TEXT =
  'O atendimento preferencial obedece à Lei nº 10.048/2000 (idosos, gestantes, lactantes, pessoas com deficiência e mobilidade reduzida) e à Lei nº 13.146/2015 (Estatuto da Pessoa com Deficiência). Informe só se você se encaixa em um desses grupos: a equipe do terreiro pode pedir comprovação na entrada.';

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function CountdownBlock({ seconds }: { seconds: number }) {
  const parts = parseCountdownParts(seconds);
  const blocks = [
    { label: parts.days === 1 ? 'dia' : 'dias', value: parts.days },
    { label: parts.hours === 1 ? 'hora' : 'horas', value: parts.hours },
    { label: 'min', value: parts.minutes },
    { label: 'seg', value: parts.seconds },
  ];
  const visible = parts.days > 0 ? blocks : blocks.slice(1);

  return (
    // Jornada 3 v2: ContagemRegressiva do design system — números grandes em Fraunces entre filetes, sem caixas coloridas.
    <div className="my-4 flex border-y border-border py-3" role="timer" aria-live="off">
      {visible.map((b) => (
        <div key={b.label} className="flex-1 text-center">
          <p className="font-display text-[2.75rem] font-semibold tabular-nums leading-none">{b.value}</p>
          <p className="mt-1 text-[15px] text-muted-foreground">{b.label}</p>
        </div>
      ))}
    </div>
  );
}

const TZ = 'America/Sao_Paulo';
function partes(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { ...o, timeZone: TZ }).format(d);
  const h = Number(f({ hour: 'numeric', hour12: false }));
  const m = Number(f({ minute: 'numeric' }));
  const semana = f({ weekday: 'long' }).replace('-feira', '');
  return { d, h, m, semana, dia: Number(f({ day: 'numeric' })), mes: Number(f({ month: 'numeric' })), mesNome: f({ month: 'long' }) };
}
/** '19:40' -> '19h40' */
const horaDoSlot = (hhmm: string) => (hhmm ? hhmm.slice(0, 5).replace(':', 'h') : '');
const horaFala = (h: number, m: number) => (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** "Sábado, 8 de novembro · 19h" */
function dataLonga(iso: string): string {
  const p = partes(iso);
  return p ? `${cap(p.semana)}, ${p.dia} de ${p.mesNome} · ${horaFala(p.h, p.m)}` : '';
}
/** "Sáb, 8/11 · 19h" */
function dataCurta(iso: string): string {
  const p = partes(iso);
  return p ? `${cap(p.semana.slice(0, 3))}, ${p.dia}/${p.mes} · ${horaFala(p.h, p.m)}` : '';
}
/** "Sexta, 7 de novembro, ao meio-dia" / "às 18h30" */
function aberturaEmFrase(iso: string): string {
  const p = partes(iso);
  if (!p) return '';
  const quando = p.h === 12 && !p.m ? 'ao meio-dia' : p.h === 0 && !p.m ? 'à meia-noite' : `às ${horaFala(p.h, p.m)}`;
  return `${cap(p.semana)}, ${p.dia} de ${p.mesNome}, ${quando}`;
}


function formatMinutes(seconds: number): string {
  const min = Math.max(0, Math.floor(seconds / 60));
  if (min >= 120) return `${Math.floor(min / 60)} horas`;
  if (min >= 60) return `1 hora e ${min - 60} min`;
  return `${min} min`;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PublicGiraPage() {
  const router = useRouter();
  const giraId = router.query.id as string;
  const tipo = (router.query.tipo as string) || 'comum';
  const isSponsor = tipo === 'associado' || tipo === 'patrocinador';

  const [gira, setGira] = useState<GiraPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [loadMessage, setLoadMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState<EmitSuccess | null>(null);

  const errorRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<HTMLFieldSetElement>(null);
  const priorityRef = useRef<HTMLFieldSetElement>(null);

  const fetchGira = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!giraId) return;
    try {
      if (!opts.silent) setLoading(true);
      const res = await apiClient.get<GiraPublic>(`/api/v1/public/gira/${giraId}?tipo=${tipo}`);
      setGira(res.data);
      setLoadError(null);
    } catch (err) {
      // Recarga silenciosa (contagem zerou, pós-envio): mantém o que já está na tela.
      if (opts.silent) return;
      const status = errorStatus(err);
      setLoadError(status === 404 ? 'notfound' : 'network');
      setLoadMessage(status === 404 ? '' : publicErrorMessage(err, 'Não foi possível carregar a gira.'));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [giraId, tipo]);

  useEffect(() => { fetchGira(); }, [fetchGira]);

  // Countdown hook — safe defaults when gira hasn't loaded
  const countdown = useGiraCountdown(gira?.release_start_at || '', gira?.release_end_at || '');

  // Quando a contagem zera (abre ou encerra), recarrega a gira: vagas e estado podem ter mudado.
  const prevStatus = useRef(countdown.status);
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = countdown.status;
    if (!gira) return;
    if ((prev === 'upcoming' && countdown.status === 'open') || (prev === 'open' && countdown.status === 'closed')) {
      fetchGira({ silent: true });
    }
  }, [countdown.status, fetchGira, gira]);

  // Estado da gira
  const hasRelease = Boolean(gira?.release_start_at && gira?.release_end_at);
  const isWaiting = hasRelease && countdown.status === 'upcoming';
  const waitlistMode = Boolean(gira?.is_exhausted && gira?.waitlist_available);
  const isOpen = hasRelease && countdown.status === 'open' && (!gira?.is_exhausted || waitlistMode);
  const isExhausted = Boolean((gira?.is_exhausted && !waitlistMode) || (hasRelease && countdown.status === 'closed'));
  const notConfigured = Boolean(gira && !hasRelease);

  // Acompanhantes: só fora da fila de espera e limitado tanto pela config da
  // gira quanto pelas senhas ainda disponíveis (o titular ocupa uma).
  const maxAcompanhantesSelecionavel = gira?.allow_acompanhantes
    ? Math.min(gira.max_acompanhantes, Math.max(0, gira.tickets_available - 1))
    : 0;
  const acompanhantesDisponiveis = !waitlistMode && maxAcompanhantesSelecionavel > 0;
  const requiresSlot = Boolean(gira?.use_time_slots && !waitlistMode);

  const schema = useMemo(
    () => buildSchema({ requiresSlot, acompanhantesAtivos: acompanhantesDisponiveis }),
    [requiresSlot, acompanhantesDisponiveis],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      nome: '',
      email: '',
      telefone: '',
      preferencial: 'nao',
      priorityCategory: null,
      timeSlotId: null,
      levarAcompanhantes: false,
      acompanhantes: [{ nome: '' }],
      paraOutraPessoa: false,
    },
  });
  const { register, control, handleSubmit, setValue, getValues, formState: { errors } } = form;

  const preferencial = useWatch({ control, name: 'preferencial' });
  const levarAcompanhantes = useWatch({ control, name: 'levarAcompanhantes' });
  const acompanhantes = useWatch({ control, name: 'acompanhantes' });
  const timeSlotId = useWatch({ control, name: 'timeSlotId' });
  const paraOutraPessoaMarcado = useWatch({ control, name: 'paraOutraPessoa' });
  const nomeDigitado = useWatch({ control, name: 'nome' });

  // Betas do Laboratório (jornadas v2): só chegam ligadas para casa beta tester.
  const betas = useMemo(() => new Set(gira?.betas ?? []), [gira?.betas]);
  const betaOutraPessoa = betas.has('beta_senha_para_outra_pessoa') && !isSponsor;
  const betaBilheteOffline = betas.has('beta_bilhete_offline');
  const betaReceberDeNovo = betas.has('beta_receber_senha_de_novo');
  const paraOutraPessoa = betaOutraPessoa && paraOutraPessoaMarcado;
  const [receberAberto, setReceberAberto] = useState(false);
  const [receberEmail, setReceberEmail] = useState('');
  const [receberEstado, setReceberEstado] = useState<'idle' | 'enviando' | 'pronto' | 'erro'>('idle');

  const setQtdAcompanhantes = (qtd: number) => {
    const prev = getValues('acompanhantes');
    const next = prev.slice(0, qtd);
    while (next.length < qtd) next.push({ nome: '' });
    setValue('acompanhantes', next, { shouldDirty: true });
  };

  const scrollToError = () => {
    requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const onInvalid = (errs: typeof errors) => {
    // Campos sem input nativo: leva o foco até o grupo pendente.
    if (errs.timeSlotId) {
      slotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      slotsRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    } else if (errs.priorityCategory && !errs.nome && !errs.email && !errs.telefone) {
      priorityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      priorityRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  };

  const localTicketFromResponse = (values: FormValues, data: EmitResponse): PublicTicket => {
    const g = gira as GiraPublic;
    const numero = data.ticket_number ?? (data.numero != null ? String(data.numero) : '');
    const waitlisted = Boolean(data.waitlisted);
    const slot = g.time_slots.find((s) => s.id === values.timeSlotId);
    return {
      ticket_number: numero,
      status: waitlisted ? 'waitlisted' : 'emitted',
      status_label: waitlisted ? 'Na fila de espera' : 'Confirmada',
      waitlisted,
      cancellable: false,
      cancel_reason: null,
      gira_name: g.nome,
      gira_date: formatGiraDate(g.data_inicio, ''),
      gira_date_iso: g.data_inicio,
      gira_local: g.local ?? null,
      horario: slot?.horario ?? null,
      recados: null,
      tenant_name: g.tenant_name,
      tenant_slug: g.tenant_slug,
      tenant_address: null,
      maps_url: null,
      tenant_logo_url: g.logo_url ?? null,
      primary_color: g.primary_color ?? null,
      secondary_color: g.secondary_color ?? null,
      consulente_name: values.nome.trim(),
      acompanhantes: (data.acompanhantes ?? []).map((a) => ({ ticket_number: a.ticket_number, name: a.name })),
    };
  };

  const onSubmit = async (values: FormValues) => {
    if (!gira) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiClient.post<EmitResponse>(
        `/api/v1/public/emit-ticket?tenant_slug=${gira.tenant_slug}&tipo=${tipo}&gira_id=${gira.id}`,
        {
          name: values.nome.trim(),
          email: values.email.trim(),
          phone: values.telefone,
          priority_category: values.preferencial === 'sim' ? values.priorityCategory : null,
          time_slot_id: requiresSlot ? values.timeSlotId : null,
          para_outra_pessoa: paraOutraPessoa,
          acompanhantes:
            acompanhantesDisponiveis && values.levarAcompanhantes
              ? values.acompanhantes.slice(0, maxAcompanhantesSelecionavel).map((a) => a.nome.trim())
              : [],
        },
      );
      const data = res.data ?? {};
      const ticketId = ticketIdFromLink(data.rescue_link);
      let ticket = localTicketFromResponse(values, data);
      if (ticketId) {
        // Enriquecer com o bilhete real (endereço, recados, cancelável); se falhar, fica o local.
        try {
          const full = await apiClient.get<PublicTicket>(`/api/v1/public/${gira.tenant_slug}/ticket/${ticketId}`);
          if (full?.data?.ticket_number) ticket = full.data;
        } catch {
          /* mantém o bilhete montado localmente */
        }
      }
      if (betaBilheteOffline && !data.waitlisted) guardarBilhete(ticket);
      setSuccess({
        ticket,
        ticketId,
        shareLink: data.rescue_link ?? null,
        email: values.email.trim(),
        waitlisted: Boolean(data.waitlisted),
        waitlistPosition: data.waitlist_position ?? null,
        priorityUpgraded: Boolean(data.priority_upgraded),
        paraQuem: paraOutraPessoa ? values.nome.trim().split(/\s+/)[0] : null,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      fetchGira({ silent: true });
    } catch (err) {
      const status = errorStatus(err);
      const message = publicErrorMessage(err, 'Não foi possível emitir sua senha.');
      if (isTimeSlotError(err)) {
        // Horário lotado (410), removido (409), inválido (404) ou não escolhido (400): o
        // status sozinho confundiria com "gira lotada" / "já tem senha". Limpa a escolha e
        // recarrega as vagas por horário.
        setSubmitError({ kind: 'slot', message });
        setValue('timeSlotId', null);
        fetchGira({ silent: true });
      } else if (status === 409) {
        setSubmitError({ kind: 'conflict', message });
      } else if (status === 410) {
        // Lotou entre abrir a página e enviar.
        setSubmitError({ kind: 'gone', message });
        fetchGira({ silent: true });
      } else if (!status || status >= 500) {
        setSubmitError({ kind: 'network', message });
      } else {
        // 400/404: limite de acompanhantes, e-mail de associado não encontrado… — a mensagem
        // do backend explica; vagas são recarregadas (o horário escolhido continua valendo).
        setSubmitError({ kind: 'generic', message });
        if (status === 400 || status === 404) {
          fetchGira({ silent: true });
        }
      }
      scrollToError();
    } finally {
      setSubmitting(false);
    }
  };

  const submit = handleSubmit(onSubmit, onInvalid);

  const handleResend = async () => {
    if (!gira) return;
    const email = getValues('email').trim();
    setResending(true);
    try {
      await apiClient.post(`/api/v1/public/resend-ticket-email?tenant_slug=${encodeURIComponent(gira.tenant_slug)}`, {
        email,
        gira_id: gira.id,
      });
      toast.success(`Reenviamos sua senha para ${email}. Confira também a caixa de spam.`);
    } catch (err) {
      toast.error(publicErrorMessage(err, 'Não foi possível reenviar o e-mail.'));
    } finally {
      setResending(false);
    }
  };

  // Beta "Receber a senha de novo": o bilhete volta SÓ para o e-mail, com resposta neutra —
  // mostrar na tela deixaria ver a senha de outra pessoa digitando o e-mail dela.
  const handleReceberDeNovo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gira || !receberEmail.trim()) return;
    setReceberEstado('enviando');
    try {
      await apiClient.post(`/api/v1/public/resend-ticket-email?tenant_slug=${encodeURIComponent(gira.tenant_slug)}`, {
        email: receberEmail.trim(),
        gira_id: gira.id,
      });
      setReceberEstado('pronto');
    } catch (err) {
      const status = errorStatus(err);
      setReceberEstado(status === 404 || status === 400 || status === 422 ? 'pronto' : 'erro');
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const brand = { primary: gira?.primary_color, secondary: gira?.secondary_color };
  // Jornada 3 v2: na faixa da casa, o endereço dela (o link que circula no WhatsApp).
  const subtitle = gira ? `girahub.com.br/${gira.tenant_slug}` : undefined;
  const pageTitle = gira ? `${gira.nome} · ${gira.tenant_name}` : 'Pegar minha senha';

  if (loading) {
    return (
      <PublicShell title="Carregando a gira…" hideHeader>
        <PublicLoading label="Carregando a gira…" />
      </PublicShell>
    );
  }

  if (loadError || !gira) {
    return (
      <PublicShell title={loadError === 'notfound' ? 'Gira não encontrada' : 'Não foi possível carregar'} hideHeader>
        {loadError === 'notfound' ? (
          <PublicNotice
            tone="warning"
            icon={<SearchX />}
            title="Gira não encontrada"
            description={loadMessage || 'Verifique o link e tente novamente, ou peça o link atualizado ao terreiro.'}
          />
        ) : (
          <PublicNotice
            tone="error"
            title="Não foi possível carregar"
            description={loadMessage || 'Verifique sua conexão e tente de novo.'}
            actions={
              <Button type="button" size="touch" className="w-full" onClick={() => fetchGira()}>
                Tentar de novo
              </Button>
            }
          />
        )}
      </PublicShell>
    );
  }

  const nextGirasButton = (
    <Button asChild size="touch" className="w-full">
      <Link href={tenantAgendaPath(gira.tenant_slug)}>Ver próximas giras do terreiro</Link>
    </Button>
  );

  const showForm = isOpen && !success;
  // J3 v2 · 08: quem já tem senha vê uma tela própria, não um alerta no meio do formulário.
  const jaTemSenha = showForm && submitError?.kind === 'conflict';

  const submitLabel = submitting
    ? 'Enviando…'
    : waitlistMode
      ? 'Entrar na fila de espera'
      : paraOutraPessoa
        ? `Pegar a senha para ${(nomeDigitado || '').trim().split(/\s+/)[0] || 'essa pessoa'}`
        : 'Pegar a senha';

  const footer = jaTemSenha ? (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        size="touch"
        className="h-[58px] w-full text-[1.1875rem] font-bold"
        onClick={handleResend}
        disabled={resending}
      >
        {resending ? <Loader2 className="animate-spin" /> : null}
        Reenviar meu e-mail
        {!resending && <Mail aria-hidden />}
      </Button>
      <Button type="button" variant="ghost" size="touch" className="w-full text-base font-semibold" onClick={() => setSubmitError(null)}>
        Usar outro e-mail
      </Button>
    </div>
  ) : isExhausted && !success ? (
    <Button asChild size="touch" className="h-[58px] w-full text-[1.1875rem] font-bold">
      <Link href={tenantAgendaPath(gira.tenant_slug)}>
        Ver próximas giras <ArrowRight aria-hidden />
      </Link>
    </Button>
  ) : showForm ? (
    <div className="flex flex-col gap-1.5">
      <Button
        type="submit"
        form="emit-form"
        size="touch"
        className="h-[58px] w-full text-[1.1875rem] font-bold"
        disabled={submitting}
        aria-busy={submitting}
      >
        {submitting ? <Loader2 className="animate-spin" /> : waitlistMode ? <Hourglass /> : null}
        {submitLabel}
      </Button>
      {/* J3 v2: o prazo e a privacidade numa linha só, como no rodapé do desenho. */}
      <p className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-warning-strong">A emissão encerra em {formatMinutes(countdown.timeRemaining)}</span>
        <Link
          href="/privacidade"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-foreground underline-offset-2 hover:underline"
          title="Seus dados são usados para emitir sua senha e enviar avisos sobre ela."
        >
          Privacidade
        </Link>
      </p>
    </div>
  ) : undefined;

  return (
    <PublicShell
      title={pageTitle}
      description={gira.descricao || `Pegue sua senha para ${gira.nome} — ${gira.tenant_name}`}
      tenantName={gira.tenant_name}
      logoUrl={gira.logo_url}
      subtitle={subtitle}
      brand={brand}
      footer={footer}
      headerExtra={
        isSponsor ? (
          <Badge className="gap-1 bg-amber-400 text-amber-950">
            <Star aria-hidden /> Associado
          </Badge>
        ) : undefined
      }
    >
      {/* Cabeçalho da gira */}
      {!success && (
        <section aria-labelledby="gira-titulo" className="px-1 pt-1">
          {waitlistMode && showForm && !jaTemSenha ? (
            <>
              <h1 id="gira-titulo" className="font-display text-[2rem] font-normal leading-tight tracking-[-0.02em] [text-wrap:balance]">
                {gira.max_tickets ? `As ${gira.max_tickets} senhas ` : 'As senhas '}
                <em className="text-[color:var(--color-barro-600)]">acabaram.</em>
              </h1>
              <p className="mt-0.5 text-base font-medium text-muted-foreground">
                {gira.nome} · {dataCurta(gira.data_inicio)}
              </p>
            </>
          ) : (
            <h1 id="gira-titulo" className="font-display text-[2rem] font-normal leading-tight tracking-[-0.02em] [text-wrap:balance]">{gira.nome}</h1>
          )}
          {gira.descricao && !waitlistMode && <p className="mt-1 text-base text-muted-foreground">{gira.descricao}</p>}
          {waitlistMode && showForm && !jaTemSenha ? null : isWaiting || !showForm || jaTemSenha ? (
            <p className="mt-1 text-[1.0625rem] font-semibold">{dataLonga(gira.data_inicio)}</p>
          ) : (
            <p className="mt-1 flex items-center justify-between gap-3 text-[1.0625rem] font-semibold">
              <span>{dataCurta(gira.data_inicio)}</span>
              <span className={waitlistMode ? 'text-warning-strong' : 'text-[color:var(--color-folha-700)]'}>
                {waitlistMode ? 'Lotou: fila de espera' : 'Ainda tem senha'}
              </span>
            </p>
          )}
        </section>
      )}

      {/* Beta: receber a senha de novo (só no e-mail) */}
      {betaReceberDeNovo && !success && (isOpen || isExhausted) && (
        <section className="flex flex-col gap-3 px-1" aria-labelledby="receber-de-novo">
          {!receberAberto ? (
            <Button
              type="button"
              variant="link"
              className="h-11 self-start px-0 text-base font-semibold text-foreground underline underline-offset-4"
              onClick={() => setReceberAberto(true)}
            >
              Já pegou? Receber a senha de novo <ArrowRight aria-hidden />
            </Button>
          ) : (
            <form onSubmit={handleReceberDeNovo} className="flex flex-col gap-3" noValidate>
              <h2 id="receber-de-novo" className="font-display text-2xl font-semibold">
                Receber a senha <em className="text-[color:var(--color-barro-600)]">de novo.</em>
              </h2>
              <p className="text-base text-muted-foreground">
                Digite o e-mail que você usou ao pegar a senha. Mandamos o bilhete para ele de novo.
              </p>
              <TextField
                label="E-mail"
                type="email"
                autoComplete="email"
                inputMode="email"
                inputClassName="h-12"
                value={receberEmail}
                onChange={(e) => {
                  setReceberEmail(e.target.value);
                  if (receberEstado !== 'enviando') setReceberEstado('idle');
                }}
              />
              {receberEstado === 'pronto' && (
                <Alert variant="success">
                  <AlertTitle>Pronto</AlertTitle>
                  <AlertDescription>Se este e-mail tiver senha nesta gira, ela chega em instantes. Olhe também o spam.</AlertDescription>
                </Alert>
              )}
              {receberEstado === 'erro' && (
                <Alert variant="destructive">
                  <AlertDescription>Não foi possível mandar agora. Confira a internet e tente de novo.</AlertDescription>
                </Alert>
              )}
              <Button type="submit" size="touch" className="w-full" disabled={receberEstado === 'enviando' || !receberEmail.trim()}>
                {receberEstado === 'enviando' ? <Loader2 className="animate-spin" /> : <Mail aria-hidden />} Mandar de novo
              </Button>
            </form>
          )}
        </section>
      )}

      {/* Ainda não configurada */}
      {notConfigured && (
        <PublicNotice
          tone="info"
          icon={<CalendarX2 />}
          title="Emissão de senhas ainda não configurada"
          description="Aguarde o terreiro liberar as senhas desta gira."
          actions={nextGirasButton}
        />
      )}

      {/* Aguardando — contagem regressiva */}
      {isWaiting && (
        <section className="flex flex-col gap-3 px-1 pt-2" aria-labelledby="abrem-em">
          <h2 id="abrem-em" className="font-display text-[1.5rem] font-normal tracking-[-0.01em]">As senhas abrem em</h2>
          <CountdownBlock seconds={countdown.timeRemaining} />
          <p className="text-[1.0625rem]">
            {aberturaEmFrase(gira.release_start_at as string)}.{gira.max_tickets ? ` ${gira.max_tickets} senhas.` : ''} Pode
            deixar esta página aberta: o formulário aparece aqui na hora.
          </p>
          {gira.recados && (
            <div className="border-t border-border pt-3">
              <p className="text-base font-semibold">Recado da casa</p>
              <p className="mt-1 text-base whitespace-pre-line text-muted-foreground">{gira.recados}</p>
            </div>
          )}
        </section>
      )}

      {/* Aberta — formulário (ou fila de espera, quando lotado mas com fila habilitada) */}
      {jaTemSenha && (
        <section aria-labelledby="ja-tem-senha" className="px-1" ref={errorRef}>
          <h2 id="ja-tem-senha" className="font-display text-[1.75rem] font-normal leading-tight tracking-[-0.02em]">
            Você já tem <em className="text-[color:var(--color-barro-600)]">senha.</em>
          </h2>
          <p className="mt-2 text-[1.0625rem] leading-relaxed">
            O e-mail {getValues('email').trim()} já pegou senha para esta gira. A senha é uma por pessoa.
          </p>
          <p className="mt-3 text-[0.9375rem] text-muted-foreground">
            Não achou o e-mail? Olhe o spam ou peça de novo: mandamos a mesma senha.
          </p>
        </section>
      )}

      {showForm && !jaTemSenha && (
        <Card className="border-0 bg-transparent py-2 shadow-none ring-0">
          <CardContent className="px-1">
            {isSponsor && !waitlistMode && <h2 className="font-display text-2xl font-normal">Sua senha de associado</h2>}

            {waitlistMode && (
              <p className="text-[1.0625rem] leading-relaxed">
                As senhas desta gira já foram todas emitidas. Preencha seus dados para entrar na fila de espera — se
                alguma senha for cancelada, avisamos por e-mail.
              </p>
            )}

            {submitError && (
              <div ref={errorRef} className="mt-3">
                {submitError.kind === 'slot' && (
                  <Alert variant="warning">
                    <Clock />
                    <AlertTitle>Escolha outro horário</AlertTitle>
                    <AlertDescription>
                      <p>{submitError.message}</p>
                      <p>Atualizamos as vagas de cada horário.</p>
                    </AlertDescription>
                  </Alert>
                )}
                {submitError.kind === 'gone' && (
                  <Alert variant="warning">
                    <AlertTitle>As vagas acabaram enquanto você preenchia</AlertTitle>
                    <AlertDescription>
                      <p>{submitError.message}</p>
                      <p>Atualizamos a página com a situação atual da gira.</p>
                    </AlertDescription>
                  </Alert>
                )}
                {submitError.kind === 'network' && (
                  <Alert variant="destructive">
                    <AlertTitle>Não foi possível enviar</AlertTitle>
                    <AlertDescription>
                      <p>{submitError.message}</p>
                      <Button type="button" variant="outline" size="touch" className="mt-1 w-full" onClick={() => submit()} disabled={submitting}>
                        Tentar de novo
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                {submitError.kind === 'generic' && (
                  <Alert variant="destructive">
                    <AlertTitle>Não foi possível emitir sua senha</AlertTitle>
                    <AlertDescription>{submitError.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <form id="emit-form" onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
              {/* Horários (J3 v2 · 03): uma linha de 60 px por horário, a hora e as vagas; esgotado é dito, não apagado. */}
              {requiresSlot && (
                <fieldset ref={slotsRef} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
                  <legend className="mb-2 p-0">
                    <span className="block font-display text-[1.5rem] font-normal tracking-[-0.01em]">Que horas você chega?</span>
                    <span className="block text-base text-muted-foreground">Cada senha tem hora marcada</span>
                  </legend>
                  {gira.time_slots.length === 0 ? (
                    <p className="text-base text-muted-foreground">Nenhum horário disponível no momento.</p>
                  ) : (
                    <Controller
                      control={control}
                      name="timeSlotId"
                      render={({ field }) => (
                        <RadioGroup
                          value={field.value ?? ''}
                          onValueChange={(v) => field.onChange(v || null)}
                          aria-label="Horário de atendimento"
                          aria-invalid={Boolean(errors.timeSlotId) || undefined}
                          className="gap-2"
                        >
                          {gira.time_slots.map((slot) => {
                            const full = slot.vagas_disponiveis <= 0;
                            const id = `slot-${slot.id}`;
                            const escolhido = field.value === slot.id;
                            return (
                              <Label
                                key={slot.id}
                                htmlFor={id}
                                className={cn(
                                  'flex min-h-[60px] items-center gap-3 rounded-[10px] border px-[18px] text-[1.1875rem] font-semibold',
                                  full ? 'cursor-not-allowed border-transparent bg-muted text-muted-foreground' : 'cursor-pointer bg-card',
                                  escolhido && 'border-[1.5px] border-primary bg-primary/5',
                                )}
                              >
                                <span className="flex-1">{horaDoSlot(slot.horario)}</span>
                                <span className={cn('text-base font-semibold', full ? 'font-medium' : 'text-[color:var(--color-folha-700)]')}>
                                  {full ? 'esgotado' : `${slot.vagas_disponiveis} vaga${slot.vagas_disponiveis === 1 ? '' : 's'}`}
                                </span>
                                <RadioGroupItem id={id} value={slot.id} disabled={full} className="size-6" />
                              </Label>
                            );
                          })}
                        </RadioGroup>
                      )}
                    />
                  )}
                  {errors.timeSlotId && (
                    <p role="alert" className="text-sm text-destructive">{errors.timeSlotId.message}</p>
                  )}
                  {timeSlotId && !errors.timeSlotId && (
                    <p className="text-base font-semibold">
                      Horário escolhido: {horaDoSlot(gira.time_slots.find((s) => s.id === timeSlotId)?.horario ?? '')}
                    </p>
                  )}
                </fieldset>
              )}

              {betaOutraPessoa && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-base font-semibold">Para quem é a senha?</legend>
                  <Controller
                    control={control}
                    name="paraOutraPessoa"
                    render={({ field }) => (
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        spacing={2}
                        value={field.value ? 'outra' : 'mim'}
                        onValueChange={(v) => v && field.onChange(v === 'outra')}
                        aria-label="Para quem é a senha"
                        className="w-full"
                      >
                        <ToggleGroupItem
                          value="mim"
                          className="h-12 flex-1 text-base data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                        >
                          Para mim
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="outra"
                          className="h-12 flex-1 text-base data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                        >
                          Para outra pessoa
                        </ToggleGroupItem>
                      </ToggleGroup>
                    )}
                  />
                </fieldset>
              )}

              {/* Três campos acima da dobra */}
              <TextField
                label={paraOutraPessoa ? 'Nome de quem vai' : 'Nome completo'}
                helperText={paraOutraPessoa ? 'É o nome chamado na porta.' : undefined}
                required
                autoComplete="name"
                autoCapitalize="words"
                error={errors.nome?.message}
                inputClassName="h-12"
                {...register('nome')}
              />
              <TextField
                label={paraOutraPessoa ? 'Seu e-mail' : 'E-mail'}
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                helperText={paraOutraPessoa ? 'A senha chega para você. Mostre ou encaminhe para quem vai.' : 'A senha chega aqui.'}
                error={errors.email?.message}
                inputClassName="h-12"
                {...register('email')}
              />
              {/* Na senha para outra pessoa o celular seria de quem vai; a beta não o pede. */}
              {!paraOutraPessoa && (
              <Controller
                control={control}
                name="telefone"
                render={({ field }) => (
                  <MaskedInput
                    mask="telefone"
                    label="Celular (WhatsApp)"
                    placeholder="(11) 99999-9999"
                    autoComplete="tel-national"
                    inputMode="tel"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    error={errors.telefone?.message}
                    helperText={errors.telefone ? undefined : 'Opcional.'}
                    inputClassName="h-12"
                  />
                )}
              />
              )}

              {/* Atendimento preferencial */}
              <fieldset ref={priorityRef} className="m-0 min-w-0 border-0 p-0 flex flex-col gap-2">
                <legend className="p-0 mb-2 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-base font-semibold">
                  <span>Atendimento preferencial?</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="link" size="sm" className="h-auto min-h-6 px-0 text-[0.9375rem] font-semibold text-foreground underline underline-offset-4">
                        Saiba mais
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 text-sm leading-relaxed">
                      {LEGAL_TEXT}
                    </PopoverContent>
                  </Popover>
                </legend>
                <Controller
                  control={control}
                  name="preferencial"
                  render={({ field }) => (
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      spacing={2}
                      value={field.value}
                      onValueChange={(v) => {
                        if (!v) return; // não deixa desmarcar
                        field.onChange(v);
                        if (v === 'nao') setValue('priorityCategory', null, { shouldValidate: true });
                      }}
                      aria-label="Atendimento preferencial"
                      className="w-full"
                    >
                      <ToggleGroupItem
                        value="nao"
                        className="h-12 flex-1 text-base data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                      >
                        Não
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="sim"
                        className="h-12 flex-1 text-base data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                      >
                        Sim
                      </ToggleGroupItem>
                    </ToggleGroup>
                  )}
                />
                <Collapsible open={preferencial === 'sim'}>
                  <CollapsibleContent className="pt-2">
                    <Controller
                      control={control}
                      name="priorityCategory"
                      render={({ field }) => (
                        <RadioGroup
                          value={field.value ?? ''}
                          onValueChange={(v) => field.onChange(v)}
                          aria-label="Tipo de atendimento preferencial"
                          aria-invalid={Boolean(errors.priorityCategory) || undefined}
                          className="gap-2"
                        >
                          {PRIORITY_ORDER.map((cat) => {
                            const id = `prio-${cat}`;
                            return (
                              <Label
                                key={cat}
                                htmlFor={id}
                                className={cn(
                                  'flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-base font-normal',
                                  field.value === cat && 'border-primary bg-primary/5',
                                )}
                              >
                                <RadioGroupItem id={id} value={cat} className="size-5" />
                                {PRIORITY_CATEGORY_LABELS[cat]}
                              </Label>
                            );
                          })}
                        </RadioGroup>
                      )}
                    />
                    {errors.priorityCategory && (
                      <p role="alert" className="mt-2 text-sm text-destructive">{errors.priorityCategory.message}</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </fieldset>

              {/* Acompanhantes */}
              {gira.allow_acompanhantes && !waitlistMode && (
                <fieldset className="m-0 min-w-0 border-0 p-0 flex flex-col gap-2">
                  <legend className="sr-only">Acompanhantes</legend>
                  {acompanhantesDisponiveis ? (
                    <Collapsible open={levarAcompanhantes}>
                      <Label
                        htmlFor="levar-acompanhantes"
                        className="flex min-h-12 cursor-pointer items-center gap-3 text-[1.0625rem] font-normal"
                      >
                        <Controller
                          control={control}
                          name="levarAcompanhantes"
                          render={({ field }) => (
                            <Checkbox
                              id="levar-acompanhantes"
                              className="size-5"
                              checked={field.value}
                              onCheckedChange={(c) => {
                                const checked = c === true;
                                field.onChange(checked);
                                if (checked && getValues('acompanhantes').length === 0) setQtdAcompanhantes(1);
                              }}
                            />
                          )}
                        />
                        Vou levar acompanhante
                      </Label>
                      <CollapsibleContent className="flex flex-col gap-4 pt-3">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="qtd-acompanhantes">Quantos acompanhantes?</Label>
                          <Select
                            value={String(Math.min(acompanhantes.length, maxAcompanhantesSelecionavel) || 1)}
                            onValueChange={(v) => setQtdAcompanhantes(Number(v))}
                          >
                            <SelectTrigger id="qtd-acompanhantes" className="h-12 w-full text-base">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: maxAcompanhantesSelecionavel }, (_, i) => i + 1).map((qtd) => (
                                <SelectItem key={qtd} value={String(qtd)}>{qtd}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {acompanhantes.slice(0, maxAcompanhantesSelecionavel).map((_, index) => (
                          <TextField
                            key={index}
                            label={`Nome do acompanhante ${index + 1}`}
                            required
                            autoComplete="off"
                            autoCapitalize="words"
                            error={errors.acompanhantes?.[index]?.nome?.message}
                            inputClassName="h-12"
                            {...register(`acompanhantes.${index}.nome` as const)}
                          />
                        ))}
                        <p className="text-sm text-muted-foreground">
                          Cada acompanhante recebe uma senha própria, enviada no mesmo e-mail.
                        </p>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <p className="text-sm text-muted-foreground">Não há senhas suficientes para levar acompanhantes.</p>
                  )}
                </fieldset>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Sucesso — Bilhete */}
      {success && (
        <Bilhete
          ticket={success.ticket}
          ticketId={success.ticketId}
          shareLink={success.shareLink ?? undefined}
          heading={
            success.waitlisted ? (
              <>
                Você está na <em className="text-[color:var(--color-barro-600)]">fila.</em>
              </>
            ) : success.priorityUpgraded ? (
              <>
                Prioridade <em className="text-[color:var(--color-barro-600)]">registrada.</em>
              </>
            ) : (
              <>
                Senha <em className="text-[color:var(--color-barro-600)]">emitida.</em>
              </>
            )
          }
          intro={
            <>
              Mandamos os detalhes para <strong className="text-foreground">{success.email}</strong>.
              {success.paraQuem && <> Mostre ou encaminhe para {success.paraQuem}.</>}
            </>
          }
          notice={
            <>
              {betaBilheteOffline && !success.waitlisted && (
                <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <WifiOff className="size-4" aria-hidden /> Esta senha fica guardada neste celular e abre até sem internet.
                </p>
              )}
              {success.waitlisted && success.waitlistPosition != null && (
                <p className="text-center text-base">
                  Sua posição na fila: <strong className="text-lg">{success.waitlistPosition}º</strong>
                </p>
              )}
              {success.priorityUpgraded && (
                <Alert variant="info">
                  <AlertDescription>
                    {success.waitlisted
                      ? 'Você já estava na fila desta gira — registramos seu atendimento preferencial e sua posição foi atualizada.'
                      : 'Você já tinha uma senha para esta gira — registramos seu atendimento preferencial nela e reenviamos o e-mail de confirmação.'}
                  </AlertDescription>
                </Alert>
              )}
            </>
          }
        />
      )}

      {/* Esgotada / encerrada (J3 v2 · 12): o fato dito na página, e a saída no rodapé. */}
      {isExhausted && !success && (
        <section aria-labelledby="acabaram" className="px-1">
          <h2 id="acabaram" className="font-display text-[1.75rem] font-normal leading-tight tracking-[-0.02em]">
            {gira.is_exhausted ? (
              <>
                As senhas <em className="text-[color:var(--color-barro-600)]">acabaram.</em>
              </>
            ) : (
              <>
                A emissão <em className="text-[color:var(--color-barro-600)]">encerrou.</em>
              </>
            )}
          </h2>
          <p className="mt-2 text-[1.0625rem] leading-relaxed">
            {gira.is_exhausted
              ? `Todas as ${gira.max_tickets ? `${gira.max_tickets} ` : ''}senhas desta gira foram pegas, e ela não tem fila de espera.`
              : 'O período de emissão de senhas para esta gira já foi encerrado.'}
          </p>
        </section>
      )}
    </PublicShell>
  );
}
