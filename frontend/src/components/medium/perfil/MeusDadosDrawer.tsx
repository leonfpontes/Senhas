/**
 * "Editar meus dados" (AM-13): telefone, CEP (busca o endereço no ViaCEP), endereço e data de
 * nascimento, em `CrudDrawer` (tela cheia no celular). Os dados da casa não aparecem aqui: só a
 * direção altera. Salva com `PATCH /api/v1/medium/perfil` (telefone e CEP só com dígitos, como o
 * painel grava).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, UserRound } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { DateField, MaskedInput, TextField, maskTelefone, unmask } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/services/api_client';
import { buscarCep, CepInvalido, maskCep } from '@/lib/cep';
import { toIsoDate } from '@/lib/dateIso';
import { PERFIL_URL, erroDaApi, type MediumPerfil } from './perfil';

interface Form {
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  data_nascimento: string | null;
}

function toForm(p: MediumPerfil): Form {
  return {
    telefone: p.telefone ? maskTelefone(p.telefone) : '',
    cep: p.cep ? maskCep(p.cep) : '',
    logradouro: p.logradouro ?? '',
    numero: p.numero ?? '',
    bairro: p.bairro ?? '',
    cidade: p.cidade ?? '',
    data_nascimento: p.data_nascimento ?? null,
  };
}

function toBody(f: Form) {
  const texto = (v: string) => v.trim() || null;
  return {
    telefone: unmask(f.telefone) || null,
    cep: unmask(f.cep) || null,
    logradouro: texto(f.logradouro),
    numero: texto(f.numero),
    bairro: texto(f.bairro),
    cidade: texto(f.cidade),
    data_nascimento: f.data_nascimento,
  };
}

export interface MeusDadosDrawerProps {
  open: boolean;
  perfil: MediumPerfil;
  onClose: () => void;
  onSaved: (perfil: MediumPerfil) => void;
}

export function MeusDadosDrawer({ open, perfil, onClose, onSaved }: MeusDadosDrawerProps) {
  const [form, setForm] = useState<Form>(() => toForm(perfil));
  const [inicial, setInicial] = useState<Form>(() => toForm(perfil));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cepStatus, setCepStatus] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const numeroRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const f = toForm(perfil);
    setForm(f);
    setInicial(f);
    setError(null);
    setCepStatus({ loading: false });
  }, [open, perfil]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isDirty = JSON.stringify(toBody(form)) !== JSON.stringify(toBody(inicial));

  const telefoneDigitos = unmask(form.telefone);
  const telefoneErro =
    telefoneDigitos.length > 0 && telefoneDigitos.length < 10 ? 'Telefone com DDD: (11) 98765-4321' : undefined;
  const cepDigitos = unmask(form.cep);
  const cepErro = cepStatus.error || (cepDigitos.length > 0 && cepDigitos.length < 8 ? 'CEP deve ter 8 dígitos' : undefined);

  const procurarCep = async () => {
    if (cepDigitos.length !== 8) return;
    setCepStatus({ loading: true });
    try {
      const end = await buscarCep(cepDigitos);
      setForm((f) => ({
        ...f,
        logradouro: end.logradouro || f.logradouro,
        bairro: end.bairro || f.bairro,
        cidade: end.cidade || f.cidade,
      }));
      setCepStatus({ loading: false });
      setTimeout(() => numeroRef.current?.focus(), 50);
    } catch (err) {
      setCepStatus({ loading: false, error: err instanceof CepInvalido ? err.message : 'CEP não encontrado.' });
    }
  };

  const salvar = async () => {
    if (telefoneErro || (cepDigitos.length > 0 && cepDigitos.length !== 8)) {
      setError('Confira o telefone e o CEP.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.patch<MediumPerfil>(PERFIL_URL, toBody(form));
      onSaved(res.data);
    } catch (err) {
      setError(erroDaApi(err, 'Não foi possível salvar agora. Tente de novo.').message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrudDrawer
      open={open}
      onClose={onClose}
      title="Editar meus dados"
      subtitle="Ajude a casa a manter seu contato em dia."
      icon={<UserRound />}
      onSave={salvar}
      saveLabel="Salvar meus dados"
      saving={saving}
      saveDisabled={!isDirty}
      isDirty={isDirty}
      error={error}
      className="medium-terra"
    >
      <MaskedInput
        mask="telefone"
        label="Telefone (WhatsApp)"
        value={form.telefone}
        onChange={(v) => set('telefone', v)}
        autoComplete="tel-national"
        error={telefoneErro}
        data-testid="perfil-telefone"
      />
      <DateField
        label="Data de nascimento"
        value={form.data_nascimento}
        onChange={(v) => set('data_nascimento', v)}
        max={toIsoDate(new Date())}
        name="data_nascimento"
      />
      <MaskedInput
        mask={maskCep}
        label="CEP"
        inputMode="numeric"
        autoComplete="postal-code"
        value={form.cep}
        onChange={(v) => {
          set('cep', v);
          setCepStatus({ loading: false });
        }}
        onBlur={() => void procurarCep()}
        error={cepErro}
        helperText={cepErro ? undefined : 'Digite o CEP e o endereço se completa sozinho.'}
        data-testid="perfil-cep"
        endAdornment={
          cepStatus.loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Buscando o CEP" />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-7 text-muted-foreground"
              aria-label="Buscar endereço pelo CEP"
              onClick={() => void procurarCep()}
              disabled={cepDigitos.length !== 8}
            >
              <Search />
            </Button>
          )
        }
      />
      <TextField
        label="Rua"
        value={form.logradouro}
        onChange={(e) => set('logradouro', e.target.value)}
        autoComplete="address-line1"
        maxLength={255}
      />
      <TextField
        ref={numeroRef}
        label="Número"
        value={form.numero}
        onChange={(e) => set('numero', e.target.value)}
        maxLength={20}
      />
      <TextField
        label="Bairro"
        value={form.bairro}
        onChange={(e) => set('bairro', e.target.value)}
        maxLength={100}
      />
      <TextField
        label="Cidade"
        value={form.cidade}
        onChange={(e) => set('cidade', e.target.value)}
        autoComplete="address-level2"
        maxLength={100}
      />
    </CrudDrawer>
  );
}

export default MeusDadosDrawer;
