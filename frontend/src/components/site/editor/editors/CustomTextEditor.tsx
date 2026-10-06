/**
 * CustomTextEditor — "Texto livre": título, texto, margem, tipografia, cor e fundo.
 */
import React from 'react';
import { TextField } from '@/components/fields';
import { SECTION_BODY_SIZES, SECTION_TITLE_SIZES } from '@/constants/heroFonts';
import { BackgroundFields, FieldGroup, FontColorField, MarginField, TypographyFields, usePatch, type SectionEditorProps } from '../controls';

export function CustomTextEditor({ config, onChange }: SectionEditorProps) {
  const patch = usePatch(config, onChange);
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Conteúdo">
        <TextField label="Título" value={String(config.title || '')} onChange={(e) => patch({ title: e.target.value })} />
        <TextField label="Texto" multiline rows={6} value={String(config.body || '')} onChange={(e) => patch({ body: e.target.value })} />
      </FieldGroup>
      <FieldGroup title="Layout">
        <MarginField config={config} onChange={onChange} />
      </FieldGroup>
      <TypographyFields
        config={config}
        onChange={onChange}
        targets={[
          { label: 'Título', sizeKey: 'title_font_size', sizes: SECTION_TITLE_SIZES, defaultSize: 28, weightKey: 'title_font_weight', defaultWeight: 700 },
          { label: 'Texto', sizeKey: 'body_font_size', sizes: SECTION_BODY_SIZES, defaultSize: 16, weightKey: 'body_font_weight', defaultWeight: 400, sampleScale: 0.7 },
        ]}
      />
      <FieldGroup title="Texto">
        <FontColorField config={config} onChange={onChange} />
      </FieldGroup>
      <BackgroundFields config={config} onChange={onChange} defaultBg="#ffffff" />
    </div>
  );
}

export default CustomTextEditor;
