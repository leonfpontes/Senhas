/**
 * PublicSite — o site do terreiro montado a partir das seções. Usado pela página
 * pública (`mode="public"`, com a barra fixa "Retirar senha" no celular) e pela
 * prévia do editor (`mode="preview"`, dentro de um quadro de 375/1280px).
 *
 * O wrapper é um `@container`: as seções respondem à largura dele, não à da
 * janela — por isso a mesma seção mostra o layout de celular dentro da prévia.
 * A barra fixa fica FORA do container (containment de layout tornaria o
 * `position: fixed` relativo ao wrapper).
 */
import React from 'react';
import { Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickForeground } from '@/lib/brand';
import { buttonVariants } from '@/components/ui/button';
import type { PublicSiteData, RenderMode, SectionContext } from './types';
import { isSectionHidden, senhaUrl, siteBrandColor, visibleSections } from './lib';
import { renderSection } from './sections';
import { EditableFrame, type SiteEditing } from './EditableFrame';
import { MobileCtaBar } from './MobileCtaBar';
import { mobileCta } from './elements';
import { SiteFooter } from './SiteFooter';

export interface PublicSiteProps {
  site: PublicSiteData;
  mode: RenderMode;
  /** Classe do wrapper (`@container`). */
  className?: string;
  /**
   * Edição direto na prévia (beta "Novo construtor do site"). Mostra também as seções
   * ocultas (esmaecidas), para a casa poder religá-las.
   */
  editing?: SiteEditing;
}

export function PublicSite({ site, mode, className, editing }: PublicSiteProps) {
  const sections = editing ? [...site.sections].sort((a, b) => a.order_index - b.order_index) : visibleSections(site.sections);
  const brandColor = siteBrandColor(site.sections);
  const cta = mobileCta(visibleSections(site.sections));
  const isPreview = mode === 'preview';
  const ctx: SectionContext = { mode, slug: site.slug, giras: site.upcoming_giras, brandColor };

  return (
    <>
      <div
        data-slot="public-site"
        className={cn('@container flex min-h-screen flex-col bg-background text-foreground', mode === 'public' && cta.show && 'pb-20 md:pb-0', className)}
      >
        <div className="flex-1">
          {sections.length > 0 && editing ? (
            <>
              {sections.map((section, i) => (
                <React.Fragment key={section.id}>
                  <EditableFrame
                    id={section.id}
                    type={section.section_type}
                    index={i}
                    total={sections.length}
                    hidden={isSectionHidden(section)}
                    editing={editing}
                  >
                    {renderSection(section, {
                      ...ctx,
                      edit: editing.canEdit
                        ? { selected: editing.selectedId === section.id, patch: (p) => editing.onPatch(section.id, p) }
                        : undefined,
                    })}
                  </EditableFrame>
                </React.Fragment>
              ))}
            </>
          ) : sections.length > 0 ? (
            sections.map((section) => renderSection(section, ctx))
          ) : (
            <section
              role="status"
              className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center"
              style={{ '--brand': brandColor, '--brand-fg': pickForeground(brandColor) } as React.CSSProperties}
            >
              <h1 className="text-2xl font-bold">
                {isPreview ? 'Seu site ainda não tem seções' : 'Este terreiro ainda está montando o site'}
              </h1>
              <p className="max-w-md text-muted-foreground">
                {isPreview
                  ? 'Adicione a primeira seção pela galeria para ver a prévia aqui.'
                  : 'Enquanto isso, você já pode retirar a sua senha para a próxima gira.'}
              </p>
              {!isPreview && (
                <a
                  href={senhaUrl(site.slug)}
                  className={cn(buttonVariants({ size: 'touch' }), 'no-underline', 'bg-[var(--brand)] text-[var(--brand-fg)] hover:bg-[var(--brand)] hover:opacity-90')}
                >
                  <Ticket aria-hidden />
                  Retirar senha
                </a>
              )}
            </section>
          )}
        </div>
        <SiteFooter inert={isPreview} />
      </div>
      {mode === 'public' && cta.show && <MobileCtaBar slug={site.slug} brandColor={brandColor} variant="fixed" label={cta.label} />}
    </>
  );
}

export default PublicSite;
