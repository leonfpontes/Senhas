/**
 * SectionEditor — painel de edição da seção selecionada: cabeçalho, erros inline
 * e o editor do tipo.
 */
import React from 'react';
import { AlertCircle, EyeOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { SectionConfig, SiteSection } from '../types';
import { isSectionHidden, sectionLabel } from '../lib';
import { SectionIcon } from './sectionIcons';
import type { SectionEditorProps } from './controls';
import { HeroEditor } from './editors/HeroEditor';
import { AboutEditor } from './editors/AboutEditor';
import { VideoEditor } from './editors/VideoEditor';
import { GirasCalendarEditor } from './editors/GirasCalendarEditor';
import { LocationEditor } from './editors/LocationEditor';
import { ContactEditor } from './editors/ContactEditor';
import { SponsorEditor } from './editors/SponsorEditor';
import { CustomTextEditor } from './editors/CustomTextEditor';

const EDITORS: Record<string, React.ComponentType<SectionEditorProps>> = {
  HERO: HeroEditor,
  ABOUT: AboutEditor,
  VIDEO_EMBED: VideoEditor,
  GIRAS_CALENDAR: GirasCalendarEditor,
  LOCATION: LocationEditor,
  CONTACT: ContactEditor,
  SPONSOR: SponsorEditor,
  CUSTOM_TEXT: CustomTextEditor,
};

export interface SectionEditorPanelProps {
  section: SiteSection;
  errors: string[];
  onChange: (config: SectionConfig) => void;
  upload?: (file: File) => Promise<{ id: string; url: string }>;
  /** Oculta o cabeçalho (quando o Sheet já mostra o título). */
  hideHeader?: boolean;
}

export function SectionEditor({ section, errors, onChange, upload, hideHeader }: SectionEditorPanelProps) {
  const Editor = EDITORS[section.section_type];
  const label = sectionLabel(section.section_type);
  const hidden = isSectionHidden(section);

  return (
    <div className="flex flex-col gap-5 p-4 @min-[640px]:p-6" data-testid="section-editor">
      {!hideHeader && (
        <header className="flex flex-wrap items-center gap-2">
          <SectionIcon type={section.section_type} className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{label}</h2>
          {hidden && (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <EyeOff /> Desligada
            </Badge>
          )}
        </header>
      )}
      {errors.length > 0 && (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden />
          <AlertTitle>Falta corrigir</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {Editor ? (
        <Editor config={section.config} onChange={onChange} upload={upload} />
      ) : (
        <Alert variant="warning">
          <AlertDescription>Tipo de seção desconhecido: {section.section_type}.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default SectionEditor;
