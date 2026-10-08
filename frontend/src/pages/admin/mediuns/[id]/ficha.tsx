/**
 * /admin/mediuns/[id]/ficha — Ficha espiritual e caminhada de um médium (F-05).
 *
 * - Autorização (LGPD art. 11): sem ela nada se grava (API 409). A direção registra que o médium
 *   autorizou (caixa com o texto, versão `FICHA_CONSENTIMENTO_VERSAO`) ou o médium autoriza na Área
 *   (AM-19). "Registrar que retirou" quando o médium pede à casa. Retirada: os dados ficam
 *   inacessíveis e a tela oferece "Apagar dados da ficha".
 * - Aba "Ficha": os campos da casa com o valor do médium (texto, data, lista, sim/não), salvar
 *   tudo de uma vez; sugestões pendentes do médium aparecem no campo (Aceitar/Recusar).
 * - Aba "Caminhada": linha do tempo de marcos (entrada, batismo, obrigação, coroação...), com
 *   `CrudDrawer` para criar/editar e "o médium vê" por marco.
 *
 * Gates (CLAUDE.md): plano `ficha_espiritual` → `PlanLocked`; grupo `ficha_espiritual`: view (ver),
 * edit (ficha, autorização, sugestões, editar marco), insert (novo marco), delete (apagar marco e
 * dados). Ações sem permissão somem.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Check, Eye, EyeOff, Flag, Pencil, Plus, ScrollText, ShieldCheck, Trash2, X } from 'lucide-react';
import AdminLayout from '../../admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Combobox, DateField, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { minPlanFor } from '@/constants/plans';
import {
  API_FICHA_ADMIN,
  FICHA_CONSENTIMENTO_VERSAO,
  TIPOS_MARCO,
  consentimentoPainelLabel,
  rotuloTipoMarco,
  valorLegivel,
  type CampoComValor,
  type ConsentimentoFicha,
  type FichaDoMedium,
  type MarcoCaminhada,
  type TipoMarco,
} from '@/constants/fichaEspiritual';
import { isoToBrDate } from '@/lib/dateIso';

interface MarcoForm {
  tipo: TipoMarco;
  titulo: string;
  data: string | null;
  observacao: string;
  visivel_ao_medium: boolean;
}

const MARCO_VAZIO: MarcoForm = { tipo: 'batismo', titulo: '', data: null, observacao: '', visivel_ao_medium: true };

export default function AdminFichaDoMediumPage() {
  return (
    <AdminLayout title="Ficha espiritual">
      <FichaDoMediumContent />
    </AdminLayout>
  );
}

function CampoInput({
  campo,
  value,
  onChange,
  disabled,
}: {
  campo: CampoComValor;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  if (campo.tipo === 'data') {
    return (
      <DateField label={campo.rotulo} value={value || null} onChange={(iso) => onChange(iso ?? '')} disabled={disabled} />
    );
  }
  if (campo.tipo === 'lista' || campo.tipo === 'sim_nao') {
    const options =
      campo.tipo === 'sim_nao'
        ? [
            { value: 'sim', label: 'Sim' },
            { value: 'nao', label: 'Não' },
          ]
        : (campo.opcoes ?? []).map((o) => ({ value: o, label: o }));
    return (
      <Combobox
        label={campo.rotulo}
        options={options}
        value={value || null}
        onChange={(v) => onChange(v ?? '')}
        clearable
        disabled={disabled}
      />
    );
  }
  return (
    <TextField
      label={campo.rotulo}
      fullWidth
      maxLength={500}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

function FichaDoMediumContent() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const noPlano = can('ficha_espiritual');
  const canView = canGroup('ficha_espiritual', 'view');
  const canInsert = canGroup('ficha_espiritual', 'insert');
  const canEdit = canGroup('ficha_espiritual', 'edit');
  const canDelete = canGroup('ficha_espiritual', 'delete');

  const [ficha, setFicha] = useState<FichaDoMedium | null>(null);
  const [marcos, setMarcos] = useState<MarcoCaminhada[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<'rede' | 'nao_encontrado' | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmo, setConfirmo] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [confirmarRevogar, setConfirmarRevogar] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const [marcoDrawer, setMarcoDrawer] = useState(false);
  const [marcoEditando, setMarcoEditando] = useState<MarcoCaminhada | null>(null);
  const [marcoForm, setMarcoForm] = useState<MarcoForm>(MARCO_VAZIO);
  const [marcoInicial, setMarcoInicial] = useState<MarcoForm>(MARCO_VAZIO);
  const [marcoErro, setMarcoErro] = useState<string | null>(null);
  const [marcoSalvando, setMarcoSalvando] = useState(false);
  const [marcoApagar, setMarcoApagar] = useState<MarcoCaminhada | null>(null);

  const aplicarFicha = (f: FichaDoMedium) => {
    setFicha(f);
    setValores(Object.fromEntries(f.campos.map((c) => [c.id, c.valor ?? ''])));
  };

  const carregar = useCallback(async () => {
    if (!id || !noPlano || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const [f, m] = await Promise.all([
        apiClient.get<FichaDoMedium>(`${API_FICHA_ADMIN}/${id}/ficha`),
        apiClient.get<{ consentimento: ConsentimentoFicha; marcos: MarcoCaminhada[] }>(`${API_FICHA_ADMIN}/${id}/marcos`),
      ]);
      aplicarFicha(f.data);
      setMarcos(m.data?.marcos ?? []);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setErro(status === 404 ? 'nao_encontrado' : 'rede');
    } finally {
      setLoading(false);
    }
  }, [id, noPlano, canView]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alterados = useMemo(
    () => (ficha ? ficha.campos.filter((c) => (c.valor ?? '') !== (valores[c.id] ?? '')) : []),
    [ficha, valores],
  );
  const sugestaoDoCampo = useMemo(
    () => new Map((ficha?.sugestoes ?? []).map((s) => [s.campo_id, s])),
    [ficha],
  );

  const salvarFicha = async () => {
    if (!id || !canEdit || alterados.length === 0) return;
    setSalvando(true);
    try {
      const res = await apiClient.put<FichaDoMedium>(`${API_FICHA_ADMIN}/${id}/ficha`, {
        valores: alterados.map((c) => ({ campo_id: c.id, valor: (valores[c.id] ?? '').trim() || null })),
      });
      aplicarFicha(res.data);
      showSuccess('Ficha salva.');
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível salvar a ficha.'));
    } finally {
      setSalvando(false);
    }
  };

  const registrarConsentimento = async () => {
    if (!id || !canEdit || !confirmo) return;
    setRegistrando(true);
    try {
      await apiClient.post(`${API_FICHA_ADMIN}/${id}/ficha/consentimento`, {
        confirmo: true,
        versao: FICHA_CONSENTIMENTO_VERSAO,
      });
      setConfirmo(false);
      showSuccess('Autorização registrada.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível registrar a autorização.'));
    } finally {
      setRegistrando(false);
    }
  };

  const registrarRevogacao = async () => {
    if (!id || !canEdit) return;
    setOcupado(true);
    try {
      await apiClient.delete(`${API_FICHA_ADMIN}/${id}/ficha/consentimento`);
      showSuccess('Registrado: o médium retirou a autorização. Os dados não aparecem mais.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível registrar.'));
    } finally {
      setOcupado(false);
      setConfirmarRevogar(false);
    }
  };

  const apagarDados = async () => {
    if (!id || !canDelete) return;
    setOcupado(true);
    try {
      await apiClient.delete(`${API_FICHA_ADMIN}/${id}/ficha`);
      showSuccess('Dados da ficha apagados.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível apagar os dados.'));
    } finally {
      setOcupado(false);
      setConfirmarApagar(false);
    }
  };

  const decidir = async (sugestaoId: string, aceitar: boolean) => {
    if (!canEdit) return;
    try {
      await apiClient.post(`${API_FICHA_ADMIN}/ficha-sugestoes/${sugestaoId}/${aceitar ? 'aceitar' : 'recusar'}`);
      showSuccess(aceitar ? 'Sugestão aceita.' : 'Sugestão recusada.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível responder a sugestão.'));
    }
  };

  const abrirMarco = (m: MarcoCaminhada | null) => {
    const f: MarcoForm = m
      ? {
          tipo: m.tipo,
          titulo: m.titulo,
          data: m.data,
          observacao: m.observacao ?? '',
          visivel_ao_medium: m.visivel_ao_medium !== false,
        }
      : MARCO_VAZIO;
    setMarcoEditando(m);
    setMarcoForm(f);
    setMarcoInicial(f);
    setMarcoErro(null);
    setMarcoDrawer(true);
  };

  const salvarMarco = async () => {
    if (!id) return;
    if (!marcoForm.data) {
      setMarcoErro('Informe a data.');
      return;
    }
    if (marcoEditando ? !canEdit : !canInsert) return;
    const payload = {
      tipo: marcoForm.tipo,
      titulo: marcoForm.titulo.trim() || null,
      data: marcoForm.data,
      observacao: marcoForm.observacao.trim() || null,
      visivel_ao_medium: marcoForm.visivel_ao_medium,
    };
    setMarcoSalvando(true);
    setMarcoErro(null);
    try {
      if (marcoEditando) {
        await apiClient.put(`${API_FICHA_ADMIN}/${id}/marcos/${marcoEditando.id}`, payload);
      } else {
        await apiClient.post(`${API_FICHA_ADMIN}/${id}/marcos`, payload);
      }
      showSuccess('Caminhada atualizada.');
      setMarcoDrawer(false);
      void carregar();
    } catch (err) {
      setMarcoErro(extractApiErrorMessage(err, 'Não foi possível salvar o marco.'));
    } finally {
      setMarcoSalvando(false);
    }
  };

  const apagarMarco = async () => {
    if (!id || !marcoApagar || !canDelete) return;
    setOcupado(true);
    try {
      await apiClient.delete(`${API_FICHA_ADMIN}/${id}/marcos/${marcoApagar.id}`);
      showSuccess('Marco apagado.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível apagar o marco.'));
    } finally {
      setOcupado(false);
      setMarcoApagar(null);
    }
  };

  if (subLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!noPlano) return <PlanLocked feature="Ficha espiritual" minPlan={minPlanFor('ficha_espiritual').label} />;
  if (!canView) return <PermissionDenied className="mt-4" />;

  const voltar = (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/mediuns">
          <ArrowLeft aria-hidden />
          Médiuns e Cambones
        </Link>
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (erro || !ficha) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <EmptyState
          icon={<ScrollText />}
          title={erro === 'nao_encontrado' ? 'Médium não encontrado' : 'Não foi possível carregar a ficha'}
          description={erro === 'nao_encontrado' ? 'Ele pode ter sido excluído.' : 'Confira a internet e tente de novo.'}
          action={
            erro === 'rede' ? (
              <Button variant="outline" onClick={() => void carregar()}>
                Tentar de novo
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const consentido = ficha.consentimento.dado;
  const revogado = !consentido && !!ficha.consentimento.revogado_em;
  const nome = ficha.medium.nome;

  return (
    <div className="flex flex-col gap-5">
      {voltar}
      <PageHeader
        title={nome}
        subtitle="Ficha espiritual e caminhada. Só a direção e quem ela autorizou veem estes dados."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/mediuns/ficha">
              <ScrollText aria-hidden />
              Campos da ficha
            </Link>
          </Button>
        }
      />

      {consentido ? (
        <Alert variant="info" data-testid="ficha-autorizada">
          <ShieldCheck aria-hidden />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Autorização registrada em {isoToBrDate(ficha.consentimento.em)} (texto versão {ficha.consentimento.versao}).
            </span>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmarRevogar(true)}>
                Registrar que retirou
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="warning" data-testid="ficha-sem-autorizacao">
          <AlertDescription className="flex flex-col gap-3">
            {revogado ? (
              <span>
                <strong>{nome} retirou a autorização</strong> em {isoToBrDate(ficha.consentimento.revogado_em)}. Os dados da
                ficha não aparecem mais.
                {ficha.registros_guardados > 0 && ' Pela LGPD, a casa deve apagá-los.'}
              </span>
            ) : (
              <span>
                <strong>Falta a autorização de {nome}.</strong> A ficha espiritual é dado religioso: só preencha com o sim dele,
                dado aqui pela direção ou pelo próprio médium na Área do Médium.
              </span>
            )}
            {revogado && ficha.registros_guardados > 0 && canDelete && (
              <Button size="sm" variant="outline" className="self-start" onClick={() => setConfirmarApagar(true)}>
                <Trash2 aria-hidden />
                Apagar dados da ficha
              </Button>
            )}
            {canEdit && (
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={confirmo} onCheckedChange={(c) => setConfirmo(c === true)} aria-label="Confirmo a autorização" />
                  <span>{consentimentoPainelLabel(nome)}</span>
                </label>
                <Button
                  size="sm"
                  className="self-start"
                  disabled={!confirmo || registrando}
                  onClick={() => void registrarConsentimento()}
                >
                  <ShieldCheck aria-hidden />
                  Registrar autorização
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="ficha">
        <TabsList>
          <TabsTrigger value="ficha">Ficha</TabsTrigger>
          <TabsTrigger value="caminhada">Caminhada</TabsTrigger>
        </TabsList>

        <TabsContent value="ficha" className="flex flex-col gap-4 pt-3">
          {ficha.campos.length === 0 ? (
            <EmptyState
              icon={<ScrollText />}
              title="A ficha da casa ainda não tem campos"
              description="Configure os campos (há modelos de Umbanda e Candomblé)."
              action={
                <Button asChild variant="outline">
                  <Link href="/admin/mediuns/ficha">Configurar campos</Link>
                </Button>
              }
            />
          ) : (
            <Card className="gap-4 p-4">
              {ficha.campos.map((c) => {
                const sugestao = sugestaoDoCampo.get(c.id);
                return (
                  <div key={c.id} className="flex flex-col gap-1.5" data-testid="ficha-valor">
                    {consentido && canEdit ? (
                      <CampoInput
                        campo={c}
                        value={valores[c.id] ?? ''}
                        onChange={(v) => setValores((prev) => ({ ...prev, [c.id]: v }))}
                        disabled={salvando}
                      />
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm text-muted-foreground">{c.rotulo}</span>
                        <span>{consentido ? valorLegivel(c.tipo, c.valor) : '—'}</span>
                      </div>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {c.visivel_ao_medium ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                      {c.visivel_ao_medium ? 'O médium vê este campo' : 'Só a direção vê'}
                    </span>
                    {sugestao && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-sm">
                        <span>
                          Sugestão de {nome}: <strong>{valorLegivel(c.tipo, sugestao.valor_sugerido)}</strong>
                        </span>
                        {canEdit && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => void decidir(sugestao.id, true)}>
                              <Check aria-hidden />
                              Aceitar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void decidir(sugestao.id, false)}>
                              <X aria-hidden />
                              Recusar
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {consentido && canEdit && (
                <Button className="self-start" disabled={alterados.length === 0 || salvando} onClick={() => void salvarFicha()}>
                  Salvar ficha
                </Button>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="caminhada" className="flex flex-col gap-4 pt-3">
          {consentido && canInsert && (
            <Button className="self-start" onClick={() => abrirMarco(null)}>
              <Plus aria-hidden />
              Novo marco
            </Button>
          )}
          {marcos.length === 0 ? (
            <EmptyState
              icon={<Flag />}
              title="Nenhum marco na caminhada"
              description={
                consentido
                  ? 'Entrada na casa, batismo, obrigações, coroação… cada passo com a data.'
                  : 'A caminhada aparece aqui depois da autorização do médium.'
              }
            />
          ) : (
            <ol className="relative flex flex-col gap-3 border-l-2 border-border pl-5" aria-label="Caminhada">
              {marcos.map((m) => (
                <li key={m.id} className="relative" data-testid="ficha-marco">
                  <span aria-hidden className="absolute top-2 -left-[27px] size-3 rounded-full bg-primary ring-4 ring-background" />
                  <Card className="flex-row items-start gap-3 p-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm text-muted-foreground tabular-nums">{isoToBrDate(m.data)}</span>
                      <span className="font-medium">{m.titulo}</span>
                      <span className="flex flex-wrap gap-1.5 text-xs">
                        <Badge variant="outline">{rotuloTipoMarco(m.tipo)}</Badge>
                        {m.visivel_ao_medium === false && <Badge variant="secondary">Só a direção vê</Badge>}
                      </span>
                      {m.observacao && <p className="text-sm text-muted-foreground">{m.observacao}</p>}
                    </div>
                    {(canEdit || canDelete) && (
                      <div className="flex shrink-0 gap-1">
                        {canEdit && consentido && (
                          <Button variant="ghost" size="icon-sm" onClick={() => abrirMarco(m)} aria-label={`Editar ${m.titulo}`}>
                            <Pencil />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon-sm" onClick={() => setMarcoApagar(m)} aria-label={`Apagar ${m.titulo}`}>
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>

      <CrudDrawer
        open={marcoDrawer}
        title={marcoEditando ? 'Editar marco' : 'Novo marco'}
        subtitle={`Caminhada de ${nome}`}
        icon={<Flag />}
        onClose={() => setMarcoDrawer(false)}
        onSave={salvarMarco}
        saving={marcoSalvando}
        saveLabel={marcoEditando ? 'Salvar' : 'Incluir marco'}
        isDirty={JSON.stringify(marcoForm) !== JSON.stringify(marcoInicial)}
        error={marcoErro}
      >
        <Combobox
          label="Tipo"
          options={TIPOS_MARCO.map((t) => ({ value: t.value, label: t.label }))}
          value={marcoForm.tipo}
          onChange={(v) => v && setMarcoForm((f) => ({ ...f, tipo: v as TipoMarco }))}
        />
        <TextField
          label="Título"
          fullWidth
          maxLength={120}
          value={marcoForm.titulo}
          onChange={(e) => setMarcoForm((f) => ({ ...f, titulo: e.target.value }))}
          helperText={`Em branco, fica “${rotuloTipoMarco(marcoForm.tipo)}”.`}
        />
        <DateField
          label="Data"
          required
          value={marcoForm.data}
          onChange={(iso) => setMarcoForm((f) => ({ ...f, data: iso }))}
        />
        <TextField
          label="Observação"
          multiline
          rows={3}
          fullWidth
          maxLength={300}
          value={marcoForm.observacao}
          onChange={(e) => setMarcoForm((f) => ({ ...f, observacao: e.target.value }))}
        />
        <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <Label htmlFor="marco-visivel" className="flex flex-col items-start gap-0.5 font-normal">
            <span className="font-medium">O médium vê este marco</span>
            <span className="text-sm text-muted-foreground">Aparece em “Minha caminhada”, na Área do Médium.</span>
          </Label>
          <Switch
            id="marco-visivel"
            checked={marcoForm.visivel_ao_medium}
            onCheckedChange={(v) => setMarcoForm((f) => ({ ...f, visivel_ao_medium: v }))}
          />
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={confirmarRevogar}
        title="Registrar que retirou a autorização"
        message={
          <>
            Use quando <strong>{nome}</strong> pedir à casa para não guardar mais os dados da ficha. Eles deixam de aparecer e
            depois podem ser apagados.
          </>
        }
        confirmText="Registrar"
        loading={ocupado}
        onConfirm={() => void registrarRevogacao()}
        onCancel={() => setConfirmarRevogar(false)}
      />
      <ConfirmDialog
        open={confirmarApagar}
        title="Apagar dados da ficha"
        message={
          <>
            Apagar a ficha, a caminhada e as sugestões de <strong>{nome}</strong>? Não dá para desfazer. O cadastro do médium
            continua.
          </>
        }
        confirmText="Apagar dados"
        destructive
        loading={ocupado}
        onConfirm={() => void apagarDados()}
        onCancel={() => setConfirmarApagar(false)}
      />
      <ConfirmDialog
        open={marcoApagar !== null}
        title="Apagar marco"
        message={
          <>
            Apagar <strong>{marcoApagar?.titulo}</strong> da caminhada? Não dá para desfazer.
          </>
        }
        confirmText="Apagar"
        destructive
        loading={ocupado}
        onConfirm={() => void apagarMarco()}
        onCancel={() => setMarcoApagar(null)}
      />
    </div>
  );
}
