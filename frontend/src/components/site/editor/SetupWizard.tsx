/**
 * SetupWizard — assistente inicial quando o site não tem seções: busca o que a API
 * já sabe do terreiro (nome, logo e cores do branding; endereço e e-mail da
 * configuração, se o usuário puder vê-la; quantas giras existem) e cria um site
 * pré-preenchido com um clique. Também permite escolher o template ou começar do zero.
 */
import React, { useEffect, useState } from 'react';
import { Building2, CalendarDays, Check, ImageIcon, Loader2, Mail, MapPin, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickForeground } from '@/lib/brand';
import { apiClient } from '@/services/api_client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SectionConfig, SectionType } from '../types';

export interface SectionDraft {
  section_type: SectionType;
  config: SectionConfig;
}

export const SITE_TEMPLATES = [
  { value: 'moderno', label: 'Moderno', description: 'Capa com gradiente e seções arejadas.' },
  { value: 'classico', label: 'Clássico', description: 'Tons sóbrios e tipografia serifada.' },
  { value: 'minimal', label: 'Minimalista', description: 'Fundo claro, poucos elementos.' },
] as const;

interface TenantFacts {
  nome: string | null;
  logoUrl: string | null;
  primary: string;
  secondary: string;
  fontColor: string | null;
  endereco: string | null;
  email: string | null;
  girasCount: number | null;
}

async function loadTenantFacts(): Promise<TenantFacts> {
  const [branding, config, giras] = await Promise.allSettled([
    apiClient.get('/api/v1/admin/tenant/branding'),
    apiClient.get('/api/v1/admin/tenant/config'),
    apiClient.get('/api/v1/admin/giras?limit=50'),
  ]);
  const b = branding.status === 'fulfilled' ? (branding.value.data ?? {}) : {};
  const c = config.status === 'fulfilled' ? (config.value.data ?? {}) : {};
  const g = giras.status === 'fulfilled' && Array.isArray(giras.value.data) ? giras.value.data : null;
  return {
    nome: typeof b.tenant_nome === 'string' && b.tenant_nome ? b.tenant_nome : typeof c.tenant_nome === 'string' ? c.tenant_nome : null,
    logoUrl: typeof b.logo_url === 'string' && b.logo_url ? b.logo_url : typeof c.logo_url === 'string' && c.logo_url ? c.logo_url : null,
    primary: typeof b.primary_color === 'string' && b.primary_color ? b.primary_color : '#4f46e5',
    secondary: typeof b.secondary_color === 'string' && b.secondary_color ? b.secondary_color : '#ec4899',
    fontColor: typeof b.font_color === 'string' ? b.font_color : null,
    endereco: typeof c.endereco === 'string' && c.endereco ? c.endereco : null,
    email: typeof c.reply_to_email === 'string' && c.reply_to_email ? c.reply_to_email : null,
    girasCount: g ? g.length : null,
  };
}

/** Seções iniciais a partir do que a API expõe — nada inventado. */
export function buildStarterSections(facts: TenantFacts, template: string): SectionDraft[] {
  const heroFont = template === 'classico' ? "'Playfair Display', serif" : template === 'minimal' ? "'Inter', sans-serif" : 'system-ui, sans-serif';
  const hero: SectionConfig = {
    title: facts.nome || 'Nosso terreiro',
    subtitle: 'Seja bem-vindo(a). Retire sua senha e participe das nossas giras.',
    bg_type: template === 'minimal' ? 'solid' : 'gradient',
    bg_color: facts.primary,
    gradient_from: facts.primary,
    gradient_to: facts.secondary,
    gradient_dir: '135deg',
    font_family: heroFont,
    font_color: pickForeground(facts.primary, facts.fontColor ?? undefined),
  };
  if (facts.logoUrl) {
    hero.logo_mode = 'logo';
    hero.logo_position = 'left';
    hero.logo_size = 'md';
    hero.logo_image_url = facts.logoUrl;
  }
  const sections: SectionDraft[] = [
    { section_type: 'HERO', config: hero },
    { section_type: 'ABOUT', config: { title: 'Sobre o terreiro', body: '', bg_color: template === 'classico' ? '#faf7f2' : '#ffffff' } },
    { section_type: 'GIRAS_CALENDAR', config: { title: 'Próximas giras', display_mode: 'calendar', calendar_highlight_color: facts.primary } },
    { section_type: 'LOCATION', config: { title: 'Como chegar', ...(facts.endereco ? { address: facts.endereco } : {}) } },
    { section_type: 'CONTACT', config: { title: 'Contato', contact_layout: 'cards', ...(facts.email ? { email: facts.email } : {}) } },
  ];
  return sections;
}

export interface SetupWizardProps {
  template: string;
  canEdit: boolean;
  onCreate: (sections: SectionDraft[], template: string) => void;
  onSkip: () => void;
}

export function SetupWizard({ template: initialTemplate, canEdit, onCreate, onSkip }: SetupWizardProps) {
  const [facts, setFacts] = useState<TenantFacts | null>(null);
  const [template, setTemplate] = useState(initialTemplate || 'moderno');

  useEffect(() => {
    let cancelled = false;
    loadTenantFacts().then((f) => {
      if (!cancelled) setFacts(f);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = [
    { icon: Building2, label: 'Nome do terreiro na capa', value: facts?.nome ?? null, fallback: 'Você preenche depois' },
    { icon: ImageIcon, label: 'Logo na capa', value: facts?.logoUrl ? 'Logo do terreiro' : null, fallback: 'Sem logo cadastrado' },
    { icon: CalendarDays, label: 'Próximas giras', value: facts?.girasCount != null ? `${facts.girasCount} gira(s) cadastrada(s)` : 'Calendário ligado às giras', fallback: '' },
    { icon: MapPin, label: 'Como chegar', value: facts?.endereco ?? null, fallback: 'Endereço para preencher' },
    { icon: Mail, label: 'Contato', value: facts?.email ?? null, fallback: 'WhatsApp, e-mail e Instagram para preencher' },
  ];

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-4 sm:p-8" data-testid="setup-wizard">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-5 text-brand" aria-hidden />
            Vamos montar seu site em um minuto
          </CardTitle>
          <CardDescription>
            Criamos a capa, a agenda de giras, o endereço e o contato com o que já sabemos do seu terreiro. Depois é só ajustar e publicar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ul className="grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2" aria-label="O que será criado">
            {items.map(({ icon: Icon, label, value, fallback }) => (
              <li key={label} className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {facts === null ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" aria-hidden /> Buscando…
                      </span>
                    ) : (
                      value || fallback
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">Estilo do site</legend>
            <div role="radiogroup" aria-label="Template" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {SITE_TEMPLATES.map((t) => {
                const selected = template === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTemplate(t.value)}
                    className={cn(
                      'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      selected ? 'border-primary bg-primary/5' : 'border-border',
                    )}
                  >
                    <span className="flex items-center justify-between text-sm font-semibold">
                      {t.label}
                      {selected && <Check className="size-4 text-brand" aria-hidden />}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onSkip}>
              Começar do zero
            </Button>
            {canEdit && (
              <Button
                size="lg"
                disabled={facts === null}
                onClick={() => facts && onCreate(buildStarterSections(facts, template), template)}
              >
                <Sparkles aria-hidden />
                Criar meu site
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SetupWizard;
