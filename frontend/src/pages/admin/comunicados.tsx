/**
 * /admin/comunicados — Avisos da casa para a corrente (AM-09; "Avisos" na tela, D-16).
 *
 * O dirigente publica (agora ou agendado), fixa no topo, define quando o aviso sai do ar e vê
 * quem leu e quem não leu (D-28). "Ver como o médium vê" mostra a prévia com a cara da Área;
 * "Lembrar quem não leu" monta uma mensagem pronta para colar no WhatsApp.
 *
 * Gates (CLAUDE.md): a tela inteira (e a entrada do menu, em navConfig) só existe com
 * `can('area_medium')` — plano Basic+ E a chave do piloto; sem ela, aviso neutro, sem PlanLocked.
 * Sem `COMUNICADOS:view` → `PermissionDenied`. Botões de criar/editar/excluir só aparecem com
 * insert/edit/delete. Backend: `api/v1/admin/comunicados.py`.
 *
 * Público "Grupos da corrente" (AM-23): escolhe um ou mais grupos (`/corrente-grupos/opcoes`, que
 * libera para quem tem COMUNICADOS ou MEDIUNS view, sem os nomes dos médiuns); só os membros veem
 * e o "de M" conta só eles.
 *
 * "Avisar por e-mail também" (AM-15): caixa no drawer, só com COMUNICADOS insert (criar) ou edit
 * (editar); o agendador de lembretes manda o aviso por e-mail ao público com acesso à Área.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  Copy,
  Eye,
  Megaphone,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import AdminLayout from './admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { PermissionDenied } from '@/components/gates';
import { DateTimeField, MultiCombobox, TextField } from '@/components/fields';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { corDoGrupo, type GrupoResumo } from '@/constants/correnteGrupos';
import { fraunces } from '@/components/landing/fonts';
import { AvisoLeitura, AvisoTexto, FixadoBadge, dataCurtaBr, dataHoraBr } from '@/components/avisos/AvisoLeitura';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const API = '/api/v1/admin/comunicados';
const TITULO_MAX = 120;
const CORPO_MAX = 5000;

export type Publico = 'todos' | 'atendimento' | 'cambones' | 'grupos';
export type Situacao = 'agendado' | 'publicado' | 'expirado';

export interface Comunicado {
  id: string;
  titulo: string;
  corpo: string;
  publico: Publico;
  /** Só com publico "grupos" (AM-23): grupos ativos escolhidos. */
  grupos?: GrupoResumo[];
  fixado: boolean;
  publicar_em: string;
  expira_em: string | null;
  situacao: Situacao;
  /** AM-15: o agendador manda também por e-mail a quem tem acesso à Área (uma vez por médium). */
  avisar_email?: boolean;
  created_at: string;
  updated_at: string;
  leituras: { lidos: number; total: number };
}

interface Leitor {
  medium_id: string;
  nome: string;
  lido_em: string | null;
}

interface Leituras {
  total: number;
  lidos: number;
  leram: Leitor[];
  nao_leram: Leitor[];
}

export const PUBLICO_LABEL: Record<Publico, string> = {
  todos: 'Toda a corrente',
  atendimento: 'Médiuns de atendimento',
  cambones: 'Cambones',
  grupos: 'Grupos da corrente',
};

const PUBLICO_AJUDA: Record<Publico, string> = {
  todos: 'Todos os médiuns e cambones com acesso à Área',
  atendimento: 'Só quem atende na gira',
  cambones: 'Só quem é cambone',
  grupos: 'Só quem está nos grupos escolhidos (G1, Ogãs…)',
};

interface GrupoOpcao extends GrupoResumo {
  total_membros: number;
}

interface FormState {
  titulo: string;
  corpo: string;
  publico: Publico;
  grupo_ids: string[];
  fixado: boolean;
  avisar_email: boolean;
  quando: 'agora' | 'agendar';
  /** ISO local "YYYY-MM-DDTHH:mm" (DateTimeField). */
  publicar_em: string | null;
  expira_em: string | null;
}

const EMPTY_FORM: FormState = {
  titulo: '',
  corpo: '',
  publico: 'todos',
  grupo_ids: [],
  fixado: false,
  avisar_email: false,
  quando: 'agora',
  publicar_em: null,
  expira_em: null,
};

/** ISO (UTC) → ISO local "YYYY-MM-DDTHH:mm" para o DateTimeField. */
function isoParaLocal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localParaIso(local: string | null): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Linha de situação do aviso na lista e no detalhe. */
export function descreverPublico(c: Pick<Comunicado, 'publico' | 'grupos'>): string {
  if (c.publico === 'todos') return 'Toda a corrente';
  if (c.publico === 'grupos') {
    const nomes = (c.grupos ?? []).map((g) => g.nome);
    return nomes.length ? `Só ${nomes.join(', ')}` : 'Só grupos da corrente';
  }
  return `Só ${PUBLICO_LABEL[c.publico].toLowerCase()}`;
}

export function descreverAviso(
  c: Pick<Comunicado, 'situacao' | 'publicar_em' | 'expira_em' | 'publico' | 'grupos'>,
): string {
  const partes: string[] = [];
  if (c.situacao === 'agendado') partes.push(`Agendado para ${dataHoraBr(c.publicar_em)}`);
  else if (c.situacao === 'expirado') partes.push(`Saiu do ar em ${dataCurtaBr(c.expira_em)}`);
  else {
    partes.push(`Publicado em ${dataCurtaBr(c.publicar_em)}`);
    if (c.expira_em) partes.push(`sai do ar em ${dataCurtaBr(c.expira_em)}`);
  }
  partes.push(descreverPublico(c));
  return partes.join(' · ');
}

/** Mensagem pronta para o WhatsApp (sem termo religioso além do que a casa escreveu no título). */
export function mensagemLembrete(titulo: string, link: string): string {
  return `Oi! Tem aviso novo da casa na Área do Médium: "${titulo}". Dá uma olhada lá: ${link}`;
}

function LidoPor({ lidos, total, className }: { lidos: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.round((lidos / total) * 100) : 0;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Progress value={pct} className="h-2 flex-1" aria-label={`Lido por ${lidos} de ${total}`} />
      <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
        lido por {lidos} de {total}
      </span>
    </div>
  );
}

export default function AdminComunicadosPage() {
  return (
    <AdminLayout title="Avisos">
      <AdminComunicadosContent />
    </AdminLayout>
  );
}

function ListaSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="comunicados-loading">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

function AdminComunicadosContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const liberado = can('area_medium');
  const canView = canGroup('comunicados', 'view');
  const canInsert = canGroup('comunicados', 'insert');
  const canEdit = canGroup('comunicados', 'edit');
  const canDelete = canGroup('comunicados', 'delete');

  const [lista, setLista] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Comunicado | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [detalhe, setDetalhe] = useState<Comunicado | null>(null);
  const [grupoOpcoes, setGrupoOpcoes] = useState<GrupoOpcao[]>([]);
  const [excluir, setExcluir] = useState<Comunicado | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    if (!liberado || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const res = await apiClient.get<Comunicado[]>(API);
      setLista(res.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [liberado, canView]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Grupos da corrente para o público "Grupos" (AM-23) — só para quem publica ou edita.
  useEffect(() => {
    if (!liberado || !canView || !(canInsert || canEdit)) return;
    apiClient
      .get<GrupoOpcao[]>('/api/v1/admin/corrente-grupos/opcoes')
      .then((res) => setGrupoOpcoes(Array.isArray(res.data) ? res.data : []))
      .catch(() => setGrupoOpcoes([]));
  }, [liberado, canView, canInsert, canEdit]);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrirNovo = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTouched(false);
    setSaveError(null);
    setDrawerOpen(true);
  };

  const abrirEdicao = (c: Comunicado) => {
    setEditing(c);
    setForm({
      titulo: c.titulo,
      corpo: c.corpo,
      publico: c.publico,
      grupo_ids: (c.grupos ?? []).map((g) => g.id),
      fixado: c.fixado,
      avisar_email: Boolean(c.avisar_email),
      quando: c.situacao === 'agendado' ? 'agendar' : 'agora',
      publicar_em: isoParaLocal(c.publicar_em),
      expira_em: isoParaLocal(c.expira_em),
    });
    setTouched(false);
    setSaveError(null);
    setDrawerOpen(true);
  };

  // Aviso já publicado: a data de publicação fica como está (republicar mudaria a ordem e a data).
  const podeAgendar = !editing || editing.situacao === 'agendado';
  const agora = Date.now();
  const tituloErro = touched && !form.titulo.trim() ? 'Escreva o título do aviso' : undefined;
  const corpoErro = touched && !form.corpo.trim() ? 'Escreva o texto do aviso' : undefined;
  const semGrupo = form.publico === 'grupos' && form.grupo_ids.length === 0;
  const gruposErro = touched && semGrupo ? 'Escolha pelo menos um grupo' : undefined;
  const publicarMs = form.quando === 'agendar' && form.publicar_em ? new Date(form.publicar_em).getTime() : null;
  const agendarErro =
    touched && podeAgendar && form.quando === 'agendar'
      ? !form.publicar_em
        ? 'Escolha o dia e a hora'
        : publicarMs !== null && publicarMs <= agora
          ? 'Escolha um horário que ainda não passou'
          : undefined
      : undefined;
  const expiraMs = form.expira_em ? new Date(form.expira_em).getTime() : null;
  const baseMs = podeAgendar ? (publicarMs ?? agora) : editing ? new Date(editing.publicar_em).getTime() : agora;
  const expiraErro =
    touched && expiraMs !== null && (expiraMs <= baseMs || expiraMs <= agora)
      ? 'Escolha uma data depois da publicação'
      : undefined;

  const salvar = async () => {
    setTouched(true);
    if (!form.titulo.trim() || !form.corpo.trim()) return;
    if (semGrupo) return;
    if (podeAgendar && form.quando === 'agendar' && (!form.publicar_em || (publicarMs ?? 0) <= Date.now())) return;
    if (expiraMs !== null && (expiraMs <= baseMs || expiraMs <= Date.now())) return;
    if (editing ? !canEdit : !canInsert) return;

    const payload: Record<string, unknown> = {
      titulo: form.titulo.trim(),
      corpo: form.corpo,
      publico: form.publico,
      fixado: form.fixado,
      avisar_email: form.avisar_email,
      expira_em: localParaIso(form.expira_em),
    };
    if (form.publico === 'grupos') payload.grupo_ids = form.grupo_ids;
    if (podeAgendar) payload.publicar_em = form.quando === 'agendar' ? localParaIso(form.publicar_em) : null;

    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await apiClient.put(`${API}/${editing.id}`, payload);
        showSuccess('Aviso atualizado.');
      } else {
        await apiClient.post(API, payload);
        showSuccess(form.quando === 'agendar' ? 'Aviso agendado.' : 'Aviso publicado para a corrente.');
      }
      setDrawerOpen(false);
      void carregar();
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, 'Não foi possível salvar o aviso. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluir || !canDelete) return;
    setExcluindo(true);
    try {
      await apiClient.delete(`${API}/${excluir.id}`);
      showSuccess('Aviso excluído. Ele saiu da Área do Médium.');
      if (detalhe?.id === excluir.id) setDetalhe(null);
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível excluir o aviso.'));
    } finally {
      setExcluindo(false);
      setExcluir(null);
    }
  };

  if (subLoading) return <ListaSkeleton />;
  if (!liberado) {
    // Piloto da Área do Médium: sem a chave, nada de oferta de plano — só um aviso neutro.
    return (
      <EmptyState
        icon={<Megaphone />}
        title="Avisos da Área do Médium"
        description="A Área do Médium ainda não está disponível para este terreiro."
      />
    );
  }
  if (!canView) return <PermissionDenied className="mt-4" />;

  const salvarLabel = editing
    ? 'Salvar'
    : form.quando === 'agendar'
      ? 'Agendar aviso'
      : 'Publicar aviso';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Avisos"
        subtitle="Para a corrente, na Área do Médium. Veja quem leu e quem ainda não leu."
        actions={
          canInsert ? (
            <Button onClick={abrirNovo}>
              <Plus aria-hidden />
              Novo aviso
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <ListaSkeleton />
      ) : loadError ? (
        <EmptyState
          icon={<Megaphone />}
          title="Não foi possível carregar os avisos"
          description="Confira a internet e tente de novo."
          action={
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          }
        />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="Nenhum aviso ainda"
          description="Publique o primeiro: ele aparece no celular da corrente, na Área do Médium."
          action={
            canInsert ? (
              <Button onClick={abrirNovo}>
                <Plus aria-hidden />
                Novo aviso
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Avisos publicados">
          {lista.map((c) => (
            <li key={c.id}>
              <Card className="flex-row items-start gap-2 p-0" data-testid="comunicado-item">
                <button
                  type="button"
                  onClick={() => setDetalhe(c)}
                  className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl p-4 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label={`Ver quem leu: ${c.titulo}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-base leading-snug">{c.titulo}</strong>
                    {c.fixado && <FixadoBadge />}
                    {c.situacao === 'agendado' && (
                      <Badge variant="outline" className="gap-1">
                        <CalendarClock aria-hidden />
                        Agendado
                      </Badge>
                    )}
                    {c.situacao === 'expirado' && <Badge variant="outline">Saiu do ar</Badge>}
                  </span>
                  <span className="text-sm text-muted-foreground">{descreverAviso(c)}</span>
                  {c.publico === 'grupos' && (c.grupos?.length ?? 0) > 0 && (
                    <span className="flex flex-wrap gap-1" data-testid="aviso-grupos">
                      {(c.grupos ?? []).map((g) => (
                        <GrupoChip key={g.id} grupo={g} size="sm" />
                      ))}
                    </span>
                  )}
                  {c.situacao !== 'agendado' && <LidoPor lidos={c.leituras.lidos} total={c.leituras.total} />}
                </button>
                {(canEdit || canDelete) && (
                  <div className="flex shrink-0 gap-1 p-3">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => abrirEdicao(c)}
                        title="Editar"
                        aria-label={`Editar ${c.titulo}`}
                      >
                        <Pencil />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setExcluir(c)}
                        title="Excluir"
                        aria-label={`Excluir ${c.titulo}`}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CrudDrawer
        open={drawerOpen}
        title={editing ? 'Editar aviso' : 'Novo aviso'}
        subtitle="Aparece na Área do Médium, no celular da corrente."
        icon={<Megaphone />}
        onClose={() => setDrawerOpen(false)}
        onSave={salvar}
        saving={saving}
        saveLabel={salvarLabel}
        error={saveError}
      >
        <TextField
          label="Título"
          required
          fullWidth
          maxLength={TITULO_MAX}
          placeholder="Ex.: Gira de sexta começa às 20h30"
          value={form.titulo}
          onChange={(e) => setField('titulo', e.target.value)}
          error={tituloErro}
        />
        <TextField
          label="Texto"
          required
          fullWidth
          multiline
          rows={7}
          maxLength={CORPO_MAX}
          placeholder="Escreva o aviso como falaria com a corrente."
          value={form.corpo}
          onChange={(e) => setField('corpo', e.target.value)}
          error={corpoErro}
          helperText={corpoErro ? undefined : 'Links viram clicáveis. Sem fotos nesta versão.'}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Para quem</legend>
          <RadioGroup
            value={form.publico}
            onValueChange={(v) => setField('publico', v as Publico)}
            className="flex flex-col gap-2"
          >
            {(Object.keys(PUBLICO_LABEL) as Publico[]).map((p) => (
              <Label
                key={p}
                htmlFor={`aviso-publico-${p}`}
                className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id={`aviso-publico-${p}`} value={p} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{PUBLICO_LABEL[p]}</span>
                  <span className="text-xs font-normal text-muted-foreground">{PUBLICO_AJUDA[p]}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          {form.publico === 'grupos' &&
            (grupoOpcoes.length > 0 ? (
              <MultiCombobox
                label="Grupos"
                required
                options={grupoOpcoes.map((g) => ({
                  value: g.id,
                  label: g.nome,
                  description: `${g.total_membros} ${g.total_membros === 1 ? 'médium' : 'médiuns'}`,
                  dot: corDoGrupo(g.cor),
                }))}
                value={form.grupo_ids}
                onChange={(v) => setField('grupo_ids', v)}
                placeholder="Escolha os grupos"
                searchPlaceholder="Buscar grupo..."
                emptyText="Nenhum grupo encontrado."
                countLabel={(n) => `${n} ${n === 1 ? 'grupo' : 'grupos'}`}
                error={gruposErro}
              />
            ) : (
              <p className="rounded-md border p-3 text-sm text-muted-foreground" data-testid="aviso-sem-grupos">
                Nenhum grupo da corrente ainda. Crie em Médiuns → Grupos.
              </p>
            ))}
        </fieldset>

        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="aviso-fixado" className="font-medium">
              Fixar no topo
            </Label>
            <p className="text-xs text-muted-foreground">Fica em primeiro na lista até você desafixar.</p>
          </div>
          <Switch id="aviso-fixado" checked={form.fixado} onCheckedChange={(v) => setField('fixado', v)} />
        </div>

        {(editing ? canEdit : canInsert) && (
          <div className="flex items-start gap-3 rounded-md border p-3" data-testid="aviso-email">
            <Checkbox
              id="aviso-avisar-email"
              checked={form.avisar_email}
              onCheckedChange={(v) => setField('avisar_email', v === true)}
              className="mt-0.5"
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="aviso-avisar-email" className="font-medium">
                Avisar por e-mail também
              </Label>
              <p className="text-xs text-muted-foreground">
                Quem tem acesso à Área recebe o aviso por e-mail quando ele for publicado — uma vez só. O assunto
                não mostra o título.
              </p>
            </div>
          </div>
        )}

        {podeAgendar ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Quando publicar</legend>
            <RadioGroup
              value={form.quando}
              onValueChange={(v) => setField('quando', v as FormState['quando'])}
              className="grid grid-cols-2 gap-2"
            >
              {(
                [
                  ['agora', 'Publicar agora'],
                  ['agendar', 'Agendar'],
                ] as const
              ).map(([v, label]) => (
                <Label
                  key={v}
                  htmlFor={`aviso-quando-${v}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem id={`aviso-quando-${v}`} value={v} />
                  <span className="font-medium">{label}</span>
                </Label>
              ))}
            </RadioGroup>
            {form.quando === 'agendar' && (
              <DateTimeField
                label="Publicar em"
                value={form.publicar_em}
                onChange={(v) => setField('publicar_em', v)}
                error={agendarErro}
              />
            )}
          </fieldset>
        ) : (
          editing && (
            <p className="text-sm text-muted-foreground">Publicado em {dataHoraBr(editing.publicar_em)}.</p>
          )
        )}

        <DateTimeField
          label="Sai do ar em (opcional)"
          value={form.expira_em}
          onChange={(v) => setField('expira_em', v)}
          error={expiraErro}
          helperText={expiraErro ? undefined : 'Deixe em branco para o aviso ficar até você excluir.'}
        />

        <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
          <Eye aria-hidden />
          Ver como o médium vê
        </Button>
      </CrudDrawer>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Como o médium vê</DialogTitle>
            <DialogDescription>Assim o aviso aparece no celular, na Área do Médium.</DialogDescription>
          </DialogHeader>
          <div
            data-testid="aviso-preview"
            className={cn(
              fraunces.variable,
              'medium-terra max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-background p-4 text-foreground',
            )}
          >
            <AvisoLeitura
              tituloAs="h3"
              titulo={form.titulo.trim() || 'Título do aviso'}
              corpo={form.corpo.trim() || 'O texto aparece aqui.'}
              fixado={form.fixado}
              assinatura={`Direção da casa · ${
                podeAgendar && form.quando === 'agendar' && form.publicar_em
                  ? dataCurtaBr(localParaIso(form.publicar_em))
                  : 'hoje'
              }`}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Voltar a editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DetalheAviso
        aviso={detalhe}
        onClose={() => setDetalhe(null)}
        onEdit={canEdit ? (c) => { setDetalhe(null); abrirEdicao(c); } : undefined}
      />

      <ConfirmDialog
        open={excluir !== null}
        title="Excluir aviso"
        message={
          <>
            O aviso <strong className="text-foreground">{excluir?.titulo}</strong> sai da Área do Médium e da lista.
          </>
        }
        confirmText="Excluir"
        destructive
        loading={excluindo}
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluir(null)}
      />
    </div>
  );
}

function ListaNomes({ itens, vazio, lidos }: { itens: Leitor[]; vazio: string; lidos?: boolean }) {
  if (itens.length === 0) return <p className="py-4 text-sm text-muted-foreground">{vazio}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border">
      {itens.map((l) => (
        <li key={l.medium_id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
          <span className="font-medium">{l.nome}</span>
          {lidos && l.lido_em && <span className="text-xs text-muted-foreground">{dataHoraBr(l.lido_em)}</span>}
        </li>
      ))}
    </ul>
  );
}

function DetalheAviso({
  aviso,
  onClose,
  onEdit,
}: {
  aviso: Comunicado | null;
  onClose: () => void;
  onEdit?: (c: Comunicado) => void;
}) {
  const { showSuccess, showError } = useSnackbar();
  const [leituras, setLeituras] = useState<Leituras | null>(null);
  const [erro, setErro] = useState(false);
  const [aba, setAba] = useState<'nao' | 'sim'>('nao');
  const [lembrarOpen, setLembrarOpen] = useState(false);

  useEffect(() => {
    if (!aviso) return;
    let alive = true;
    setLeituras(null);
    setErro(false);
    setAba('nao');
    apiClient
      .get<Leituras>(`${API}/${aviso.id}/leituras`)
      .then((res) => alive && setLeituras(res.data))
      .catch(() => alive && setErro(true));
    return () => {
      alive = false;
    };
  }, [aviso]);

  const mensagem = useMemo(() => {
    if (!aviso) return '';
    const origem = typeof window !== 'undefined' ? window.location.origin : '';
    return mensagemLembrete(aviso.titulo, `${origem}/medium/avisos/${aviso.id}`);
  }, [aviso]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensagem);
      showSuccess('Mensagem copiada. Cole no WhatsApp.');
    } catch {
      showError('Não foi possível copiar. Selecione o texto e copie.');
    }
  };

  const pct = leituras && leituras.total > 0 ? Math.round((leituras.lidos / leituras.total) * 100) : 0;

  return (
    <>
      <Sheet open={aviso !== null} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 min-[640px]:max-w-[480px]">
          {aviso && (
            <>
              <SheetHeader className="gap-1 border-b px-6 pt-6 pb-4">
                <SheetTitle className="pr-8 text-lg font-bold">{aviso.titulo}</SheetTitle>
                <SheetDescription>{descreverAviso(aviso)}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-5 px-6 py-5">
                {aviso.situacao === 'agendado' ? (
                  <p className="text-sm text-muted-foreground">
                    Ainda não publicado: a corrente vê o aviso a partir de {dataHoraBr(aviso.publicar_em)}.
                  </p>
                ) : erro ? (
                  <p className="text-sm text-destructive-strong">Não foi possível carregar quem leu.</p>
                ) : !leituras ? (
                  <Skeleton className="h-24 w-full" />
                ) : leituras.total === 0 ? (
                  <EmptyState
                    compact
                    icon={<Users />}
                    title="Ninguém deste público tem acesso à Área ainda"
                    description="Convide a corrente pela tela Médiuns (Acesso à Área)."
                  />
                ) : (
                  <>
                    <div className="flex flex-col gap-2 rounded-xl border p-4">
                      <div className="flex items-baseline justify-between">
                        <b className="text-2xl tabular-nums">
                          {leituras.lidos} de {leituras.total}
                        </b>
                        <span className="text-sm text-muted-foreground">leram</span>
                      </div>
                      <Progress value={pct} aria-label={`Lido por ${leituras.lidos} de ${leituras.total}`} />
                    </div>
                    <Tabs value={aba} onValueChange={(v) => setAba(v as 'nao' | 'sim')}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="nao">Ainda não leram ({leituras.nao_leram.length})</TabsTrigger>
                        <TabsTrigger value="sim">Leram ({leituras.leram.length})</TabsTrigger>
                      </TabsList>
                      <TabsContent value="nao" className="mt-3 flex flex-col gap-3 data-[state=inactive]:hidden">
                        <ListaNomes itens={leituras.nao_leram} vazio="Todo mundo já leu." />
                        {leituras.nao_leram.length > 0 && (
                          <Button type="button" variant="outline" onClick={() => setLembrarOpen(true)}>
                            <MessageCircle aria-hidden />
                            Lembrar quem não leu
                          </Button>
                        )}
                      </TabsContent>
                      <TabsContent value="sim" className="mt-3 data-[state=inactive]:hidden">
                        <ListaNomes itens={leituras.leram} vazio="Ninguém leu ainda." lidos />
                      </TabsContent>
                    </Tabs>
                  </>
                )}

                <Collapsible className="rounded-lg border">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&[data-state=open]>svg]:rotate-180">
                    Ver o texto do aviso
                    <ChevronDown className="size-4 transition-transform" aria-hidden />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t px-3 py-3 text-sm">
                    <AvisoTexto texto={aviso.corpo} />
                  </CollapsibleContent>
                </Collapsible>

                {onEdit && (
                  <Button type="button" variant="ghost" className="self-start" onClick={() => onEdit(aviso)}>
                    <Pencil aria-hidden />
                    Editar aviso
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={lembrarOpen} onOpenChange={setLembrarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lembrar quem não leu</DialogTitle>
            <DialogDescription>Copie a mensagem e mande no grupo ou para cada pessoa.</DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border bg-muted p-3 text-sm break-words" data-testid="mensagem-lembrete">
            {mensagem}
          </p>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button asChild variant="outline">
              <a href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                Abrir o WhatsApp
              </a>
            </Button>
            <Button type="button" onClick={() => void copiar()}>
              <Copy aria-hidden />
              Copiar mensagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
