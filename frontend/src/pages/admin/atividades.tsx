/**
 * /admin/atividades — "Atividades e escalas" (AM-08): agenda da casa e tipos de atividade.
 *
 * Aba "Agenda da casa": giras e atividades internas do mês (`GET /admin/atividades/calendario`),
 * filtro por tipo, e as atividades internas (faxina, ritual, reunião, desenvolvimento...) com
 * `CrudDrawer`: tipo, título, início/fim, local, orientações para a corrente, descrição e quem vê
 * na Agenda (toda a corrente ou só quem estiver na escala). Cancelar pede o motivo (a corrente
 * vê); excluir pede confirmação. Atividade interna nunca conta no limite de giras do plano e nunca
 * vai ao site (D-03). A gira de verdade continua na tela Giras.
 * Aba "Tipos e funções": `components/admin/atividades/TiposEFuncoes`.
 * Presença (AM-17): em cada gira/atividade, "Confirmações" (painel com quem vai, quem não vai e o
 * motivo, "Pôr na escala"/"Tirar da escala" — `ConfirmacoesSheet`, escalas view/insert/edit) e
 * "Chamada" (`/admin/atividades/[id]/chamada`, escalas edit; a gira cria a âncora antes).
 * AM-29: ao criar uma atividade de tipo "só escalados", o drawer já deixa escolher grupos da
 * corrente e médiuns para pôr na escala (`PorNaEscalaCampos`, só com escalas insert): depois do
 * `POST /admin/atividades` vem o `POST /{id}/convocar` e um toast só com o resumo.
 *
 * Gates (CLAUDE.md): sem `can('area_medium')` (plano + chave do piloto) a tela mostra só um aviso
 * neutro; sem `atividades_corrente` no plano, `PlanLocked`; grupo de permissão `escalas`: view para
 * ver, insert para criar, edit para editar/cancelar/reativar, delete para excluir/arquivar.
 * Backend: `api/v1/admin/atividades.py`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Ban,
  CalendarDays,
  ClipboardCheck,
  Users,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import AdminLayout from './admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { API_ATIVIDADES, TiposEFuncoes } from '@/components/admin/atividades/TiposEFuncoes';
import { ConfirmacoesSheet, type AlvoConfirmacoes } from '@/components/admin/atividades/ConfirmacoesSheet';
import {
  PorNaEscalaCampos,
  textoResultadoConvocacao,
  useGruposDaCorrente,
} from '@/components/admin/atividades/PorNaEscalaCampos';
import { TipoChip } from '@/components/atividades/TipoChip';
import { EmptyState } from '@/components/EmptyState';
import { DateTimeField, TextField } from '@/components/fields';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  OPCOES_VISIBILIDADE,
  type Atividade,
  type CalendarioItem,
  type CalendarioResponse,
  type TipoAtividade,
  type Visibilidade,
} from '@/constants/atividades';
import { minPlanFor } from '@/constants/plans';
import type { ConvocarResponse } from '@/constants/presenca';
import { addMonthsYm, currentMonthBr, formatDateTimeBr, monthLabelLong, monthRangeIso } from '@/lib/dateBr';
import { cn } from '@/lib/utils';

const TITULO_MAX = 120;
const MOTIVO_MAX = 300;

interface AtividadeForm {
  tipo_id: string;
  titulo: string;
  inicio: string | null;
  fim: string | null;
  local: string;
  orientacoes: string;
  descricao: string;
  visibilidade: Visibilidade;
}

const FORM_VAZIO: AtividadeForm = {
  tipo_id: '',
  titulo: '',
  inicio: null,
  fim: null,
  local: '',
  orientacoes: '',
  descricao: '',
  visibilidade: 'corrente',
};

/** UTC ISO da API → "YYYY-MM-DDTHH:mm" no fuso do navegador (o mesmo do DateTimeField). */
export function isoParaCampo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const campoParaIso = (local: string | null) => (local ? new Date(local).toISOString() : null);

export default function AdminAtividadesPage() {
  return (
    <AdminLayout title="Atividades e escalas">
      <AtividadesContent />
    </AdminLayout>
  );
}

function ListaSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="atividades-loading">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

function AtividadesContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const liberado = can('area_medium');
  const noPlano = can('atividades_corrente');
  const canView = canGroup('escalas', 'view');
  const canInsert = canGroup('escalas', 'insert');
  const canEdit = canGroup('escalas', 'edit');
  const canDelete = canGroup('escalas', 'delete');
  const [aba, setAba] = useState('agenda');

  if (subLoading) return <ListaSkeleton />;
  if (!liberado) {
    // Piloto da Área do Médium: sem a chave, nada de oferta de plano — só um aviso neutro.
    return (
      <EmptyState
        icon={<CalendarDays />}
        title="Atividades e escalas"
        description="A Área do Médium ainda não está disponível para este terreiro."
      />
    );
  }
  if (!noPlano) {
    return <PlanLocked feature="Atividades da casa" minPlan={minPlanFor('atividades_corrente').label} />;
  }
  if (!canView) return <PermissionDenied className="mt-4" />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Atividades e escalas"
        subtitle="Faxina, rituais, reuniões, desenvolvimento… Ficam só na Área do Médium: não vão ao site nem contam no limite de giras."
      />
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="agenda">Agenda da casa</TabsTrigger>
          <TabsTrigger value="tipos">Tipos e funções</TabsTrigger>
        </TabsList>
        <TabsContent value="agenda" className="pt-4">
          <AgendaDaCasa canInsert={canInsert} canEdit={canEdit} canDelete={canDelete} canVerGiras={canGroup('giras', 'view')} />
        </TabsContent>
        <TabsContent value="tipos" className="pt-4">
          <TiposEFuncoes canInsert={canInsert} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AgendaDaCasa({
  canInsert,
  canEdit,
  canDelete,
  canVerGiras,
}: {
  canInsert: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canVerGiras: boolean;
}) {
  const { showSuccess, showError } = useSnackbar();
  const [mes, setMes] = useState(currentMonthBr());
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [cal, setCal] = useState<CalendarioResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tipos, setTipos] = useState<TipoAtividade[]>([]);

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Atividade | null>(null);
  const [form, setForm] = useState<AtividadeForm>(FORM_VAZIO);
  const [inicial, setInicial] = useState<AtividadeForm | null>(null);
  const [tocado, setTocado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const [cancelar, setCancelar] = useState<CalendarioItem | null>(null);
  const [motivo, setMotivo] = useState('');
  const [motivoTocado, setMotivoTocado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [excluir, setExcluir] = useState<CalendarioItem | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmacoes, setConfirmacoes] = useState<AlvoConfirmacoes | null>(null);
  // AM-29: pôr na escala já na criação (tipo "só escalados").
  const [escalaGrupos, setEscalaGrupos] = useState<string[]>([]);
  const [escalaMediuns, setEscalaMediuns] = useState<string[]>([]);
  const [mediunsOpcoes, setMediunsOpcoes] = useState<{ id: string; nome: string }[]>([]);
  const escolhendoEscala = aberto && !editando && canInsert;
  const gruposDaCorrente = useGruposDaCorrente(escolhendoEscala);
  const router = useRouter();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    const { start, end } = monthRangeIso(mes);
    try {
      const res = await apiClient.get<CalendarioResponse>(`${API_ATIVIDADES}/calendario`, {
        params: { inicio: start, fim: end, ...(filtroTipo ? { tipo_id: filtroTipo } : {}) },
      });
      setCal(res.data);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [mes, filtroTipo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    apiClient
      .get<TipoAtividade[]>(`${API_ATIVIDADES}/tipos`)
      .then((res) => setTipos(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTipos([]));
  }, []);

  const tiposDeAtividade = useMemo(() => tipos.filter((t) => t.natureza === 'atividade' && !t.arquivado_em), [tipos]);
  const tipoDoForm = tipos.find((t) => t.id === form.tipo_id) ?? null;
  const mostraEscala = escolhendoEscala && tipoDoForm?.convocacao_padrao === 'so_escalados';

  useEffect(() => {
    if (!escolhendoEscala) return;
    let vivo = true;
    apiClient
      .get<{ id: string; nome: string }[]>(`${API_ATIVIDADES}/convocar/mediuns`)
      .then((res) => vivo && setMediunsOpcoes(Array.isArray(res.data) ? res.data : []))
      .catch(() => vivo && setMediunsOpcoes([]));
    return () => {
      vivo = false;
    };
  }, [escolhendoEscala]);

  const setField = <K extends keyof AtividadeForm>(k: K, v: AtividadeForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const escolherTipo = (id: string) => {
    const tipo = tipos.find((t) => t.id === id);
    setForm((f) => ({
      ...f,
      tipo_id: id,
      // Atividade nova herda a visibilidade padrão do tipo.
      visibilidade: editando ? f.visibilidade : (tipo?.visibilidade_padrao ?? f.visibilidade),
    }));
  };

  const abrirNova = () => {
    const primeiro = tiposDeAtividade[0];
    const novo: AtividadeForm = {
      ...FORM_VAZIO,
      tipo_id: primeiro?.id ?? '',
      visibilidade: primeiro?.visibilidade_padrao ?? 'corrente',
    };
    setEditando(null);
    setForm(novo);
    setInicial(novo);
    setTocado(false);
    setErroSalvar(null);
    setEscalaGrupos([]);
    setEscalaMediuns([]);
    setAberto(true);
  };

  const abrirEdicao = async (item: CalendarioItem) => {
    try {
      const res = await apiClient.get<Atividade>(`${API_ATIVIDADES}/${item.id}`);
      const a = res.data;
      const atual: AtividadeForm = {
        tipo_id: a.tipo.id ?? '',
        titulo: a.titulo,
        inicio: isoParaCampo(a.inicio),
        fim: isoParaCampo(a.fim),
        local: a.local ?? '',
        orientacoes: a.orientacoes ?? '',
        descricao: a.descricao ?? '',
        visibilidade: a.visibilidade,
      };
      setEditando(a);
      setForm(atual);
      setInicial(atual);
      setTocado(false);
      setErroSalvar(null);
      setAberto(true);
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível abrir a atividade.'));
    }
  };

  const tipoErro = tocado && !form.tipo_id ? 'Escolha o tipo' : undefined;
  const inicioErro = tocado && !form.inicio ? 'Informe o dia e a hora' : undefined;
  const fimErro =
    tocado && form.inicio && form.fim && new Date(form.fim) <= new Date(form.inicio)
      ? 'O fim precisa ser depois do início'
      : undefined;
  const escalaEscolhida = mostraEscala && (escalaGrupos.length > 0 || escalaMediuns.length > 0);
  const sujo = (inicial !== null && JSON.stringify(form) !== JSON.stringify(inicial)) || escalaEscolhida;

  const salvar = async () => {
    setTocado(true);
    if (!form.tipo_id || !form.inicio) return;
    if (form.fim && new Date(form.fim) <= new Date(form.inicio)) return;
    if (editando ? !canEdit : !canInsert) return;
    const payload = {
      tipo_id: form.tipo_id,
      titulo: form.titulo.trim() || null,
      inicio: campoParaIso(form.inicio),
      fim: campoParaIso(form.fim),
      local: form.local.trim() || null,
      orientacoes: form.orientacoes.trim() || null,
      descricao: form.descricao.trim() || null,
      visibilidade: form.visibilidade,
    };
    setSalvando(true);
    setErroSalvar(null);
    try {
      if (editando) {
        await apiClient.put(`${API_ATIVIDADES}/${editando.id}`, payload);
        showSuccess('Atividade atualizada.');
      } else {
        const criada = await apiClient.post<Atividade>(API_ATIVIDADES, payload);
        if (escalaEscolhida && criada.data?.id) {
          // Um toast só: a criação e o resumo da escala (ou o que faltou).
          try {
            const res = await apiClient.post<ConvocarResponse>(`${API_ATIVIDADES}/${criada.data.id}/convocar`, {
              medium_ids: escalaMediuns,
              grupo_ids: escalaGrupos,
            });
            showSuccess(`Atividade criada. ${textoResultadoConvocacao(res.data.resultado)}`);
          } catch (err) {
            showError(
              `Atividade criada, mas ninguém foi posto na escala: ${extractApiErrorMessage(err, 'tente pelo botão Confirmações.')}`,
            );
          }
        } else {
          showSuccess('Atividade criada. Ela aparece na Agenda da Área do Médium.');
        }
      }
      setAberto(false);
      void carregar();
    } catch (err) {
      setErroSalvar(extractApiErrorMessage(err, 'Não foi possível salvar a atividade. Tente de novo.'));
    } finally {
      setSalvando(false);
    }
  };

  const abrirCancelar = (item: CalendarioItem) => {
    setCancelar(item);
    setMotivo('');
    setMotivoTocado(false);
  };

  const confirmarCancelar = async () => {
    setMotivoTocado(true);
    if (!cancelar || !canEdit || !motivo.trim()) return;
    setCancelando(true);
    try {
      await apiClient.post(`${API_ATIVIDADES}/${cancelar.id}/cancelar`, { motivo: motivo.trim() });
      showSuccess('Atividade cancelada. A corrente vê o motivo na Agenda.');
      setCancelar(null);
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível cancelar a atividade.'));
    } finally {
      setCancelando(false);
    }
  };

  const reativar = async (item: CalendarioItem) => {
    if (!canEdit) return;
    try {
      await apiClient.post(`${API_ATIVIDADES}/${item.id}/reativar`);
      showSuccess('Atividade de volta na agenda.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível desfazer o cancelamento.'));
    }
  };

  const confirmarExcluir = async () => {
    if (!excluir || !canDelete) return;
    setExcluindo(true);
    try {
      await apiClient.delete(`${API_ATIVIDADES}/${excluir.id}`);
      showSuccess('Atividade excluída.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível excluir a atividade.'));
    } finally {
      setExcluindo(false);
      setExcluir(null);
    }
  };

  const controlaPresenca = (item: CalendarioItem) =>
    item.origem === 'gira' || Boolean(tipos.find((t) => t.id === item.tipo.id)?.controla_presenca);

  const abrirChamada = async (item: CalendarioItem) => {
    if (item.origem === 'atividade') {
      await router.push(`/admin/atividades/${item.id}/chamada`);
      return;
    }
    try {
      const res = await apiClient.post<{ atividade_id: string }>(`${API_ATIVIDADES}/da-gira/${item.id}/chamada`);
      await router.push(`/admin/atividades/${res.data.atividade_id}/chamada`);
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível abrir a chamada da gira.'));
    }
  };

  const rotuloMes = monthLabelLong(mes);
  const itens = cal?.itens ?? [];
  const algumaAcao = canEdit || canDelete;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setMes((m) => addMonthsYm(m, -1))} aria-label="Mês anterior">
            <ChevronLeft />
          </Button>
          <span className="min-w-40 text-center font-semibold first-letter:uppercase" data-testid="mes-atual">
            {rotuloMes}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => setMes((m) => addMonthsYm(m, 1))} aria-label="Próximo mês">
            <ChevronRight />
          </Button>
        </div>
        {canInsert && (
          <Button onClick={abrirNova} disabled={tiposDeAtividade.length === 0}>
            <Plus aria-hidden />
            Nova atividade
          </Button>
        )}
      </div>

      {tipos.length > 0 && (
        <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
          {[{ id: '', nome: 'Tudo' }, ...tipos.filter((t) => !t.arquivado_em)].map((t) => (
            <button
              key={t.id || 'tudo'}
              type="button"
              aria-pressed={filtroTipo === t.id}
              onClick={() => setFiltroTipo(t.id)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                filtroTipo === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
              )}
            >
              {t.nome}
            </button>
          ))}
        </div>
      )}

      {carregando ? (
        <ListaSkeleton />
      ) : erro ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Não foi possível carregar a agenda"
          description="Confira a internet e tente de novo."
          action={
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          }
        />
      ) : itens.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Nada marcado neste mês"
          description="Crie faxinas, rituais, reuniões e outras atividades da corrente."
          action={
            canInsert && tiposDeAtividade.length > 0 ? (
              <Button onClick={abrirNova}>
                <Plus aria-hidden />
                Nova atividade
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Agenda da casa">
          {itens.map((item) => (
            <li key={`${item.origem}-${item.id}`}>
              <Card
                className={cn('flex-row items-start gap-3 p-4', item.cancelada && 'opacity-75')}
                data-testid="agenda-item"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <TipoChip tipo={item.tipo} size="sm" />
                    {item.cancelada && <Badge variant="destructive">Cancelada</Badge>}
                    {item.visibilidade === 'convocados' && (
                      <Badge variant="outline">
                        <EyeOff aria-hidden /> Só quem estiver na escala
                      </Badge>
                    )}
                  </span>
                  <strong className={cn('font-semibold', item.cancelada && 'line-through')}>{item.titulo}</strong>
                  <span className="text-sm text-muted-foreground">
                    {formatDateTimeBr(item.inicio)}
                    {item.local ? ` · ${item.local}` : ''}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  {(item.origem === 'atividade' || canInsert) && !item.cancelada && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setConfirmacoes({ origem: item.origem, id: item.id, titulo: item.titulo })}
                      title="Confirmações"
                      aria-label={`Confirmações de ${item.titulo}`}
                    >
                      <Users />
                    </Button>
                  )}
                  {canEdit && !item.cancelada && controlaPresenca(item) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void abrirChamada(item)}
                      title="Chamada"
                      aria-label={`Chamada de ${item.titulo}`}
                    >
                      <ClipboardCheck />
                    </Button>
                  )}
                </div>
                {item.origem === 'gira' ? (
                  canVerGiras && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/admin/giras">
                        <ExternalLink aria-hidden /> Ver em Giras
                      </Link>
                    </Button>
                  )
                ) : (
                  algumaAcao && (
                    <div className="flex shrink-0 gap-1">
                      {canEdit && !item.cancelada && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void abrirEdicao(item)}
                            title="Editar"
                            aria-label={`Editar ${item.titulo}`}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => abrirCancelar(item)}
                            title="Cancelar"
                            aria-label={`Cancelar ${item.titulo}`}
                          >
                            <Ban />
                          </Button>
                        </>
                      )}
                      {canEdit && item.cancelada && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void reativar(item)}
                          title="Desfazer cancelamento"
                          aria-label={`Desfazer cancelamento de ${item.titulo}`}
                        >
                          <RotateCcw />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setExcluir(item)}
                          title="Excluir"
                          aria-label={`Excluir ${item.titulo}`}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  )
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CrudDrawer
        open={aberto}
        title={editando ? 'Editar atividade' : 'Nova atividade'}
        subtitle="Aparece na Agenda da Área do Médium para quem o tipo alcança. Não vai ao site."
        icon={<CalendarDays />}
        onClose={() => setAberto(false)}
        onSave={salvar}
        saving={salvando}
        saveLabel={editando ? 'Salvar' : 'Criar atividade'}
        isDirty={sujo}
        error={erroSalvar}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Tipo</legend>
          <RadioGroup value={form.tipo_id} onValueChange={escolherTipo} className="flex flex-wrap gap-2">
            {tiposDeAtividade.map((t) => (
              <Label
                key={t.id}
                htmlFor={`atividade-tipo-${t.id}`}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id={`atividade-tipo-${t.id}`} value={t.id} aria-label={t.nome} />
                <TipoChip tipo={t} size="sm" />
              </Label>
            ))}
          </RadioGroup>
          {tipoErro && <span className="text-sm text-destructive-strong">{tipoErro}</span>}
        </fieldset>

        <TextField
          label="Título"
          fullWidth
          maxLength={TITULO_MAX}
          placeholder={tipoDoForm ? `Ex.: ${tipoDoForm.nome} · G1` : 'Ex.: Faxina · G1'}
          helperText="Sem título, vale o nome do tipo."
          value={form.titulo}
          onChange={(e) => setField('titulo', e.target.value)}
        />
        <DateTimeField
          label="Início"
          required
          fullWidth
          value={form.inicio}
          onChange={(v) => setField('inicio', v)}
          error={inicioErro}
        />
        <DateTimeField
          label="Fim (opcional)"
          fullWidth
          value={form.fim}
          onChange={(v) => setField('fim', v)}
          error={fimErro}
          helperText={
            tipoDoForm?.duracao_min
              ? `Sem fim, a atividade dura ${tipoDoForm.duracao_min} minutos (padrão do tipo).`
              : undefined
          }
        />
        <TextField
          label="Local (opcional)"
          fullWidth
          maxLength={200}
          placeholder="Ex.: Terreiro, sala de estudos"
          value={form.local}
          onChange={(e) => setField('local', e.target.value)}
        />
        <TextField
          label="Orientações para a corrente (opcional)"
          fullWidth
          multiline
          rows={3}
          placeholder="O que levar, roupa, horário de chegada"
          helperText="Aparece só na Área do Médium."
          value={form.orientacoes}
          onChange={(e) => setField('orientacoes', e.target.value)}
        />
        <TextField
          label="Descrição (opcional)"
          fullWidth
          multiline
          rows={2}
          value={form.descricao}
          onChange={(e) => setField('descricao', e.target.value)}
        />
        {mostraEscala && (gruposDaCorrente.length > 0 || mediunsOpcoes.length > 0) && (
          <fieldset className="flex flex-col gap-2" data-testid="criar-por-na-escala">
            <legend className="mb-1 text-sm font-medium">Pôr na escala (opcional)</legend>
            <p className="text-xs text-muted-foreground">
              Este tipo é só para quem estiver na escala. Escolha grupos inteiros ou médiuns; dá para mudar
              depois em Confirmações.
            </p>
            <PorNaEscalaCampos
              mediuns={mediunsOpcoes}
              grupos={gruposDaCorrente}
              mediumIds={escalaMediuns}
              grupoIds={escalaGrupos}
              onMediumIds={setEscalaMediuns}
              onGrupoIds={setEscalaGrupos}
            />
          </fieldset>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Quem vê na Agenda</legend>
          <RadioGroup
            value={form.visibilidade}
            onValueChange={(v) => setField('visibilidade', v as Visibilidade)}
            className="flex flex-col gap-2"
          >
            {OPCOES_VISIBILIDADE.map((o) => (
              <Label
                key={o.valor}
                htmlFor={`atividade-visibilidade-${o.valor}`}
                className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id={`atividade-visibilidade-${o.valor}`} value={o.valor} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{o.rotulo}</span>
                  {o.ajuda && <span className="text-xs font-normal text-muted-foreground">{o.ajuda}</span>}
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
      </CrudDrawer>

      <CrudDrawer
        open={cancelar !== null}
        title="Cancelar atividade"
        subtitle={cancelar ? `${cancelar.titulo} · ${formatDateTimeBr(cancelar.inicio)}` : undefined}
        icon={<Ban />}
        onClose={() => setCancelar(null)}
        onSave={confirmarCancelar}
        saving={cancelando}
        saveLabel="Cancelar atividade"
        isDirty={motivo.trim().length > 0}
      >
        <TextField
          label="Motivo"
          required
          fullWidth
          multiline
          rows={3}
          maxLength={MOTIVO_MAX}
          placeholder="Ex.: Chuva forte, a faxina fica para o próximo sábado."
          helperText="A corrente vê o motivo na Agenda. A atividade continua no histórico."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          error={motivoTocado && !motivo.trim() ? 'Conte o motivo do cancelamento' : undefined}
        />
      </CrudDrawer>

      <ConfirmacoesSheet
        alvo={confirmacoes}
        onClose={() => setConfirmacoes(null)}
        canInsert={canInsert}
        canEdit={canEdit}
      />

      <ConfirmDialog
        open={excluir !== null}
        title="Excluir atividade"
        message={
          <>
            A atividade <strong className="text-foreground">{excluir?.titulo}</strong> sai da agenda e da Área do Médium.
            Para avisar a corrente, prefira cancelar.
          </>
        }
        confirmText="Excluir"
        destructive
        loading={excluindo}
        onConfirm={confirmarExcluir}
        onCancel={() => setExcluir(null)}
      />
    </div>
  );
}
