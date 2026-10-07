/**
 * V-05 — "Veja por dentro": telas reais do sistema (terreiro de demonstração, dados fictícios).
 * Abas com a tela grande ao lado da legenda; clicar na tela abre ampliada (Dialog do kit).
 */
import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Reveal } from '@/components/landing/Reveal';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { ScreenShot } from '@/components/landing/ScreenShot';
import { SCREENS, SCREEN_TOUR, type ScreenKey } from '@/constants/landingScreens';

export function ScreensCarousel() {
  const [active, setActive] = useState<ScreenKey>(SCREEN_TOUR[0]);
  const [zoom, setZoom] = useState(false);
  const s = SCREENS[active];

  return (
    <section id="telas" aria-labelledby="telas-title" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="telas-title" eyebrow="Veja por dentro" title="As telas de verdade, do celular à TV do salão">
          Imagens do sistema funcionando num terreiro de demonstração.
        </SectionHeading>

        <Reveal className="mt-12">
          <div role="tablist" aria-label="Telas do GiraHub" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:justify-center md:px-0">
            {SCREEN_TOUR.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`tela-tab-${key}`}
                aria-selected={active === key}
                aria-controls="tela-painel"
                onClick={() => setActive(key)}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold outline-none transition focus-visible:ring-[3px] focus-visible:ring-ouro-300',
                  active === key
                    ? 'border-barro-600 bg-barro-600 text-white'
                    : 'border-areia-300 bg-white text-tinta-suave hover:border-barro-600 hover:text-barro-700',
                )}
              >
                {SCREENS[key].title}
              </button>
            ))}
          </div>

          <div
            id="tela-painel"
            role="tabpanel"
            aria-labelledby={`tela-tab-${active}`}
            className="mt-8 grid items-center gap-8 md:grid-cols-[1fr_2fr]"
          >
            <div className="order-last md:order-first">
              <h3 className="font-display text-2xl font-bold text-tinta">{s.title}</h3>
              <p className="mt-2 text-lg text-tinta-suave">{s.caption}</p>
            </div>
            <button
              type="button"
              onClick={() => setZoom(true)}
              aria-label={`Ampliar a tela: ${s.title}`}
              className="group relative block w-full cursor-zoom-in rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ouro-300"
            >
              <ScreenShot name={active} className={s.device === 'mobile' ? 'max-w-[15rem]' : undefined} />
              <span className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-cafe-950/80 px-3 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <Maximize2 className="size-3.5" aria-hidden /> Ampliar
              </span>
            </button>
          </div>
        </Reveal>
      </div>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className={cn('border-areia-200 bg-areia-50 p-4', s.device === 'mobile' ? 'sm:max-w-sm' : 'sm:max-w-5xl')}>
          <DialogTitle className="text-tinta">{s.title}</DialogTitle>
          <DialogDescription className="text-tinta-suave">{s.caption}</DialogDescription>
          <ScreenShot name={active} sizes="90vw" />
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default ScreensCarousel;
