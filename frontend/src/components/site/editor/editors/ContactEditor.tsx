/**
 * ContactEditor — WhatsApp, e-mail, Instagram; layout (cartões/lista/botões), cor e fundo.
 */
import React from 'react';
import { TextField } from '@/components/fields';
import { SECTION_TITLE_SIZES } from '@/constants/heroFonts';
import { BackgroundFields, ChoiceField, FieldGroup, FontColorField, MarginField, TypographyFields, usePatch, type SectionEditorProps } from '../controls';
import { shows } from '../../elements';

export function ContactEditor({ config, onChange }: SectionEditorProps) {
  const patch = usePatch(config, onChange);
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Conteúdo">
        {shows(config, 'show_title') && <TextField label="Título da seção" value={String(config.title || 'Contato')} onChange={(e) => patch({ title: e.target.value })} />}
        {shows(config, 'show_whatsapp') && <TextField label="WhatsApp / telefone" value={String(config.phone || '')} onChange={(e) => patch({ phone: e.target.value })} placeholder="(11) 99999-9999" inputMode="tel" />}
        {shows(config, 'show_email') && <TextField label="E-mail de contato" type="email" value={String(config.email || '')} onChange={(e) => patch({ email: e.target.value })} placeholder="contato@terreiro.com" />}
        {shows(config, 'show_instagram') && <TextField label="Instagram (sem @)" value={String(config.instagram || '')} onChange={(e) => patch({ instagram: e.target.value.replace(/^@/, '') })} placeholder="nomedoterreiro" />}
      </FieldGroup>

      <FieldGroup title="Layout">
        <ChoiceField
          label="Exibir como"
          value={String(config.contact_layout || 'cards')}
          options={[
            { value: 'cards', label: 'Cartões' },
            { value: 'list', label: 'Lista' },
            { value: 'buttons', label: 'Botões' },
          ]}
          onChange={(v) => patch({ contact_layout: v })}
        />
        <MarginField config={config} onChange={onChange} />
      </FieldGroup>

      <TypographyFields
        config={config}
        onChange={onChange}
        targets={[{ label: 'Título', sizeKey: 'title_font_size', sizes: SECTION_TITLE_SIZES, defaultSize: 30, weightKey: 'title_font_weight', defaultWeight: 700 }]}
      />
      <FieldGroup title="Texto">
        <FontColorField config={config} onChange={onChange} />
      </FieldGroup>
      <BackgroundFields config={config} onChange={onChange} defaultBg="#ffffff" />
    </div>
  );
}

export default ContactEditor;
