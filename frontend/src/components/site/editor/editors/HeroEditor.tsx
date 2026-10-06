/**
 * HeroEditor — capa: título/subtítulo, 6 paletas prontas, fonte, logo; o resto
 * (gradiente/cor/imagem, tipografia fina, cor do texto, margem) em "Avançado".
 */
import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { TextField } from '@/components/fields';
import { HERO_FONT_SIZES } from '@/constants/heroFonts';
import { HERO_PALETTES, activeHeroPalette, applyHeroPalette, heroForeground } from '../../lib';
import {
  ChoiceField,
  ColorField,
  FieldGroup,
  FontColorField,
  FontSelect,
  ImageField,
  MarginField,
  SIDE_OPTIONS,
  TypographyFields,
  usePatch,
  type SectionEditorProps,
} from '../controls';

export function HeroEditor({ config, onChange, upload }: SectionEditorProps) {
  const patch = usePatch(config, onChange);
  const bgType = String(config.bg_type || 'gradient');
  const active = activeHeroPalette(config);
  const title = String(config.title || '');

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Texto">
        <TextField
          label="Título"
          required
          value={title}
          onChange={(e) => patch({ title: e.target.value })}
          error={!title.trim() && 'A capa precisa de um título.'}
          placeholder="Nome do terreiro"
        />
        <TextField
          label="Subtítulo"
          multiline
          rows={2}
          value={String(config.subtitle || '')}
          onChange={(e) => patch({ subtitle: e.target.value })}
          placeholder="Uma frase de boas-vindas"
        />
      </FieldGroup>

      <FieldGroup title="Cores">
        <div role="radiogroup" aria-label="Paleta de cores" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {HERO_PALETTES.map((p) => {
            const selected = active?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={p.label}
                title={p.label}
                onClick={() => onChange(applyHeroPalette(config, p))}
                className={cn(
                  'relative flex h-12 items-end justify-center rounded-lg border-2 border-transparent p-1 text-[10px] font-semibold text-white shadow-sm transition-transform hover:scale-[1.03] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  selected && 'border-foreground',
                )}
                style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
              >
                {selected && <Check className="absolute top-1 right-1 size-4 drop-shadow" aria-hidden />}
                <span className="truncate drop-shadow">{p.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          A cor do texto é ajustada automaticamente para ter contraste. Outras opções em &quot;Avançado&quot;.
        </p>
      </FieldGroup>

      <FieldGroup title="Fonte">
        <FontSelect value={String(config.font_family || 'system-ui, sans-serif')} onChange={(v) => patch({ font_family: v })} />
      </FieldGroup>

      <FieldGroup title="Logo">
        <ChoiceField
          label="Logo"
          value={String(config.logo_mode || 'none')}
          options={[
            { value: 'none', label: 'Sem logo' },
            { value: 'logo', label: 'Com logo' },
          ]}
          onChange={(v) => patch({ logo_mode: v })}
        />
        {String(config.logo_mode || 'none') === 'logo' && (
          <>
            <ImageField
              label="Imagem do logo"
              hint="Recomendado 200 × 200 px · PNG com transparência · até 5 MB"
              url={config.logo_image_url ? String(config.logo_image_url) : undefined}
              upload={upload}
              onUploaded={(id, url) => patch({ logo_image: id, logo_image_url: url })}
              onRemove={() => patch({ logo_image: undefined, logo_image_url: undefined })}
              previewClassName="object-contain"
            />
            <ChoiceField label="Posição" value={String(config.logo_position || 'left')} options={SIDE_OPTIONS} onChange={(v) => patch({ logo_position: v })} />
            <ChoiceField
              label="Tamanho"
              value={String(config.logo_size || 'md')}
              options={[
                { value: 'xs', label: 'XP' },
                { value: 'sm', label: 'P' },
                { value: 'md', label: 'M' },
                { value: 'lg', label: 'G' },
                { value: 'xl', label: 'XG' },
              ]}
              onChange={(v) => patch({ logo_size: v })}
            />
          </>
        )}
      </FieldGroup>

      <Accordion type="single" collapsible>
        <AccordionItem value="avancado" className="rounded-lg border px-4">
          <AccordionTrigger className="hover:no-underline">Avançado</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-6 pt-2">
            <FieldGroup title="Fundo">
              <ChoiceField
                label="Tipo"
                value={bgType}
                options={[
                  { value: 'gradient', label: 'Gradiente' },
                  { value: 'solid', label: 'Cor sólida' },
                  { value: 'image', label: 'Imagem' },
                ]}
                onChange={(v) => patch({ bg_type: v })}
              />
              {bgType === 'gradient' && (
                <>
                  <ChoiceField
                    label="Direção"
                    value={String(config.gradient_dir || '135deg')}
                    options={[
                      { value: 'to bottom', label: '↓' , title: 'Vertical' },
                      { value: 'to right', label: '→', title: 'Horizontal' },
                      { value: '135deg', label: '↘', title: 'Diagonal' },
                      { value: '45deg', label: '↗', title: 'Diagonal' },
                      { value: '225deg', label: '↙', title: 'Diagonal' },
                      { value: '315deg', label: '↖', title: 'Diagonal' },
                      { value: 'radial', label: '⊙', title: 'Radial' },
                    ]}
                    onChange={(v) => patch({ gradient_dir: v })}
                  />
                  <ColorField label="De" value={String(config.gradient_from || '#6366f1')} onChange={(v) => patch({ gradient_from: v })} />
                  <ColorField label="Para" value={String(config.gradient_to || '#ec4899')} onChange={(v) => patch({ gradient_to: v })} />
                </>
              )}
              {bgType === 'solid' && <ColorField label="Cor" value={String(config.bg_color || '#6366f1')} onChange={(v) => patch({ bg_color: v })} />}
              {bgType === 'image' && (
                <>
                  <ImageField
                    label="Imagem de fundo"
                    hint="Recomendado 1920 × 600 px · JPEG/PNG/WebP · até 5 MB"
                    url={config.bg_image_url ? String(config.bg_image_url) : undefined}
                    upload={upload}
                    onUploaded={(id, url) => patch({ bg_image: id, bg_image_url: url })}
                    onRemove={() => patch({ bg_image: undefined, bg_image_url: undefined })}
                    previewClassName="w-24"
                  />
                  {config.bg_image_url && (
                    <>
                      <PositionSlider label="Enquadramento horizontal" value={Number(config.bg_position_x ?? 50)} onChange={(v) => patch({ bg_position_x: v })} />
                      <PositionSlider label="Enquadramento vertical" value={Number(config.bg_position_y ?? 50)} onChange={(v) => patch({ bg_position_y: v })} />
                    </>
                  )}
                </>
              )}
            </FieldGroup>

            <TypographyFields
              config={config}
              onChange={onChange}
              targets={[{ label: 'Título', sizeKey: 'font_size', sizes: HERO_FONT_SIZES, defaultSize: 48, weightKey: 'font_weight', defaultWeight: 700, sampleScale: 0.38 }]}
            />

            <FieldGroup title="Texto">
              <FontColorField config={config} onChange={onChange} defaultFg="#ffffff" />
              <p className="text-xs text-muted-foreground">
                Cor usada: <code className="font-mono">{heroForeground(config)}</code> (ajustada se faltar contraste).
              </p>
            </FieldGroup>

            <FieldGroup title="Layout">
              <MarginField config={config} onChange={onChange} />
            </FieldGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function PositionSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = React.useId();
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor={id} className="w-28 shrink-0 text-xs text-muted-foreground">
        {label} {value}%
      </Label>
      <Slider id={id} aria-label={label} value={[value]} min={0} max={100} step={1} onValueChange={([v]) => onChange(v)} className="flex-1" />
    </div>
  );
}

export default HeroEditor;
