/**
 * /admin/mediuns/ficha — Ficha espiritual: campos da casa e pendências (F-05/AM-19).
 *
 * - Campos configuráveis por tradição (Umbanda, Candomblé, Outra): rótulo, tipo (texto, data, lista,
 *   sim/não), "o médium vê" e "o médium pode sugerir"; `CrudDrawer` para criar/editar; arquivar tira
 *   o campo da ficha e da Área (os valores ficam). Modelos iniciais de Umbanda e Candomblé.
 * - Pendências: sugestões dos médiuns (Aceitar grava na ficha; Recusar descarta) e autorizações
 *   retiradas pelo médium (os dados ficam inacessíveis; "Apagar dados" elimina).
 *
 * Gates (CLAUDE.md): plano `ficha_espiritual` (Pro) → `PlanLocked` com `minPlanFor`; grupo
 * `ficha_espiritual` (dado religioso, fora do grupo padrão): view para ver; insert para criar campo
 * e aplicar modelo; edit para editar e decidir sugestões; delete para arquivar e apagar dados.
 * Backend: `api/v1/admin/ficha_espiritual.py`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, ArrowLeft, Check, Eye, EyeOff, MessageSquarePlus, Pencil, Plus, ScrollText, Trash2, X } from 'lucide-react';
import AdminLayout from '../admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Combobox, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { minPlanFor } from '@/constants/plans';
import {
  API_FICHA_ADMIN,
  API_FICHA_CAMPOS,
  TIPOS_CAMPO,
  TRADICOES,
  rotuloTradicao,
  type CampoFicha,
  type PendenciasFicha,
  type RevogacaoFicha,
  type TipoCampoFicha,
  type TradicaoFicha,
} from '@/constants/fichaEspiritual';
import { isoToBrDate } from '@/lib/dateIso';

interface FormState {
  rotulo: string;
  tipo: TipoCampoFicha;
  tradicao: TradicaoFicha;
  opcoes: string;
  visivel_ao_medium: boolean;
  medium_pode_sugerir: boolean;
}

const VAZIO: FormState = {
  rotulo: '',
  tipo: 'texto',
  tradicao: 'outra',
  opcoes: '',
  visivel_ao_medium: false,
  medium_pode_sugerir: false,
};

export default function AdminFichaEspiritualPage() {
  return (
    <AdminLayout title="Ficha espiritual">
      <FichaConfigContent />
    </AdminLayout>
  );
}

function FichaConfigContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const noPlano = can('ficha_espiritual');
  const canView = canGroup('ficha_espiritual', 'view');
  const canInsert = canGroup('ficha_espiritual', 'insert');
  const canEdit = canGroup('ficha_espiritual', 'edit');
  const canDelete = canGroup('ficha_espiritual', 'delete');

  const [campos, setCampos] = useState<CampoFicha[]>([]);
  const [pendencias, setPendencias] = useState<PendenciasFicha>({ sugestoes: [], revogacoes: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [verArquivados, setVerArquivados] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CampoFicha | null>(null);
  const [form, setForm] = useState<FormState>(VAZIO);
  const [inicial, setInicial] = useState<FormState>(VAZIO);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [arquivar, setArquivar] = useState<CampoFicha | null>(null);
  const [apagar, setApagar] = useState<RevogacaoFicha | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!noPlano || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const [c, p] = await Promise.all([
        apiClient.get<CampoFicha[]>(API_FICHA_CAMPOS, { params: verArquivados ? { incluir_arquivados: true } : undefined }),
        apiClient.get<PendenciasFicha>(`${API_FICHA_ADMIN}/ficha-pendencias`),
      ]);
      setCampos(Array.isArray(c.data) ? c.data : []);
      setPendencias(p.data ?? { sugestoes: [], revogacoes: [] });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [noPlano, canView, verArquivados]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Sugerir só em campo que o médium vê (o backend garante o mesmo).
      if (k === 'medium_pode_sugerir' && v === true) next.visivel_ao_medium = true;
      if (k === 'visivel_ao_medium' && v === false) next.medium_pode_sugerir = false;
      return next;
    });

  const abrirNovo = () => {
    setEditing(null);
    setForm(VAZIO);
    setInicial(VAZIO);
    setSaveError(null);
    setDrawerOpen(true);
  };

  const abrirEdicao = (c: CampoFicha) => {
    const atual: FormState = {
      rotulo: c.rotulo,
      tipo: c.tipo,
      tradicao: c.tradicao,
      opcoes: (c.opcoes ?? []).join('\n'),
      visivel_ao_medium: c.visivel_ao_medium,
      medium_pode_sugerir: c.medium_pode_sugerir,
    };
    setEditing(c);
    setForm(atual);
    setInicial(atual);
    setSaveError(null);
    setDrawerOpen(true);
  };

  const salvar = async () => {
    if (!form.rotulo.trim()) {
      setSaveError('Dê um nome ao campo.');
      return;
    }
    if (editing ? !canEdit : !canInsert) return;
    const payload = {
      rotulo: form.rotulo.trim(),
      tipo: form.tipo,
      tradicao: form.tradicao,
      opcoes:
        form.tipo === 'lista'
          ? form.opcoes
              .split('\n')
              .map((o) => o.trim())
              .filter(Boolean)
          : null,
      visivel_ao_medium: form.visivel_ao_medium,
      medium_pode_sugerir: form.medium_pode_sugerir,
    };
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await apiClient.put(`${API_FICHA_CAMPOS}/${editing.id}`, payload);
        showSuccess('Campo atualizado.');
      } else {
        await apiClient.post(API_FICHA_CAMPOS, payload);
        showSuccess('Campo criado.');
      }
      setDrawerOpen(false);
      void carregar();
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, 'Não foi possível salvar o campo.'));
    } finally {
      setSaving(false);
    }
  };

  const aplicarModelo = async (tradicao: TradicaoFicha) => {
    if (!canInsert) return;
    try {
      const res = await apiClient.post<CampoFicha[]>(`${API_FICHA_CAMPOS}/modelos/${tradicao}`);
      const n = Array.isArray(res.data) ? res.data.length : 0;
      showSuccess(n > 0 ? `${n} campos de ${rotuloTradicao(tradicao)} criados.` : 'A ficha já tem os campos desse modelo.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível aplicar o modelo.'));
    }
  };

  const desarquivar = async (c: CampoFicha) => {
    if (!canEdit) return;
    try {
      await apiClient.put(`${API_FICHA_CAMPOS}/${c.id}`, { arquivado: false });
      showSuccess('Campo de volta na ficha.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível trazer o campo de volta.'));
    }
  };

  const confirmarArquivar = async () => {
    if (!arquivar || !canDelete) return;
    setOcupado(true);
    try {
      await apiClient.delete(`${API_FICHA_CAMPOS}/${arquivar.id}`);
      showSuccess('Campo arquivado. Ele saiu da ficha e da Área do Médium.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível arquivar o campo.'));
    } finally {
      setOcupado(false);
      setArquivar(null);
    }
  };

  const decidir = async (id: string, aceitar: boolean) => {
    if (!canEdit) return;
    try {
      await apiClient.post(`${API_FICHA_ADMIN}/ficha-sugestoes/${id}/${aceitar ? 'aceitar' : 'recusar'}`);
      showSuccess(aceitar ? 'Sugestão aceita: o valor entrou na ficha.' : 'Sugestão recusada.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível responder a sugestão.'));
    }
  };

  const confirmarApagar = async () => {
    if (!apagar || !canDelete) return;
    setOcupado(true);
    try {
      await apiClient.delete(`${API_FICHA_ADMIN}/${apagar.medium_id}/ficha`);
      showSuccess(`Dados da ficha de ${apagar.medium_nome} apagados.`);
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível apagar os dados.'));
    } finally {
      setOcupado(false);
      setApagar(null);
    }
  };

  if (subLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!noPlano) return <PlanLocked feature="Ficha espiritual" minPlan={minPlanFor('ficha_espiritual').label} />;
  if (!canView) return <PermissionDenied className="mt-4" />;

  const isDirty = JSON.stringify(form) !== JSON.stringify(inicial);
  const tipoOptions = TIPOS_CAMPO.map((t) => ({ value: t.value, label: t.label }));
  const tradicaoOptions = TRADICOES.map((t) => ({ value: t.value, label: t.label }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/mediuns">
            <ArrowLeft aria-hidden />
            Médiuns e Cambones
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Ficha espiritual"
        subtitle="Os campos da ficha da casa. Cada médium só é preenchido com a autorização dele, e só vê o que a casa liberar."
        actions={
          canInsert ? (
            <Button onClick={abrirNovo}>
              <Plus aria-hidden />
              Novo campo
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : loadError ? (
        <EmptyState
          icon={<ScrollText />}
          title="Não foi possível carregar a ficha"
          description="Confira a internet e tente de novo."
          action={
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          }
        />
      ) : (
        <>
          {pendencias.revogacoes.length > 0 && (
            <Alert variant="warning" data-testid="ficha-revogacoes">
              <AlertDescription className="flex flex-col gap-2">
                <strong>Autorização retirada</strong>
                <span>
                  Estes médiuns retiraram a autorização. Os dados já não aparecem; pela LGPD, a casa deve apagá-los.
                </span>
                <ul className="flex flex-col gap-1.5">
                  {pendencias.revogacoes.map((r) => (
                    <li key={r.medium_id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.medium_nome}</span>
                      <span className="text-sm">
                        em {isoToBrDate(r.revogado_em)} · {r.registros_guardados} registro
                        {r.registros_guardados === 1 ? '' : 's'}
                      </span>
                      {canDelete && (
                        <Button size="sm" variant="outline" onClick={() => setApagar(r)}>
                          <Trash2 aria-hidden />
                          Apagar dados
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {pendencias.sugestoes.length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="ficha-sugestoes-titulo">
              <h2 id="ficha-sugestoes-titulo" className="flex items-center gap-2 text-lg font-semibold">
                <MessageSquarePlus className="size-5 text-muted-foreground" aria-hidden />
                Sugestões dos médiuns
              </h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {pendencias.sugestoes.map((s) => (
                  <li key={s.id}>
                    <Card className="h-full gap-1.5 p-4" data-testid="ficha-sugestao">
                      <span className="text-sm text-muted-foreground">
                        {s.medium_nome} · {s.campo_rotulo}
                      </span>
                      <span className="font-medium break-words">{s.valor_sugerido}</span>
                      {s.valor_atual && (
                        <span className="text-sm text-muted-foreground">Hoje na ficha: {s.valor_atual}</span>
                      )}
                      {canEdit && (
                        <div className="mt-1 flex gap-2">
                          <Button size="sm" onClick={() => void decidir(s.id, true)}>
                            <Check aria-hidden />
                            Aceitar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void decidir(s.id, false)}>
                            <X aria-hidden />
                            Recusar
                          </Button>
                        </div>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3" aria-labelledby="ficha-campos-titulo">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="ficha-campos-titulo" className="text-lg font-semibold">
                Campos da ficha
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {canInsert && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void aplicarModelo('umbanda')}>
                      Usar modelo de Umbanda
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void aplicarModelo('candomble')}>
                      Usar modelo de Candomblé
                    </Button>
                  </>
                )}
                <span className="flex items-center gap-2">
                  <Switch id="ficha-arquivados" checked={verArquivados} onCheckedChange={setVerArquivados} />
                  <Label htmlFor="ficha-arquivados" className="text-sm font-normal">
                    Mostrar arquivados
                  </Label>
                </span>
              </div>
            </div>

            {campos.length === 0 ? (
              <EmptyState
                icon={<ScrollText />}
                title="A ficha ainda não tem campos"
                description="Comece por um modelo de Umbanda ou de Candomblé, ou crie os campos do jeito da casa."
              />
            ) : (
              <ul className="grid gap-2 md:grid-cols-2" aria-label="Campos da ficha">
                {campos.map((c) => (
                  <li key={c.id}>
                    <Card className="h-full flex-row items-start gap-3 p-4" data-testid="ficha-campo">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-medium">{c.rotulo}</span>
                        <span className="flex flex-wrap gap-1.5 text-xs">
                          <Badge variant="outline">{rotuloTradicao(c.tradicao)}</Badge>
                          <Badge variant="outline">{TIPOS_CAMPO.find((t) => t.value === c.tipo)?.label}</Badge>
                          <Badge variant="outline" className="gap-1">
                            {c.visivel_ao_medium ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                            {c.visivel_ao_medium ? 'O médium vê' : 'Só a direção'}
                          </Badge>
                          {c.medium_pode_sugerir && <Badge variant="outline">Aceita sugestão</Badge>}
                          {c.arquivado_em && <Badge variant="secondary">Arquivado</Badge>}
                        </span>
                        {c.tipo === 'lista' && c.opcoes && (
                          <span className="text-sm text-muted-foreground">{c.opcoes.join(' · ')}</span>
                        )}
                      </div>
                      {(canEdit || canDelete) && (
                        <div className="flex shrink-0 gap-1">
                          {!c.arquivado_em && canEdit && (
                            <Button variant="ghost" size="icon-sm" onClick={() => abrirEdicao(c)} aria-label={`Editar ${c.rotulo}`}>
                              <Pencil />
                            </Button>
                          )}
                          {!c.arquivado_em && canDelete && (
                            <Button variant="ghost" size="icon-sm" onClick={() => setArquivar(c)} aria-label={`Arquivar ${c.rotulo}`}>
                              <Archive />
                            </Button>
                          )}
                          {c.arquivado_em && canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void desarquivar(c)}
                              aria-label={`Trazer de volta ${c.rotulo}`}
                            >
                              <ArchiveRestore />
                            </Button>
                          )}
                        </div>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <CrudDrawer
        open={drawerOpen}
        title={editing ? 'Editar campo' : 'Novo campo'}
        subtitle="Um item da ficha espiritual dos médiuns."
        icon={<ScrollText />}
        onClose={() => setDrawerOpen(false)}
        onSave={salvar}
        saving={saving}
        saveLabel={editing ? 'Salvar' : 'Criar campo'}
        isDirty={isDirty}
        error={saveError}
      >
        <TextField
          label="Nome do campo"
          required
          fullWidth
          maxLength={80}
          value={form.rotulo}
          onChange={(e) => setField('rotulo', e.target.value)}
          placeholder="Ex.: Orixá de cabeça"
        />
        <Combobox
          label="Tipo"
          options={tipoOptions}
          value={form.tipo}
          onChange={(v) => v && setField('tipo', v as TipoCampoFicha)}
        />
        {form.tipo === 'lista' && (
          <TextField
            label="Opções"
            multiline
            rows={4}
            fullWidth
            value={form.opcoes}
            onChange={(e) => setField('opcoes', e.target.value)}
            helperText="Uma opção por linha."
          />
        )}
        <Combobox
          label="Tradição"
          options={tradicaoOptions}
          value={form.tradicao}
          onChange={(v) => v && setField('tradicao', v as TradicaoFicha)}
        />
        <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <Label htmlFor="ficha-visivel" className="flex flex-col items-start gap-0.5 font-normal">
            <span className="font-medium">O médium vê este campo</span>
            <span className="text-sm text-muted-foreground">Aparece em “Minha caminhada”, na Área do Médium.</span>
          </Label>
          <Switch
            id="ficha-visivel"
            checked={form.visivel_ao_medium}
            onCheckedChange={(v) => setField('visivel_ao_medium', v)}
          />
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <Label htmlFor="ficha-sugerir" className="flex flex-col items-start gap-0.5 font-normal">
            <span className="font-medium">O médium pode sugerir</span>
            <span className="text-sm text-muted-foreground">A sugestão só entra na ficha depois que a direção aceitar.</span>
          </Label>
          <Switch
            id="ficha-sugerir"
            checked={form.medium_pode_sugerir}
            onCheckedChange={(v) => setField('medium_pode_sugerir', v)}
          />
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={arquivar !== null}
        title="Arquivar campo"
        message={
          <>
            <strong>{arquivar?.rotulo}</strong> sai da ficha e da Área do Médium. O que já foi preenchido fica guardado e volta
            se você trouxer o campo de volta.
          </>
        }
        confirmText="Arquivar"
        loading={ocupado}
        onConfirm={() => void confirmarArquivar()}
        onCancel={() => setArquivar(null)}
      />
      <ConfirmDialog
        open={apagar !== null}
        title="Apagar dados da ficha"
        message={
          <>
            Apagar a ficha, a caminhada e as sugestões de <strong>{apagar?.medium_nome}</strong>? Não dá para desfazer. O
            cadastro do médium continua.
          </>
        }
        confirmText="Apagar dados"
        destructive
        loading={ocupado}
        onConfirm={() => void confirmarApagar()}
        onCancel={() => setApagar(null)}
      />
    </div>
  );
}
