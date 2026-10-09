/**
 * AreaMediumConfigSection — aba "Área do Médium" de /admin/config (AM-10).
 *
 * O terreiro liga/desliga a Área, escreve as boas-vindas, informa o WhatsApp da casa
 * (botão "Falar com a casa") e escolhe os módulos que o médium vê. Salva sozinha em
 * `PUT /api/v1/admin/config/area-medium` (fora da barra "Salvar" da página).
 *
 * Presença (AM-17/AM-28, só com `presenca_no_plano` — plano `atividades_corrente`): modo padrão
 * da casa (confiança · "Cheguei" pelo app · "Cheguei" com o QR do dia; cada tipo de atividade
 * pode ajustar em Atividades → Tipos e funções) e o prazo para o médium contar o motivo de uma
 * falta (1 a 30 dias). Trocar o modo vale para as próximas chamadas; presença já registrada fica.
 *
 * Lembretes da mensalidade por e-mail (AM-15, D-29): 3 dias antes e 3 dias depois do vencimento,
 * sem comprovante — a casa pode desligar (`lembretes.mensalidade`). Só aparece com o módulo
 * mensalidade ligado e no plano.
 *
 * Mensagem de aniversário (AM-20): o que a casa diz ao médium no Início, no dia do aniversário dele
 * (até 200; `{nome}` vira o primeiro nome). Em branco, vale o texto padrão.
 * Troca na escala (AM-27, só com `trocas_no_plano` — plano `escalas`): "Troca combinada entre
 * médiuns precisa da aprovação da direção" (padrão ligado; desligado, o aceite do colega já vale).
 *
 * Quem monta só renderiza com `can('area_medium')` (plano + chave do piloto) e
 * `canGroup('configuracoes', 'view')`; `canEdit` = `canGroup('configuracoes', 'edit')`
 * — sem ele os campos ficam só leitura e o botão de salvar some.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Loader2, Save } from 'lucide-react';
import { MaskedInput, TextField, maskTelefone, unmask } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { OPCOES_MODO_PRESENCA, type ModoPresenca } from '@/constants/presenca';
import { cn } from '@/lib/utils';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { useSnackbar } from '@/contexts/SnackbarContext';

export const AREA_MEDIUM_CONFIG_URL = '/api/v1/admin/config/area-medium';
const BOAS_VINDAS_MAX = 500;
export const ANIVERSARIO_MENSAGEM_MAX = 200;

type Modulo = 'agenda' | 'avisos' | 'mensalidade';

interface AreaMediumConfigApi {
  ativa: boolean;
  boas_vindas: string | null;
  whatsapp: string | null;
  modulos: Record<Modulo, boolean>;
  mensalidade_no_plano: boolean;
  presenca?: { modo_padrao: ModoPresenca; prazo_justificativa_dias: number };
  presenca_no_plano?: boolean;
  lembretes?: { mensalidade: boolean };
  aniversario_mensagem?: string | null;
  trocas?: { exige_aprovacao: boolean };
  trocas_no_plano?: boolean;
}

interface FormState {
  ativa: boolean;
  boasVindas: string;
  whatsapp: string;
  modulos: Record<Modulo, boolean>;
  presencaModo: ModoPresenca;
  prazo: string;
  lembreteMensalidade: boolean;
  aniversarioMensagem: string;
  trocaExigeAprovacao: boolean;
}

const PRAZO_MIN = 1;
const PRAZO_MAX = 30;

const MODULOS: { key: Modulo; title: string; description: string }[] = [
  { key: 'agenda', title: 'Agenda', description: 'Giras e atividades da casa.' },
  { key: 'avisos', title: 'Avisos', description: 'Recados da casa para a corrente.' },
  { key: 'mensalidade', title: 'Mensalidade', description: 'Valor do mês, Pagar com PIX e envio do comprovante.' },
];

/** "5511987654321" (como o servidor grava) → "(11) 98765-4321". */
function whatsappParaCampo(digitos: string | null): string {
  if (!digitos) return '';
  return maskTelefone(digitos.startsWith('55') && digitos.length >= 12 ? digitos.slice(2) : digitos);
}

function toForm(data: AreaMediumConfigApi): FormState {
  return {
    ativa: data.ativa,
    boasVindas: data.boas_vindas ?? '',
    whatsapp: whatsappParaCampo(data.whatsapp),
    modulos: { ...data.modulos },
    presencaModo: data.presenca?.modo_padrao ?? 'confianca',
    prazo: String(data.presenca?.prazo_justificativa_dias ?? 7),
    lembreteMensalidade: data.lembretes?.mensalidade ?? true,
    aniversarioMensagem: data.aniversario_mensagem ?? '',
    trocaExigeAprovacao: data.trocas?.exige_aprovacao ?? true,
  };
}

function ToggleRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
  children,
}: {
  id: string;
  title: string;
  description: React.ReactNode;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border bg-card p-4', checked && 'border-primary bg-primary/5')}>
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="cursor-pointer text-sm font-semibold">
          {title}
        </Label>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        {children}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

export function AreaMediumConfigSection({ canEdit }: { canEdit: boolean }) {
  const { showSuccess, showError } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensalidadeNoPlano, setMensalidadeNoPlano] = useState(true);
  const [presencaNoPlano, setPresencaNoPlano] = useState(false);
  const [trocasNoPlano, setTrocasNoPlano] = useState(false);
  const [saved, setSaved] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<AreaMediumConfigApi>(AREA_MEDIUM_CONFIG_URL)
      .then((res) => {
        if (cancelled) return;
        const next = toForm(res.data);
        setForm(next);
        setSaved(next);
        setMensalidadeNoPlano(res.data.mensalidade_no_plano);
        setPresencaNoPlano(Boolean(res.data.presenca_no_plano));
        setTrocasNoPlano(Boolean(res.data.trocas_no_plano));
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const whatsappDigits = form ? unmask(form.whatsapp) : '';
  const whatsappError = whatsappDigits && !/^[1-9][1-9]\d{8,9}$/.test(whatsappDigits) ? 'Número com DDD, ex.: (11) 98765-4321.' : undefined;
  const prazoNumero = form ? Number(form.prazo) : 7;
  const prazoError =
    presencaNoPlano && (!Number.isInteger(prazoNumero) || prazoNumero < PRAZO_MIN || prazoNumero > PRAZO_MAX)
      ? `De ${PRAZO_MIN} a ${PRAZO_MAX} dias.`
      : undefined;

  if (loading) return <Skeleton className="h-72 w-full" aria-label="Carregando a Área do Médium" />;
  if (loadError || !form) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertDescription>Não foi possível carregar a configuração da Área do Médium.</AlertDescription>
      </Alert>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const setModulo = (key: Modulo, value: boolean) => setForm((f) => (f ? { ...f, modulos: { ...f.modulos, [key]: value } } : f));

  const handleSave = async () => {
    if (!canEdit || whatsappError || prazoError) return;
    setSaving(true);
    try {
      const res = await apiClient.put<AreaMediumConfigApi>(AREA_MEDIUM_CONFIG_URL, {
        ativa: form.ativa,
        boas_vindas: form.boasVindas,
        whatsapp: whatsappDigits,
        modulos: form.modulos,
        lembretes: { mensalidade: form.lembreteMensalidade },
        aniversario_mensagem: form.aniversarioMensagem,
        ...(presencaNoPlano
          ? { presenca: { modo_padrao: form.presencaModo, prazo_justificativa_dias: prazoNumero } }
          : {}),
        ...(trocasNoPlano ? { trocas: { exige_aprovacao: form.trocaExigeAprovacao } } : {}),
      });
      const next = toForm(res.data);
      setForm(next);
      setSaved(next);
      showSuccess('Área do Médium salva.');
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Não foi possível salvar a Área do Médium.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardContent className="flex flex-col gap-5 p-5">
        <div>
          <h2 className="text-base font-bold">Área do Médium</h2>
          <p className="text-sm text-muted-foreground">
            Onde cada médium vê a agenda, os avisos e a mensalidade, entrando com o próprio e-mail e senha.
          </p>
        </div>

        <ToggleRow
          id="area-medium-ativa"
          title="Área do Médium ligada"
          description="Desligada, nenhum médium entra na Área. Nada é apagado: ao ligar de novo, tudo volta como estava."
          checked={form.ativa}
          disabled={!canEdit}
          onChange={(v) => set('ativa', v)}
        />

        <TextField
          label="Mensagem de boas-vindas"
          value={form.boasVindas}
          onChange={(e) => set('boasVindas', e.target.value.slice(0, BOAS_VINDAS_MAX))}
          multiline
          rows={3}
          maxLength={BOAS_VINDAS_MAX}
          disabled={!canEdit}
          placeholder="Ex.: Que bom ter você na corrente! Aqui ficam a agenda, os avisos e a mensalidade."
          helperText={`Aparece no início da Área. ${form.boasVindas.length}/${BOAS_VINDAS_MAX}`}
        />

        <TextField
          label="Mensagem de aniversário"
          value={form.aniversarioMensagem}
          onChange={(e) => set('aniversarioMensagem', e.target.value.slice(0, ANIVERSARIO_MENSAGEM_MAX))}
          multiline
          rows={2}
          maxLength={ANIVERSARIO_MENSAGEM_MAX}
          disabled={!canEdit}
          placeholder="A casa deseja um feliz aniversário, {nome}! Axé!"
          helperText={`Aparece no início da Área no dia do aniversário do médium (só ele vê). {nome} vira o primeiro nome. Em branco, vale a mensagem padrão. ${form.aniversarioMensagem.length}/${ANIVERSARIO_MENSAGEM_MAX}`}
        />

        <MaskedInput
          mask="telefone"
          label="WhatsApp da casa"
          value={form.whatsapp}
          onChange={(v) => set('whatsapp', v)}
          disabled={!canEdit}
          placeholder="(11) 98765-4321"
          error={whatsappError}
          helperText="Usado no botão “Falar com a casa”. Deixe em branco para não mostrar o botão."
        />

        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">O que o médium vê</p>
          {MODULOS.map((m) => (
            <ToggleRow
              key={m.key}
              id={`area-medium-modulo-${m.key}`}
              title={m.title}
              description={m.description}
              checked={form.modulos[m.key]}
              disabled={!canEdit}
              onChange={(v) => setModulo(m.key, v)}
            >
              {m.key === 'mensalidade' && !mensalidadeNoPlano && (
                <p className="mt-1 text-xs text-warning-strong">
                  O plano atual não inclui a mensalidade dos médiuns: o módulo fica escondido mesmo ligado.
                </p>
              )}
            </ToggleRow>
          ))}
          {mensalidadeNoPlano && form.modulos.mensalidade && (
            <ToggleRow
              id="area-medium-lembrete-mensalidade"
              title="Lembrete da mensalidade por e-mail"
              description="3 dias antes e 3 dias depois do vencimento, só para quem ainda não pagou nem mandou o comprovante. Tom gentil, sem cobrança."
              checked={form.lembreteMensalidade}
              disabled={!canEdit}
              onChange={(v) => set('lembreteMensalidade', v)}
            />
          )}
        </div>

        {presencaNoPlano && (
          <fieldset className="flex flex-col gap-3" data-testid="area-medium-presenca">
            <legend className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Presença nas giras e atividades
            </legend>
            <RadioGroup
              value={form.presencaModo}
              onValueChange={(v) => set('presencaModo', v as ModoPresenca)}
              disabled={!canEdit}
              className="flex flex-col gap-2"
              aria-label="Como a presença é marcada"
            >
              {OPCOES_MODO_PRESENCA.map((o) => (
                <Label
                  key={o.valor}
                  htmlFor={`area-medium-presenca-${o.valor}`}
                  className="flex cursor-pointer items-start gap-2 rounded-xl border bg-card p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem id={`area-medium-presenca-${o.valor}`} value={o.valor} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">{o.rotulo}</span>
                    {o.ajuda && <span className="text-xs font-normal text-muted-foreground">{o.ajuda}</span>}
                  </span>
                </Label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Cada tipo de atividade pode usar outro modo (Atividades e escalas → Tipos e funções). Trocar o modo vale
              para as próximas chamadas; presença já registrada não muda.
            </p>
            <TextField
              label="Prazo para contar o motivo de uma falta (dias)"
              type="number"
              min={PRAZO_MIN}
              max={PRAZO_MAX}
              value={form.prazo}
              onChange={(e) => set('prazo', e.target.value)}
              disabled={!canEdit}
              error={prazoError}
              helperText="Depois da atividade, o médium tem esses dias para contar por que faltou."
            />
          </fieldset>
        )}

        {trocasNoPlano && (
          <fieldset className="flex flex-col gap-3" data-testid="area-medium-trocas">
            <legend className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Troca na escala
            </legend>
            <ToggleRow
              id="area-medium-troca-aprovacao"
              title="Troca combinada entre médiuns precisa da aprovação da direção"
              description="Ligado: depois que o colega aceita, a troca espera a direção aprovar em Atividades e escalas → Trocas. Desligado: a troca vale assim que o colega aceita."
              checked={form.trocaExigeAprovacao}
              disabled={!canEdit}
              onChange={(v) => set('trocaExigeAprovacao', v)}
            />
          </fieldset>
        )}

        {canEdit && (
          <div className="flex items-center justify-end gap-3">
            {isDirty && <span className="text-sm text-muted-foreground">Alterações não salvas</span>}
            <Button type="button" onClick={handleSave} disabled={saving || !isDirty || Boolean(whatsappError) || Boolean(prazoError)}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              Salvar Área do Médium
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AreaMediumConfigSection;
