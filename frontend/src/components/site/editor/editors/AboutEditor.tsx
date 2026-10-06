/**
 * AboutEditor — "Sobre o terreiro": título, texto, foto (lado), tipografia e fundo.
 */
import React from 'react';
import { TextField } from '@/components/fields';
import { SECTION_BODY_SIZES, SECTION_TITLE_SIZES } from '@/constants/heroFonts';
import {
  BackgroundFields,
  ChoiceField,
  FieldGroup,
  FontColorField,
  ImageField,
  MarginField,
  SIDE_OPTIONS,
  TypographyFields,
  usePatch,
  type SectionEditorProps,
} from '../controls';

export function AboutEditor({ config, onChange, upload }: SectionEditorProps) {
  const patch = usePatch(config, onChange);
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Conteúdo">
        <TextField label="Título da seção" value={String(config.title || '')} onChange={(e) => patch({ title: e.target.value })} placeholder="Sobre o terreiro" />
        <TextField
          label="Texto"
          multiline
          rows={6}
          value={String(config.body || '')}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder="Conte a história do terreiro, a linha de trabalho e como funciona o atendimento."
        />
      </FieldGroup>

      <FieldGroup title="Foto">
        <ImageField
          label="Imagem"
          hint="JPEG · PNG · WebP · até 5 MB"
          url={config.image_url ? String(config.image_url) : undefined}
          upload={upload}
          onUploaded={(id, url) => patch({ image: id, image_url: url })}
          onRemove={() => patch({ image: undefined, image_url: undefined })}
        />
        <ChoiceField label="Posição da foto" value={String(config.image_side || 'right')} options={SIDE_OPTIONS} onChange={(v) => patch({ image_side: v })} />
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

export default AboutEditor;
