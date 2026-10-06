/**
 * Controles reutilizados pelos editores de seção do "Meu Site": grupo com título,
 * cor, transparência, escolha única (ToggleGroup), tipografia (Selects) e upload de
 * imagem. Todos sobre o kit shadcn — nada de MUI.
 */
import React, { useId, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseColor } from '@/lib/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { HERO_FONTS, HERO_FONT_WEIGHTS } from '@/constants/heroFonts';
import type { SectionConfig } from '../types';

export interface SectionEditorProps {
  config: SectionConfig;
  onChange: (config: SectionConfig) => void;
  /** Upload de imagem (POST /images). Ausente quando o usuário não pode inserir. */
  upload?: (file: File) => Promise<{ id: string; url: string }>;
}

/** Patch parcial da config (mantém o resto). */
export function usePatch(config: SectionConfig, onChange: (c: SectionConfig) => void) {
  return (patch: SectionConfig) => onChange({ ...config, ...patch });
}

// ── Grupo ─────────────────────────────────────────────────────────────────────

export function FieldGroup({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-3 border-0 p-0', className)}>
      <legend className="mb-2 flex w-full items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </legend>
      {children}
    </fieldset>
  );
}

// ── Cor ───────────────────────────────────────────────────────────────────────

export function ColorField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const safe = parseColor(value) ? value : '#000000';
  const shown = text ?? value;

  const commitText = () => {
    if (text !== null) {
      const v = text.trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) onChange(v.toLowerCase());
      setText(null);
    }
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Label htmlFor={id} className="w-28 shrink-0 text-xs text-muted-foreground">
        {label}
      </Label>
      <span className="relative size-9 shrink-0 overflow-hidden rounded-md border border-input shadow-xs" style={{ background: safe }}>
        <input
          id={id}
          type="color"
          value={safe.length === 4 ? `#${safe[1]}${safe[1]}${safe[2]}${safe[2]}${safe[3]}${safe[3]}` : safe}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </span>
      <Input
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => e.key === 'Enter' && commitText()}
        aria-label={`${label} (hexadecimal)`}
        className="h-9 w-28 bg-input-bg font-mono text-xs"
        maxLength={7}
      />
    </div>
  );
}

// ── Transparência ─────────────────────────────────────────────────────────────

export function OpacityField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor={id} className="w-28 shrink-0 text-xs text-muted-foreground">
        Transparência {100 - value}%
      </Label>
      <Slider
        id={id}
        aria-label="Transparência do fundo"
        value={[value]}
        min={0}
        max={100}
        step={5}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
      />
    </div>
  );
}

// ── Escolha única ─────────────────────────────────────────────────────────────

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
        aria-label={label}
        className="flex-wrap"
      >
        {options.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value} disabled={opt.disabled} title={opt.title} className="text-xs">
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export const MARGIN_OPTIONS: ChoiceOption[] = [
  { value: 'contained', label: 'Padrão' },
  { value: 'medium', label: 'Média' },
  { value: 'wide', label: 'Ampla' },
];

export function MarginField({ config, onChange }: SectionEditorProps) {
  const patch = usePatch(config, onChange);
  return (
    <ChoiceField
      label="Margem lateral"
      value={String(config.margin_preset || 'contained')}
      options={MARGIN_OPTIONS}
      onChange={(v) => patch({ margin_preset: v })}
    />
  );
}

export const SIDE_OPTIONS: ChoiceOption[] = [
  { value: 'left', label: 'Esquerda' },
  { value: 'right', label: 'Direita' },
];

// ── Tipografia ────────────────────────────────────────────────────────────────

function LabeledSelect({
  label,
  value,
  onChange,
  children,
  renderValue,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  renderValue?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full bg-input-bg">
          <SelectValue>{renderValue}</SelectValue>
        </SelectTrigger>
        <SelectContent className="z-[1400]">{children}</SelectContent>
      </Select>
    </div>
  );
}

export function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const entry = HERO_FONTS.find((f) => f.value === value);
  return (
    <LabeledSelect label="Fonte" value={value} onChange={onChange} renderValue={<span style={{ fontFamily: value }}>{entry?.label ?? value}</span>}>
      {HERO_FONTS.map((f) => (
        <SelectItem key={f.value} value={f.value}>
          <span style={{ fontFamily: f.value }}>{f.label}</span>
        </SelectItem>
      ))}
    </LabeledSelect>
  );
}

export interface TypographyTarget {
  /** Rótulo do grupo ("Título", "Texto"). */
  label: string;
  sizeKey: string;
  sizes: { label: string; value: number }[];
  defaultSize: number;
  weightKey?: string;
  defaultWeight?: number;
  /** Fator para o "Aa" de amostra. */
  sampleScale?: number;
}

export function TypographyFields({
  config,
  onChange,
  targets,
  withStyle = true,
}: SectionEditorProps & { targets: TypographyTarget[]; withStyle?: boolean }) {
  const patch = usePatch(config, onChange);
  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  const fontStyle = String(config.font_style || 'normal');

  return (
    <FieldGroup title="Tipografia">
      <FontSelect value={fontFamily} onChange={(v) => patch({ font_family: v })} />
      {targets.map((t) => {
        const size = Number(config[t.sizeKey] || t.defaultSize);
        const weight = t.weightKey ? Number(config[t.weightKey] || t.defaultWeight || 400) : t.defaultWeight ?? 400;
        const scale = t.sampleScale ?? 0.5;
        return (
          <div key={t.sizeKey} className="grid grid-cols-2 gap-2">
            <LabeledSelect
              label={`${t.label} · tamanho`}
              value={String(size)}
              onChange={(v) => patch({ [t.sizeKey]: Number(v) })}
              renderValue={
                <span className="inline-flex items-center gap-2">
                  <span style={{ fontFamily, fontWeight: weight, fontStyle, fontSize: Math.max(10, Math.round(size * scale)), lineHeight: 1 }}>Aa</span>
                  <span className="text-xs text-muted-foreground">{t.sizes.find((s) => s.value === size)?.label ?? `${size}px`}</span>
                </span>
              }
            >
              {t.sizes.map((s) => (
                <SelectItem key={s.value} value={String(s.value)}>
                  <span className="inline-flex items-center gap-3">
                    <span className="inline-flex w-8 justify-center" style={{ fontFamily, fontWeight: weight, fontStyle, fontSize: Math.max(10, Math.round(s.value * scale)), lineHeight: 1 }}>
                      Aa
                    </span>
                    {s.label}
                  </span>
                </SelectItem>
              ))}
            </LabeledSelect>
            {t.weightKey && (
              <LabeledSelect
                label={`${t.label} · peso`}
                value={String(weight)}
                onChange={(v) => patch({ [t.weightKey as string]: Number(v) })}
                renderValue={<span style={{ fontFamily, fontWeight: weight }}>{HERO_FONT_WEIGHTS.find((w) => w.value === weight)?.label ?? weight}</span>}
              >
                {HERO_FONT_WEIGHTS.map((w) => (
                  <SelectItem key={w.value} value={String(w.value)}>
                    <span style={{ fontFamily, fontWeight: w.value }}>{w.label}</span>
                  </SelectItem>
                ))}
              </LabeledSelect>
            )}
          </div>
        );
      })}
      {withStyle && (
        <ChoiceField
          label="Estilo"
          value={fontStyle}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'italic', label: <em>Itálico</em> },
          ]}
          onChange={(v) => patch({ font_style: v })}
        />
      )}
    </FieldGroup>
  );
}

// ── Fundo (cor + transparência) ───────────────────────────────────────────────

export function BackgroundFields({ config, onChange, defaultBg }: SectionEditorProps & { defaultBg: string }) {
  const patch = usePatch(config, onChange);
  return (
    <FieldGroup title="Fundo">
      <ColorField label="Cor do fundo" value={String(config.bg_color || defaultBg)} onChange={(v) => patch({ bg_color: v })} />
      <OpacityField value={Number(config.bg_opacity ?? 100)} onChange={(v) => patch({ bg_opacity: v })} />
    </FieldGroup>
  );
}

export function FontColorField({ config, onChange, defaultFg = '#111111' }: SectionEditorProps & { defaultFg?: string }) {
  const patch = usePatch(config, onChange);
  return <ColorField label="Cor do texto" value={String(config.font_color || defaultFg)} onChange={(v) => patch({ font_color: v })} />;
}

// ── Upload de imagem ──────────────────────────────────────────────────────────

export function ImageField({
  label,
  hint,
  url,
  onUploaded,
  onRemove,
  upload,
  previewClassName,
}: {
  label: string;
  hint?: string;
  url?: string;
  onUploaded: (id: string, url: string) => void;
  onRemove: () => void;
  upload?: (file: File) => Promise<{ id: string; url: string }>;
  previewClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !upload) return;
    setBusy(true);
    setError(null);
    try {
      const res = await upload(file);
      onUploaded(res.id, res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar a imagem.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {url && (
          // Imagem enviada pelo terreiro, servida pela nossa API — não passa pelo otimizador.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className={cn('size-14 rounded-md border border-border bg-muted object-cover', previewClassName)} />
        )}
        {upload && (
          <>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFile} aria-label={label} />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
              {busy ? 'Enviando…' : url ? 'Trocar imagem' : 'Escolher imagem'}
            </Button>
          </>
        )}
        {url && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRemove}>
            <Trash2 aria-hidden />
            Remover
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
