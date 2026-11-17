/**
 * StudioStart — primeira tela do estúdio quando o site ainda não tem seções (beta "Novo
 * construtor do site"). Três caminhos, como no Wix e no Squarespace:
 *   1. responder algumas perguntas (o site sai montado com as respostas);
 *   2. escolher um modelo pronto, vendo a prévia antes;
 *   3. começar só com a capa.
 * Nada vem escolhido: a casa decide clicando.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, FilePlus2, Monitor, Smartphone, Sparkles, Tablet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PublicSiteData } from '../../types';
import { PublicSite } from '../../PublicSite';
import { loadTenantFacts, type SectionDraft, type TenantFacts } from '../SetupWizard';
import { GuidedSetup } from '../GuidedSetup';
import { STUDIO_TEMPLATES, blankSite, buildTemplate, type StudioTemplate } from './templates';
import { DEVICE_WIDTH, ScaledFrame, useElementSize, type StudioDevice } from './StudioCanvas';

function asSite(slug: string, drafts: SectionDraft[]): PublicSiteData {
  return {
    id: 'modelo',
    slug,
    status: 'DRAFT',
    template: 'moderno',
    meta_title: null,
    meta_description: null,
    sections: drafts.map((d, i) => ({ id: `m-${i}`, section_type: d.section_type, order_index: i, config: d.config })),
    upcoming_giras: [],
  };
}

/** O site reduzido para caber num cartão (só para olhar). */
export function SiteThumb({ site, frame = 1280, width, height, className }: { site: PublicSiteData; frame?: number; width: number; height: number; className?: string }) {
  const scale = width / frame;
  return (
    <div aria-hidden className={cn('pointer-events-none relative overflow-hidden bg-background', className)} style={{ width, height }}>
      <div style={{ width: frame, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <PublicSite site={site} mode="preview" className="min-h-0" />
      </div>
    </div>
  );
}

export interface StudioStartProps {
  slug: string;
  canEdit: boolean;
  onCreate: (drafts: SectionDraft[]) => void;
}

export function StudioStart({ slug, canEdit, onCreate }: StudioStartProps) {
  const [facts, setFacts] = useState<TenantFacts | null>(null);
  const [mode, setMode] = useState<'escolha' | 'perguntas'>('escolha');
  const [previewing, setPreviewing] = useState<StudioTemplate | null>(null);
  const [device, setDevice] = useState<StudioDevice>('desktop');

  useEffect(() => {
    let cancelled = false;
    loadTenantFacts().then((f) => {
      if (!cancelled) setFacts(f);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sites = useMemo(() => Object.fromEntries(STUDIO_TEMPLATES.map((t) => [t.id, asSite(slug, buildTemplate(t, facts))])), [slug, facts]);

  if (mode === 'perguntas') {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pt-4">
          <Button variant="ghost" size="sm" onClick={() => setMode('escolha')}>
            <ArrowLeft aria-hidden /> Outras formas de começar
          </Button>
        </div>
        <GuidedSetup slug={slug} canEdit={canEdit} onCreate={onCreate} onSkip={() => setMode('escolha')} />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-areia-50 dark:bg-muted/40" data-testid="studio-start">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex max-w-2xl flex-col gap-2">
          <h1 className="font-display text-3xl leading-tight tracking-[-0.02em] sm:text-4xl">Vamos montar o site da casa</h1>
          <p className="text-muted-foreground">
            Escolha como começar. Tudo pode ser mudado depois, e nada vai para o ar antes de você publicar.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setMode('perguntas')}
            className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-xs transition-[border-color,box-shadow] hover:border-brand hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Sparkles aria-hidden />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-lg font-semibold">Responder algumas perguntas</span>
              <span className="text-sm text-muted-foreground">
                Nome, tradição, rotina e redes. O site sai montado com as suas respostas, em uns 2 minutos.
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onCreate(blankSite(facts))}
            className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-xs transition-[border-color,box-shadow] hover:border-brand hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
              <FilePlus2 aria-hidden />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-lg font-semibold">Começar do zero</span>
              <span className="text-sm text-muted-foreground">Só a capa com o nome da casa. Você acrescenta as seções que quiser.</span>
            </span>
          </button>
        </div>

        <section className="flex flex-col gap-4" aria-labelledby="modelos-titulo">
          <div>
            <h2 id="modelos-titulo" className="text-xl font-semibold">
              Ou parta de um modelo
            </h2>
            <p className="text-sm text-muted-foreground">Veja a prévia de cada um. O modelo usa o nome, a logo e o endereço que a casa já tem no GiraHub.</p>
          </div>
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4" aria-label="Modelos">
            {STUDIO_TEMPLATES.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setPreviewing(t)}
                  aria-label={`Ver o modelo ${t.label}`}
                  className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-xs transition-[border-color,box-shadow] hover:border-brand hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="block overflow-hidden border-b border-border bg-muted">
                    <SiteThumb site={sites[t.id]} width={320} height={200} className="w-full transition-transform duration-300 group-hover:scale-[1.02]" />
                  </span>
                  <span className="flex flex-1 flex-col gap-1 p-4">
                    <span className="font-semibold">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{t.description}</span>
                    <span className="mt-2 text-[11px] text-muted-foreground">{t.highlights.join(' · ')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Dialog open={previewing !== null} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1200px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
          {previewing && (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 pr-12">
                <div className="min-w-0 flex-1">
                  <DialogTitle>Modelo {previewing.label}</DialogTitle>
                  <DialogDescription className="text-xs">{previewing.description}</DialogDescription>
                </div>
                <ToggleGroup type="single" variant="outline" size="sm" value={device} onValueChange={(v) => v && setDevice(v as StudioDevice)} aria-label="Tamanho da prévia">
                  <ToggleGroupItem value="desktop" aria-label="Computador">
                    <Monitor />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="tablet" aria-label="Tablet">
                    <Tablet />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="mobile" aria-label="Celular">
                    <Smartphone />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <TemplateFrame site={sites[previewing.id]} device={device} />
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
                <Button variant="outline" onClick={() => setPreviewing(null)}>
                  Ver outros modelos
                </Button>
                <Button
                  disabled={!canEdit}
                  onClick={() => {
                    onCreate(buildTemplate(previewing, facts));
                    setPreviewing(null);
                  }}
                >
                  <Check aria-hidden /> Usar este modelo
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Prévia do modelo no tamanho do aparelho escolhido, com rolagem. */
function TemplateFrame({ site, device }: { site: PublicSiteData; device: StudioDevice }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const frame = DEVICE_WIDTH[device];
  const scale = size.width > 0 ? Math.min(1, (size.width - 32) / frame) : 1;
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto bg-muted p-4">
      <div className="mx-auto w-fit overflow-hidden rounded-lg border border-border bg-background shadow-md">
        <ScaledFrame width={frame} scale={scale}>
          <PublicSite site={site} mode="preview" className="min-h-0" />
        </ScaledFrame>
      </div>
    </div>
  );
}

export default StudioStart;
