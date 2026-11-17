/**
 * GuidedSetup — começo guiado do novo construtor (beta "Novo construtor do site"):
 * 5 perguntas curtas, com a prévia do site se formando ao lado, e no fim 3 estilos já
 * com o conteúdo da casa para escolher.
 *
 * Regras: nada é inventado sobre a casa (o texto do "Sobre" é montado só com as
 * respostas); nenhuma opção vem marcada; toda pergunta pode ser pulada.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/fields';
import type { PublicSiteData, SectionConfig, SiteSection } from '../types';
import { SITE_STYLES, applySiteStyle, houseStyle, type SiteStyle } from '../styles';
import { loadTenantFacts, type SectionDraft, type TenantFacts } from './SetupWizard';
import { MiniSite } from './MiniSite';

export const TRADICOES = ['Umbanda', 'Candomblé', 'Umbanda e Candomblé', 'Quimbanda', 'Jurema', 'Omolokô'];
export const OFERTAS = [
  'giras de atendimento',
  'desenvolvimento mediúnico',
  'cursos e estudos',
  'festas',
  'ações sociais',
  'venda de artigos religiosos',
];
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface Horario {
  dia: string;
  hora: string;
  nome: string;
}

export interface GuidedAnswers {
  nome: string;
  endereco: string;
  email: string;
  whatsapp: string;
  tradicao: string;
  ofertas: string[];
  rotina: Horario[];
  instagram: string;
  youtube: string;
  facebook: string;
}

function juntar(lista: string[]): string {
  if (lista.length <= 1) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}`;
}

/** Texto do "Sobre" montado só com as respostas. Vazio se a casa não respondeu nada. */
export function sobreDasRespostas(a: Pick<GuidedAnswers, 'nome' | 'tradicao' | 'ofertas'>): string {
  const partes: string[] = [];
  const nome = a.nome.trim() || 'Nossa casa';
  if (a.tradicao.trim()) partes.push(`${nome} é uma casa de ${a.tradicao.trim()}.`);
  if (a.ofertas.length) partes.push(`Aqui acontecem ${juntar(a.ofertas)}.`);
  return partes.join(' ');
}

/** Seções do site a partir das respostas, já com o estilo aplicado. */
export function buildGuidedSections(facts: TenantFacts | null, a: GuidedAnswers, style: SiteStyle): SectionDraft[] {
  const hero: SectionConfig = {
    title: a.nome.trim() || 'Nosso terreiro',
    subtitle: 'Seja bem-vindo(a). Retire sua senha e participe das nossas giras.',
  };
  if (facts?.logoUrl) Object.assign(hero, { logo_mode: 'logo', logo_position: 'left', logo_size: 'md', logo_image_url: facts.logoUrl });
  const rotina = a.rotina.filter((h) => h.dia.trim() || h.nome.trim());
  const temRedes = Boolean(a.instagram.trim() || a.youtube.trim() || a.facebook.trim() || a.whatsapp.trim());

  const drafts: SectionDraft[] = [
    { section_type: 'HERO', config: hero },
    { section_type: 'ABOUT', config: { title: 'Sobre a casa', body: sobreDasRespostas(a) } },
    ...(rotina.length ? [{ section_type: 'ROTINA' as const, config: { title: 'Rotina da casa', items: rotina } }] : []),
    { section_type: 'GIRAS_CALENDAR', config: { title: 'Próximas giras', display_mode: 'calendar', calendar_highlight_color: style.heroFrom } },
    { section_type: 'LOCATION', config: { title: 'Como chegar', ...(a.endereco.trim() ? { address: a.endereco.trim() } : {}) } },
    {
      section_type: 'CONTACT',
      config: {
        title: 'Contato',
        contact_layout: 'cards',
        ...(a.email.trim() ? { email: a.email.trim() } : {}),
        ...(a.whatsapp.trim() ? { phone: a.whatsapp.trim() } : {}),
        ...(a.instagram.trim() ? { instagram: a.instagram.trim().replace(/^@/, '') } : {}),
      },
    },
    ...(temRedes
      ? [{ section_type: 'SOCIAL' as const, config: { title: 'Acompanhe a casa', layout: 'botoes', instagram: a.instagram, youtube: a.youtube, facebook: a.facebook, whatsapp: a.whatsapp } }]
      : []),
  ];
  const asSections: SiteSection[] = drafts.map((d, i) => ({ id: `g-${i}`, section_type: d.section_type, order_index: i, config: d.config }));
  return applySiteStyle(asSections, style).map((s) => ({ section_type: s.section_type as SectionDraft['section_type'], config: s.config }));
}

function previewData(slug: string, drafts: SectionDraft[]): PublicSiteData {
  return {
    id: 'previa',
    slug,
    status: 'DRAFT',
    template: 'moderno',
    meta_title: null,
    meta_description: null,
    sections: drafts.map((d, i) => ({ id: `p-${i}`, section_type: d.section_type, order_index: i, config: d.config })),
    upcoming_giras: [],
  };
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        selected ? 'border-brand bg-brand text-white' : 'border-border bg-card hover:border-foreground/40',
      )}
    >
      {selected && <Check className="size-4" aria-hidden />}
      {children}
    </button>
  );
}

export interface GuidedSetupProps {
  slug: string;
  canEdit: boolean;
  onCreate: (sections: SectionDraft[]) => void;
  onSkip: () => void;
}

const STEPS = ['Sua casa', 'Tradição', 'O que a casa oferece', 'Rotina', 'Redes', 'Estilo'];

export function GuidedSetup({ slug, canEdit, onCreate, onSkip }: GuidedSetupProps) {
  const [facts, setFacts] = useState<TenantFacts | null>(null);
  const [step, setStep] = useState(0);
  const [outraTradicao, setOutraTradicao] = useState(false);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [a, setA] = useState<GuidedAnswers>({
    nome: '',
    endereco: '',
    email: '',
    whatsapp: '',
    tradicao: '',
    ofertas: [],
    rotina: [],
    instagram: '',
    youtube: '',
    facebook: '',
  });
  const set = (patch: Partial<GuidedAnswers>) => setA((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    let cancelled = false;
    loadTenantFacts().then((f) => {
      if (cancelled) return;
      setFacts(f);
      setA((prev) => ({ ...prev, nome: prev.nome || f.nome || '', endereco: prev.endereco || f.endereco || '', email: prev.email || f.email || '' }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A casa que escolheu cores no GiraHub vê "Cores da casa" primeiro; sem escolha, o padrão GiraHub (Terra).
  const choices: SiteStyle[] = useMemo(() => {
    const chose = facts && (facts.primary.toLowerCase() !== '#2e6a4e' || facts.secondary.toLowerCase() !== '#e9b04a');
    const base = SITE_STYLES.filter((s) => s.id !== 'noite');
    return chose && facts ? [houseStyle(facts.primary, facts.secondary), ...base.slice(0, 2)] : base;
  }, [facts]);
  const chosen = choices.find((s) => s.id === styleId) ?? choices[0];
  const drafts = useMemo(() => buildGuidedSections(facts, a, chosen), [facts, a, chosen]);

  const last = STEPS.length - 1;
  const next = () => setStep((s) => Math.min(last, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const body = (() => {
    switch (step) {
      case 0:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Já trouxemos o que o GiraHub sabe da casa. Confira e complete.</p>
            <TextField label="Nome da casa" value={a.nome} onChange={(e) => set({ nome: e.target.value })} />
            <TextField label="Endereço" value={a.endereco} onChange={(e) => set({ endereco: e.target.value })} placeholder="Rua, número, bairro, cidade" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="E-mail" type="email" value={a.email} onChange={(e) => set({ email: e.target.value })} />
              <TextField label="WhatsApp" value={a.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="(11) 99999-9999" />
            </div>
          </div>
        );
      case 1:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Aparece no texto “Sobre a casa”. Se preferir não dizer, é só pular.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Tradição">
              {TRADICOES.map((t) => (
                <Chip key={t} selected={!outraTradicao && a.tradicao === t} onClick={() => { setOutraTradicao(false); set({ tradicao: a.tradicao === t ? '' : t }); }}>
                  {t}
                </Chip>
              ))}
              <Chip selected={outraTradicao} onClick={() => { setOutraTradicao(!outraTradicao); set({ tradicao: '' }); }}>
                Outra
              </Chip>
            </div>
            {outraTradicao && <TextField label="Qual?" value={a.tradicao} onChange={(e) => set({ tradicao: e.target.value })} autoFocus />}
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Marque o que acontece na casa. Nada vem marcado.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="O que a casa oferece">
              {OFERTAS.map((o) => (
                <Chip key={o} selected={a.ofertas.includes(o)} onClick={() => set({ ofertas: a.ofertas.includes(o) ? a.ofertas.filter((x) => x !== o) : [...a.ofertas, o] })}>
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </Chip>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Dias e horários que se repetem. As giras com data marcada já entram sozinhas no calendário.</p>
            {a.rotina.map((h, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Dia do horário ${i + 1}`}>
                  {DIAS.map((d) => (
                    <Chip key={d} selected={h.dia === d} onClick={() => set({ rotina: a.rotina.map((x, j) => (j === i ? { ...x, dia: x.dia === d ? '' : d } : x)) })}>
                      {d}
                    </Chip>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
                  <TextField label="Horário" value={h.hora} placeholder="19h" onChange={(e) => set({ rotina: a.rotina.map((x, j) => (j === i ? { ...x, hora: e.target.value } : x)) })} />
                  <TextField label="O que acontece" value={h.nome} placeholder="Gira de atendimento" onChange={(e) => set({ rotina: a.rotina.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remover horário ${i + 1}`} className="text-destructive" onClick={() => set({ rotina: a.rotina.filter((_, j) => j !== i) })}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            {a.rotina.length < 10 && (
              <Button type="button" variant="outline" className="self-start" onClick={() => set({ rotina: [...a.rotina, { dia: '', hora: '', nome: '' }] })}>
                <Plus aria-hidden /> Adicionar horário
              </Button>
            )}
          </div>
        );
      case 4:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Viram botões no site. Pode deixar em branco.</p>
            <TextField label="Instagram" value={a.instagram} onChange={(e) => set({ instagram: e.target.value })} placeholder="@suacasa" />
            <TextField label="YouTube" value={a.youtube} onChange={(e) => set({ youtube: e.target.value })} placeholder="@suacasa" />
            <TextField label="Facebook" value={a.facebook} onChange={(e) => set({ facebook: e.target.value })} placeholder="nome da página" />
          </div>
        );
      default:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Escolha o jeito do site. Dá para trocar depois no botão Estilo, sem perder nada.</p>
            <div role="radiogroup" aria-label="Estilo do site" className="grid gap-4 sm:grid-cols-3">
              {choices.map((s) => {
                const selected = chosen.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setStyleId(s.id)}
                    className={cn(
                      'flex flex-col items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      selected ? 'border-brand bg-brand/5' : 'border-border hover:border-foreground/40',
                    )}
                  >
                    <MiniSite site={previewData(slug, buildGuidedSections(facts, a, s))} width={150} height={260} />
                    <span className="flex w-full items-center justify-between font-semibold">
                      {s.label}
                      {selected && <Check className="size-4 text-brand" aria-hidden />}
                    </span>
                    <span className="w-full text-xs text-muted-foreground">{s.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
    }
  })();

  return (
    <div className="flex flex-1 overflow-y-auto" data-testid="guided-setup">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Passo {step + 1} de {STEPS.length} · {STEPS[step]}
            </p>
            <div className="mt-2 flex gap-1" aria-hidden>
              {STEPS.map((_, i) => (
                <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand' : 'bg-muted')} />
              ))}
            </div>
            <h1 className="mt-4 font-display text-2xl sm:text-3xl">
              {step === 0 && 'Vamos montar o site da sua casa'}
              {step === 1 && 'Sua casa é de qual tradição?'}
              {step === 2 && 'O que acontece na casa?'}
              {step === 3 && 'A casa tem dias e horários fixos?'}
              {step === 4 && 'Onde a casa está nas redes?'}
              {step === 5 && 'Escolha o estilo'}
            </h1>
          </div>

          {facts === null ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Buscando os dados da casa…
            </p>
          ) : (
            body
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {step > 0 ? (
              <Button variant="ghost" onClick={back}>
                <ArrowLeft aria-hidden /> Voltar
              </Button>
            ) : (
              <Button variant="ghost" onClick={onSkip}>
                Montar do zero
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {step > 0 && step < last && (
                <Button variant="outline" onClick={next}>
                  Pular
                </Button>
              )}
              {step < last ? (
                <Button onClick={next} disabled={facts === null}>
                  Continuar <ArrowRight aria-hidden />
                </Button>
              ) : (
                canEdit && (
                  <Button size="lg" onClick={() => onCreate(drafts)}>
                    <Sparkles aria-hidden /> Criar meu site
                  </Button>
                )
              )}
            </div>
          </div>
        </div>

        {step < last && (
          <aside className="hidden flex-col items-center gap-2 lg:flex" aria-label="Prévia do site">
            <MiniSite site={previewData(slug, drafts)} width={260} height={520} />
            <p className="text-xs text-muted-foreground">O site vai se formando com as respostas.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

export default GuidedSetup;
