/**
 * Editores das seções novas (beta "Novo construtor do site"): Fotos, Linhas de trabalho,
 * Rotina, Perguntas frequentes, Redes sociais e Como ajudar a casa. Os textos também se
 * editam clicando direto na prévia; aqui ficam listas, layout, fotos e aparência.
 */
import React from 'react';
import { TextField } from '@/components/fields';
import { BackgroundFields, ChoiceField, FieldGroup, FontColorField, ImageField, MarginField, usePatch, type ChoiceOption, type SectionEditorProps } from '../controls';
import { shows } from '../../elements';
import { ListField } from '../ListField';

type Item = Record<string, unknown>;
const itemsOf = (v: unknown): Item[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Item[]) : []);

function Aparencia({ config, onChange }: SectionEditorProps) {
  return (
    <>
      <FieldGroup title="Espaço">
        <MarginField config={config} onChange={onChange} />
      </FieldGroup>
      <FieldGroup title="Texto">
        <FontColorField config={config} onChange={onChange} />
      </FieldGroup>
      <BackgroundFields config={config} onChange={onChange} defaultBg="#ffffff" />
    </>
  );
}

function Titulo({ config, onChange, placeholder, intro }: SectionEditorProps & { placeholder: string; intro?: string }) {
  const patch = usePatch(config, onChange);
  return (
    <FieldGroup title="Conteúdo">
      {shows(config, 'show_title') && <TextField label="Título da seção" value={String(config.title || '')} onChange={(e) => patch({ title: e.target.value })} placeholder={placeholder} />}
      {intro && shows(config, 'show_intro') && <TextField label="Introdução (opcional)" multiline rows={2} value={String(config.intro || '')} onChange={(e) => patch({ intro: e.target.value })} placeholder={intro} />}
    </FieldGroup>
  );
}

const GALLERY_LAYOUTS: ChoiceOption[] = [
  { value: 'grade', label: 'Grade' },
  { value: 'mosaico', label: 'Mosaico' },
  { value: 'faixa', label: 'Faixa' },
];

export function GalleryEditor(props: SectionEditorProps) {
  const { config, onChange, upload } = props;
  const patch = usePatch(config, onChange);
  const fotos = itemsOf(config.items);
  return (
    <div className="flex flex-col gap-6">
      <Titulo {...props} placeholder="Fotos da casa" intro="Uma frase sobre as fotos" />
      <FieldGroup title="Fotos">
        {fotos.map((f, i) => (
          <div key={String(f.id || i)} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <ImageField
              label={`Foto ${i + 1}`}
              url={f.url ? String(f.url) : undefined}
              upload={upload}
              onUploaded={(id, url) => patch({ items: fotos.map((x, j) => (j === i ? { ...x, id, url } : x)) })}
              onRemove={() => patch({ items: fotos.filter((_, j) => j !== i) })}
            />
            {shows(config, 'show_captions') && <TextField label="Legenda (opcional)" value={String(f.legenda || '')} onChange={(e) => patch({ items: fotos.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)) })} />}
          </div>
        ))}
        {fotos.length < 24 && (
          <ImageField label="Adicionar foto" hint="JPEG · PNG · WebP · até 5 MB" upload={upload} onUploaded={(id, url) => patch({ items: [...fotos, { id, url, legenda: '' }] })} onRemove={() => undefined} />
        )}
        <ChoiceField label="Layout" value={String(config.layout || 'grade')} options={GALLERY_LAYOUTS} onChange={(v) => patch({ layout: v })} />
      </FieldGroup>
      <Aparencia {...props} />
    </div>
  );
}

export function LinhasEditor(props: SectionEditorProps) {
  const { config, onChange } = props;
  const patch = usePatch(config, onChange);
  return (
    <div className="flex flex-col gap-6">
      <Titulo {...props} placeholder="Linhas de trabalho" intro="Uma frase sobre o trabalho espiritual da casa" />
      <FieldGroup title="Linhas">
        <p className="text-xs text-muted-foreground">O GiraHub não escreve sobre entidades nem fundamentos: o texto de cada linha é da casa.</p>
        <ListField
          items={itemsOf(config.items)}
          onChange={(items) => patch({ items })}
          itemLabel={(i) => `Linha ${i + 1}`}
          addLabel="Adicionar linha"
          fields={[
            { key: 'nome', label: 'Nome', placeholder: 'Ex.: Caboclos' },
            { key: 'texto', label: 'Texto curto', multiline: true },
          ]}
        />
        <ChoiceField
          label="Layout"
          value={String(config.layout || 'cartoes')}
          options={[
            { value: 'cartoes', label: 'Cartões' },
            { value: 'lista', label: 'Lista' },
          ]}
          onChange={(v) => patch({ layout: v })}
        />
      </FieldGroup>
      <Aparencia {...props} />
    </div>
  );
}

export function RotinaEditor(props: SectionEditorProps) {
  const { config, onChange } = props;
  const patch = usePatch(config, onChange);
  return (
    <div className="flex flex-col gap-6">
      <Titulo {...props} placeholder="Rotina da casa" intro="Algo que vale para todos os dias" />
      <FieldGroup title="Dias e horários">
        <ListField
          items={itemsOf(config.items)}
          onChange={(items) => patch({ items })}
          itemLabel={(i) => `Horário ${i + 1}`}
          addLabel="Adicionar horário"
          fields={[
            { key: 'dia', label: 'Dia', placeholder: 'Ex.: Sábado' },
            { key: 'hora', label: 'Horário', placeholder: 'Ex.: 19h' },
            { key: 'nome', label: 'O que acontece', placeholder: 'Ex.: Gira de atendimento' },
          ]}
        />
        {shows(config, 'show_observacao') && <TextField label="Observação (opcional)" value={String(config.observacao || '')} onChange={(e) => patch({ observacao: e.target.value })} placeholder="Ex.: a casa fecha em feriados" />}
      </FieldGroup>
      <Aparencia {...props} />
    </div>
  );
}

/** Perguntas comuns de quem vai a um terreiro pela primeira vez. A resposta fica em branco: é da casa. */
export const FAQ_SUGESTOES = [
  'Preciso marcar antes de ir?',
  'Qual roupa devo usar?',
  'Pode levar criança?',
  'Quanto custa o atendimento?',
  'Como funciona a senha?',
  'Posso levar algo para a casa?',
];

export function FaqEditor(props: SectionEditorProps) {
  const { config, onChange } = props;
  const patch = usePatch(config, onChange);
  return (
    <div className="flex flex-col gap-6">
      <Titulo {...props} placeholder="Perguntas frequentes" />
      <FieldGroup title="Perguntas">
        <ListField
          items={itemsOf(config.items)}
          onChange={(items) => patch({ items })}
          itemLabel={(i) => `Pergunta ${i + 1}`}
          addLabel="Adicionar pergunta"
          fields={[
            { key: 'pergunta', label: 'Pergunta' },
            { key: 'resposta', label: 'Resposta', multiline: true },
          ]}
          suggestions={FAQ_SUGESTOES.map((p) => ({ label: p, item: { pergunta: p, resposta: '' } }))}
        />
        <p className="text-xs text-muted-foreground">Pergunta sem resposta não vai para o Google.</p>
      </FieldGroup>
      <Aparencia {...props} />
    </div>
  );
}

export function SocialEditor(props: SectionEditorProps) {
  const { config, onChange } = props;
  const patch = usePatch(config, onChange);
  const field = (key: string, label: string, placeholder: string) => shows(config, `show_${key}`) && (
    <TextField label={label} value={String(config[key] || '')} onChange={(e) => patch({ [key]: e.target.value })} placeholder={placeholder} />
  );
  return (
    <div className="flex flex-col gap-6">
      <Titulo {...props} placeholder="Acompanhe a casa" />
      <FieldGroup title="Redes">
        {field('instagram', 'Instagram', '@suacasa')}
        {field('youtube', 'YouTube', '@suacasa ou link do canal')}
        {field('facebook', 'Facebook', 'nome da página ou link')}
        {field('tiktok', 'TikTok', '@suacasa')}
        {field('whatsapp', 'WhatsApp', '(11) 99999-9999')}
        <ChoiceField
          label="Layout"
          value={String(config.layout || 'botoes')}
          options={[
            { value: 'botoes', label: 'Botões' },
            { value: 'icones', label: 'Ícones' },
          ]}
          onChange={(v) => patch({ layout: v })}
        />
      </FieldGroup>
      <Aparencia {...props} />
    </div>
  );
}

export function AjudarEditor(props: SectionEditorProps) {
  const { config, onChange } = props;
  const patch = usePatch(config, onChange);
  return (
    <div className="flex flex-col gap-6">
      <Titulo {...props} placeholder="Como ajudar a casa" intro="Conte como a ajuda é usada" />
      {shows(config, 'show_pix') && (
      <FieldGroup title="PIX">
        <TextField label="Chave PIX (opcional)" value={String(config.pix_chave || '')} onChange={(e) => patch({ pix_chave: e.target.value })} placeholder="CNPJ, e-mail, telefone ou chave aleatória" />
        <TextField label="Em nome de" value={String(config.pix_nome || '')} onChange={(e) => patch({ pix_nome: e.target.value })} placeholder="Nome que aparece no banco" />
      </FieldGroup>
      )}
      {shows(config, 'show_necessidades') && (
      <FieldGroup title="O que a casa precisa">
        <TextField label="Um item por linha (opcional)" multiline rows={4} value={String(config.necessidades || '')} onChange={(e) => patch({ necessidades: e.target.value })} placeholder={'Velas brancas\nAlimentos para a cesta básica'} />
      </FieldGroup>
      )}
      <Aparencia {...props} />
    </div>
  );
}
