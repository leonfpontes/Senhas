/**
 * LocationEditor — "Como chegar": CEP (ViaCEP), endereço, instruções, lado do mapa,
 * tipografia e fundo.
 */
import React, { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/fields';
import { SECTION_BODY_SIZES, SECTION_TITLE_SIZES } from '@/constants/heroFonts';
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

export function LocationEditor({ config, onChange }: SectionEditorProps) {
  const patch = usePatch(config, onChange);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  const fetchCep = async () => {
    const cep = String(config.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) {
      setCepError('CEP deve ter 8 dígitos');
      return;
    }
    setCepLoading(true);
    setCepError(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepError('CEP não encontrado');
        return;
      }
      patch({ cep: data.cep, street: data.logradouro, neighborhood: data.bairro, city: data.localidade, state: data.uf });
    } catch {
      setCepError('Erro ao consultar o CEP');
    } finally {
      setCepLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Conteúdo">
        <TextField label="Título da seção" value={String(config.title || 'Como chegar')} onChange={(e) => patch({ title: e.target.value })} />
      </FieldGroup>

      <FieldGroup title="Endereço">
        <div className="flex items-end gap-2">
          <TextField
            label="CEP"
            value={String(config.cep || '')}
            onChange={(e) => {
              setCepError(null);
              patch({ cep: e.target.value });
            }}
            placeholder="00000-000"
            maxLength={9}
            inputMode="numeric"
            error={cepError ?? undefined}
            className="w-40"
          />
          <Button type="button" variant="outline" onClick={fetchCep} disabled={cepLoading} className={cepError ? 'mb-6' : undefined}>
            {cepLoading ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
            {cepLoading ? 'Buscando…' : 'Buscar CEP'}
          </Button>
        </div>
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <TextField label="Logradouro" value={String(config.street || '')} onChange={(e) => patch({ street: e.target.value })} />
          <TextField label="Número" value={String(config.number || '')} onChange={(e) => patch({ number: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Complemento" value={String(config.complement || '')} onChange={(e) => patch({ complement: e.target.value })} />
          <TextField label="Bairro" value={String(config.neighborhood || '')} onChange={(e) => patch({ neighborhood: e.target.value })} />
        </div>
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <TextField label="Cidade" value={String(config.city || '')} onChange={(e) => patch({ city: e.target.value })} />
          <TextField label="UF" value={String(config.state || '')} onChange={(e) => patch({ state: e.target.value.toUpperCase() })} maxLength={2} />
        </div>
        {Boolean(config.address) && !config.street && (
          <TextField
            label="Endereço (texto livre)"
            value={String(config.address || '')}
            onChange={(e) => patch({ address: e.target.value })}
            helperText="Preencha os campos acima para o mapa ficar mais preciso."
          />
        )}
        <TextField
          label="Instruções adicionais"
          multiline
          rows={2}
          value={String(config.instructions || '')}
          onChange={(e) => patch({ instructions: e.target.value })}
          helperText="Opcional. Ex.: entrada pelo portão lateral, estacionamento no pátio…"
        />
      </FieldGroup>

      <FieldGroup title="Layout">
        <ChoiceField label="Mapa à" value={String(config.map_side || 'right')} options={SIDE_OPTIONS} onChange={(v) => patch({ map_side: v })} />
        <MarginField config={config} onChange={onChange} />
      </FieldGroup>

      <TypographyFields
        config={config}
        onChange={onChange}
        targets={[
          { label: 'Título', sizeKey: 'title_font_size', sizes: SECTION_TITLE_SIZES, defaultSize: 28, weightKey: 'title_font_weight', defaultWeight: 700 },
          { label: 'Texto', sizeKey: 'body_font_size', sizes: SECTION_BODY_SIZES, defaultSize: 15, weightKey: 'body_font_weight', defaultWeight: 400, sampleScale: 0.7 },
        ]}
      />
      <FieldGroup title="Texto">
        <FontColorField config={config} onChange={onChange} />
      </FieldGroup>
      <BackgroundFields config={config} onChange={onChange} defaultBg="#f8f8f8" />
    </div>
  );
}

export default LocationEditor;
