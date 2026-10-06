/**
 * GirasCalendarEditor — "Próximas giras": título, modo de exibição no computador,
 * botões de senha, cores do calendário e dos cartões, tipografia e fundo.
 */
import React, { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TextField } from '@/components/fields';
import { SECTION_BODY_SIZES, SECTION_TITLE_SIZES } from '@/constants/heroFonts';
import {
  BackgroundFields,
  ChoiceField,
  ColorField,
  FieldGroup,
  FontColorField,
  MarginField,
  TypographyFields,
  usePatch,
  type SectionEditorProps,
} from '../controls';

function SwitchRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function GirasCalendarEditor({ config, onChange }: SectionEditorProps) {
  const patch = usePatch(config, onChange);
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Conteúdo">
        <TextField label="Título da seção" value={String(config.title || 'Próximas giras')} onChange={(e) => patch({ title: e.target.value })} />
        <ChoiceField
          label="No computador"
          value={String(config.display_mode || 'calendar')}
          options={[
            { value: 'calendar', label: 'Calendário' },
            { value: 'list', label: 'Lista' },
            { value: 'card-grid', label: 'Grade' },
            { value: 'card-carousel', label: 'Carrossel' },
          ]}
          onChange={(v) => patch({ display_mode: v })}
        />
        <p className="text-xs text-muted-foreground">No celular as giras aparecem sempre em lista, com a próxima em destaque.</p>
      </FieldGroup>

      <FieldGroup title="Botões de senha">
        <SwitchRow label="Mostrar &quot;Retire sua senha&quot;" checked={config.show_ticket_button !== false} onCheckedChange={(v) => patch({ show_ticket_button: v })} />
        <SwitchRow label="Mostrar &quot;Senha de associado&quot;" checked={config.show_sponsor_button !== false} onCheckedChange={(v) => patch({ show_sponsor_button: v })} />
      </FieldGroup>

      <FieldGroup title="Cores">
        <ColorField label="Destaque" value={String(config.calendar_highlight_color || '#6366f1')} onChange={(v) => patch({ calendar_highlight_color: v })} />
        <ColorField label="Fundo do calendário" value={String(config.calendar_bg_color || '#f8f8f8')} onChange={(v) => patch({ calendar_bg_color: v })} />
        <ColorField label="Texto do calendário" value={String(config.calendar_text_color || '#111111')} onChange={(v) => patch({ calendar_text_color: v })} />
        <ColorField label="Fundo dos cartões" value={String(config.card_bg_color || '#ffffff')} onChange={(v) => patch({ card_bg_color: v })} />
        <FontColorField config={config} onChange={onChange} />
      </FieldGroup>

      <FieldGroup title="Layout">
        <MarginField config={config} onChange={onChange} />
      </FieldGroup>

      <TypographyFields
        config={config}
        onChange={onChange}
        targets={[
          { label: 'Título', sizeKey: 'title_font_size', sizes: SECTION_TITLE_SIZES, defaultSize: 20, weightKey: 'title_font_weight', defaultWeight: 700 },
          { label: 'Texto', sizeKey: 'body_font_size', sizes: SECTION_BODY_SIZES, defaultSize: 14, defaultWeight: 400, sampleScale: 0.7 },
        ]}
      />
      <BackgroundFields config={config} onChange={onChange} defaultBg="#ffffff" />
    </div>
  );
}

export default GirasCalendarEditor;
