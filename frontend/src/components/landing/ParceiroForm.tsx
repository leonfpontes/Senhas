/**
 * Formulário "Quero ser parceiro" da página /parceiros (C-06).
 * POST /api/v1/public/parceiros/interesse — sem login. Antiabuso: limite por IP no backend e o
 * campo isca `website` (fora da tela, fora do Tab; robô preenche → o backend descarta calado).
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { FieldWrapper, MaskedInput, TextField, unmask } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RESPOSTA_DIAS_UTEIS, TIPOS_PARCEIRO, UFS } from '@/constants/parceiros';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const COMO_DIVULGAR_MAX = 500;

interface FormState {
  nome: string;
  tipo: string;
  nome_negocio: string;
  cidade: string;
  uf: string;
  whatsapp: string;
  email: string;
  como_divulgar: string;
  aceite: boolean;
  website: string;
}

const VAZIO: FormState = {
  nome: '',
  tipo: '',
  nome_negocio: '',
  cidade: '',
  uf: '',
  whatsapp: '',
  email: '',
  como_divulgar: '',
  aceite: false,
  website: '',
};

type Erros = Partial<Record<keyof FormState, string>>;

export function validarParceiro(f: FormState): Erros {
  const e: Erros = {};
  if (f.nome.trim().length < 3) e.nome = 'Conte o seu nome.';
  if (!f.tipo) e.tipo = 'Escolha o tipo de parceiro.';
  if (f.cidade.trim().length < 2) e.cidade = 'Informe a cidade.';
  if (!f.uf) e.uf = 'Escolha a UF.';
  const tel = unmask(f.whatsapp);
  if (tel.length < 10 || tel.length > 11) e.whatsapp = 'Informe o WhatsApp com DDD.';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Informe um e-mail válido.';
  if (f.como_divulgar.trim().length < 3) e.como_divulgar = 'Conte em poucas palavras como pretende divulgar.';
  if (!f.aceite) e.aceite = 'Para enviar, aceite o regulamento.';
  return e;
}

const INPUT = 'h-12 bg-white text-base';

export function ParceiroForm() {
  const [form, setForm] = useState<FormState>(VAZIO);
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (erros[k]) setErros((e) => ({ ...e, [k]: undefined }));
  };

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validarParceiro(form);
    setErros(e);
    if (Object.keys(e).length) {
      const primeiro = Object.keys(e)[0];
      document.getElementById(`parceiro-${primeiro}`)?.focus();
      return;
    }
    setEnviando(true);
    setErroEnvio(null);
    try {
      const res = await apiClient.post('/api/v1/public/parceiros/interesse', {
        nome: form.nome.trim(),
        tipo: form.tipo,
        nome_negocio: form.nome_negocio.trim() || null,
        cidade: form.cidade.trim(),
        uf: form.uf,
        whatsapp: unmask(form.whatsapp),
        email: form.email.trim(),
        como_divulgar: form.como_divulgar.trim(),
        aceite_regulamento: form.aceite,
        website: form.website,
      });
      setSucesso(
        (res.data as { message?: string })?.message ??
          `Recebemos o seu pedido! A equipe GiraHub responde em até ${RESPOSTA_DIAS_UTEIS} dias úteis.`,
      );
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setErroEnvio(
        status === 429
          ? 'Muitos envios seguidos deste endereço. Espere um pouco e tente de novo.'
          : extractApiErrorMessage(err, 'Não foi possível enviar agora. Tente de novo em instantes.'),
      );
    } finally {
      setEnviando(false);
    }
  };

  if (sucesso) {
    return (
      <div role="status" className="rounded-3xl border border-folha-600/30 bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-12 text-folha-600" aria-hidden />
        <h3 className="mt-4 font-display text-2xl font-bold text-tinta">Pedido enviado. Axé!</h3>
        <p className="mt-3 text-tinta-suave">{sucesso}</p>
        <Button asChild variant="outline" size="touch" className="mt-6 border-barro-600 text-barro-700 hover:bg-areia-100">
          <Link href="/">Conhecer o GiraHub</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={enviar}
      aria-label="Quero ser parceiro"
      className="relative grid gap-5 rounded-3xl border border-areia-200 bg-white p-5 shadow-sm sm:p-8"
    >
      {erroEnvio && (
        <Alert variant="destructive">
          <AlertDescription>{erroEnvio}</AlertDescription>
        </Alert>
      )}

      <TextField
        id="parceiro-nome"
        label="Seu nome"
        required
        autoComplete="name"
        value={form.nome}
        onChange={(e) => set('nome', e.target.value)}
        error={erros.nome}
        maxLength={120}
        inputClassName={INPUT}
      />

      <FieldWrapper id="parceiro-tipo" label="Você é" required error={erros.tipo}>
        {(control) => (
          <Select value={form.tipo} onValueChange={(v) => set('tipo', v)}>
            <SelectTrigger {...control} className="h-12 w-full bg-white text-base">
              <SelectValue placeholder="Escolha uma opção" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_PARCEIRO.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FieldWrapper>

      <TextField
        id="parceiro-nome_negocio"
        label="Nome da loja, casa ou perfil"
        helperText="Opcional. Ex.: Casa de Artigos Pai Joaquim, @ponto.de.axe"
        value={form.nome_negocio}
        onChange={(e) => set('nome_negocio', e.target.value)}
        maxLength={160}
        inputClassName={INPUT}
      />

      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <TextField
          id="parceiro-cidade"
          label="Cidade"
          required
          autoComplete="address-level2"
          value={form.cidade}
          onChange={(e) => set('cidade', e.target.value)}
          error={erros.cidade}
          maxLength={100}
          inputClassName={INPUT}
        />
        <FieldWrapper id="parceiro-uf" label="UF" required error={erros.uf}>
          {(control) => (
            <Select value={form.uf} onValueChange={(v) => set('uf', v)}>
              <SelectTrigger {...control} className="h-12 w-full bg-white text-base">
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                {UFS.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FieldWrapper>
      </div>

      <MaskedInput
        id="parceiro-whatsapp"
        mask="telefone"
        label="WhatsApp"
        required
        autoComplete="tel-national"
        placeholder="(21) 98765-4321"
        value={form.whatsapp}
        onChange={(v) => set('whatsapp', v)}
        error={erros.whatsapp}
        inputClassName={INPUT}
      />

      <TextField
        id="parceiro-email"
        label="E-mail"
        type="email"
        required
        autoComplete="email"
        value={form.email}
        onChange={(e) => set('email', e.target.value)}
        error={erros.email}
        maxLength={255}
        inputClassName={INPUT}
      />

      <TextField
        id="parceiro-como_divulgar"
        label="Como pretende divulgar?"
        required
        multiline
        rows={3}
        helperText="Ex.: display no balcão, grupo de WhatsApp da federação, stories no Instagram."
        value={form.como_divulgar}
        onChange={(e) => set('como_divulgar', e.target.value)}
        error={erros.como_divulgar}
        maxLength={COMO_DIVULGAR_MAX}
        inputClassName="bg-white text-base"
      />

      {/* Campo isca: invisível e fora do Tab. Pessoas não veem; robôs preenchem. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="parceiro-website">Site (deixe em branco)</label>
        <input
          id="parceiro-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id="parceiro-aceite"
            checked={form.aceite}
            onCheckedChange={(v) => set('aceite', v === true)}
            aria-invalid={erros.aceite ? true : undefined}
            aria-describedby={erros.aceite ? 'parceiro-aceite-erro' : undefined}
            className="mt-0.5 size-5 border-tinta-suave data-[state=checked]:border-barro-600 data-[state=checked]:bg-barro-600"
          />
          <Label htmlFor="parceiro-aceite" className="text-sm leading-relaxed font-normal text-tinta">
            Li e aceito o{' '}
            <a href="#regulamento" className="font-semibold text-barro-700 underline underline-offset-2">
              regulamento do Programa de Parceiros
            </a>
            .
          </Label>
        </div>
        {erros.aceite && (
          <p id="parceiro-aceite-erro" className="text-sm text-destructive">
            {erros.aceite}
          </p>
        )}
      </div>

      <p className="text-xs leading-relaxed text-tinta-suave">
        Usamos seus dados só para responder sobre a parceria. Saiba mais na{' '}
        <Link href="/privacidade" className="font-semibold text-barro-700 underline underline-offset-2">
          Política de Privacidade
        </Link>
        .
      </p>

      <Button
        type="submit"
        size="touch"
        disabled={enviando}
        className="bg-ouro-400 text-base font-bold text-cafe-950 hover:bg-ouro-300"
      >
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {enviando ? 'Enviando…' : 'Quero ser parceiro'}
      </Button>
    </form>
  );
}

export default ParceiroForm;
