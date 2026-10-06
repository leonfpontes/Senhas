/**
 * VideoEditor — vídeo do YouTube: link (validado inline), legenda, layout, texto lateral.
 */
import React from 'react';
import { TextField } from '@/components/fields';
import { SECTION_TITLE_SIZES } from '@/constants/heroFonts';
import { validateSection } from '../../lib';
import {
  BackgroundFields,
  ChoiceField,
  FieldGroup,
  FontColorField,
  MarginField,
  SIDE_OPTIONS,
  TypographyFields,
  usePatch,
  type SectionEditorProps,
} from '../controls';

export function VideoEditor({ config, onChange }: SectionEditorProps) {
  const patch = usePatch(config, onChange);
  const layout = String(config.layout || 'video-only');
  const urlError = validateSection({ section_type: 'VIDEO_EMBED', config })[0];

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Vídeo">
        <TextField
          label="Link do YouTube"
          value={String(config.youtube_url || '')}
          onChange={(e) => patch({ youtube_url: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=…"
          error={urlError}
          helperText={urlError ? undefined : 'Cole o link do vídeo. O player é gerado automaticamente.'}
          inputMode="url"
        />
        <TextField label="Título / legenda" value={String(config.caption || '')} onChange={(e) => patch({ caption: e.target.value })} />
      </FieldGroup>

      <FieldGroup title="Layout">
        <ChoiceField
          label="Exibir"
          value={layout}
          options={[
            { value: 'video-only', label: 'Só o vídeo' },
            { value: 'side-by-side', label: 'Vídeo + texto' },
          ]}
          onChange={(v) => patch({ layout: v })}
        />
        {layout === 'side-by-side' && (
          <>
            <ChoiceField label="Vídeo à" value={String(config.video_side || 'right')} options={SIDE_OPTIONS} onChange={(v) => patch({ video_side: v })} />
            <TextField
              label="Texto lateral"
              multiline
              rows={4}
              value={String(config.side_text || '')}
              onChange={(e) => patch({ side_text: e.target.value })}
              helperText="Aparece ao lado do vídeo no computador e abaixo dele no celular."
            />
          </>
        )}
        <MarginField config={config} onChange={onChange} />
      </FieldGroup>

      <TypographyFields
        config={config}
        onChange={onChange}
        targets={[{ label: 'Título', sizeKey: 'caption_font_size', sizes: SECTION_TITLE_SIZES, defaultSize: 24, weightKey: 'caption_font_weight', defaultWeight: 600 }]}
      />
      <FieldGroup title="Texto">
        <FontColorField config={config} onChange={onChange} />
      </FieldGroup>
      <BackgroundFields config={config} onChange={onChange} defaultBg="#f5f5f5" />
    </div>
  );
}

export default VideoEditor;
