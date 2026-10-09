/**
 * /admin/materiais — Estudos e documentos da casa para a corrente (AM-21).
 *
 * O dirigente publica links (Drive, YouTube, site), textos e pontos cantados (letra + link de
 * áudio/vídeo opcional), escolhe a categoria (texto livre com sugestões), para quem vai (toda a
 * corrente, atendimento, cambones ou grupos da corrente — como nos avisos), deixa como rascunho
 * ou publicado e arruma a ordem (setas). Sem upload de arquivo: PDF entra como link do Drive.
 *
 * Gates (CLAUDE.md): a tela (e a entrada do menu, em navConfig) só existe com `can('area_medium')`
 * — plano Basic+ E a chave do piloto; sem ela, aviso neutro. Sem `biblioteca_medium` (Pro) →
 * `PlanLocked` com `minPlanFor('biblioteca_medium')`. Sem `COMUNICADOS:view` → `PermissionDenied`.
 * Criar/editar/reordenar/excluir só aparecem com insert/edit/delete. Backend:
 * `api/v1/admin/materiais.py`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Library, Pencil, Plus, Trash2 } from 'lucide-react';
import AdminLayout from './admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { MultiCombobox, TextField } from '@/components/fields';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { corDoGrupo, type GrupoResumo } from '@/constants/correnteGrupos';
import {
  CATEGORIAS_SUGERIDAS,
  FONTE_LABEL,
  MATERIAL_CATEGORIA_MAX,
  MATERIAL_TEXTO_MAX,
  MATERIAL_TITULO_MAX,
  MATERIAL_URL_MAX,
  PDF_USE_DRIVE,
  TIPO_AJUDA,
  TIPO_LABEL,
  type MaterialFonte,
  type MaterialPublico,
  type MaterialTipo,
} from '@/constants/materiais';
import { minPlanFor } from '@/constants/plans';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

const API = '/api/v1/admin/materiais';

export interface Material {
  id: string;
  titulo: string;
  tipo: MaterialTipo;
  url: string | null;
  texto: string | null;
  fonte: MaterialFonte | null;
  youtube_id: string | null;
  categoria: string;
  publico: MaterialPublico;
  grupos?: GrupoResumo[];
  ordem: number;
  publicado: boolean;
  created_at: string;
  updated_at: string;
}

interface MateriaisResponse {
  itens: Material[];
  categorias: string[];
  limite: number;
}

interface GrupoOpcao extends GrupoResumo {
  total_membros: number;
}

export const PUBLICO_LABEL: Record<MaterialPublico, string> = {
  todos: 'Toda a corrente',
  atendimento: 'Médiuns de atendimento',
  cambones: 'Cambones',
  grupos: 'Grupos da corrente',
};

const PUBLICO_AJUDA: Record<MaterialPublico, string> = {
  todos: 'Todos os médiuns e cambones com acesso à Área',
  atendimento: 'Só quem atende na gira',
  cambones: 'Só quem é cambone',
  grupos: 'Só quem está nos grupos escolhidos (G1, Ogãs…)',
};

interface FormState {
  titulo: string;
  tipo: MaterialTipo;
  url: string;
  texto: string;
  categoria: string;
  publico: MaterialPublico;
  grupo_ids: string[];
  publicado: boolean;
}

const EMPTY_FORM: FormState = {
  titulo: '',
  tipo: 'link',
  url: '',
  texto: '',
  categoria: 'Estudos',
  publico: 'todos',
  grupo_ids: [],
  publicado: true,
};

/** Mesma regra do backend (`validar_url`): só http(s), sem espaço. */
export function urlValida(url: string): boolean {
  const u = url.trim();
  if (!/^https?:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(u) || /\s/.test(u)) return false;
  try {
    const parsed = new URL(u);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function descreverPublico(m: Pick<Material, 'publico' | 'grupos'>): string {
  if (m.publico === 'todos') return 'Toda a corrente';
  if (m.publico === 'grupos') {
    const nomes = (m.grupos ?? []).map((g) => g.nome);
    return nomes.length ? `Só ${nomes.join(', ')}` : 'Só grupos da corrente';
  }
  return `Só ${PUBLICO_LABEL[m.publico].toLowerCase()}`;
}

function descreverTipo(m: Pick<Material, 'tipo' | 'fonte'>): string {
  if (m.tipo === 'link') return m.fonte ? FONTE_LABEL[m.fonte] : TIPO_LABEL.link;
  return TIPO_LABEL[m.tipo];
}

export default function AdminMateriaisPage() {
  return (
    <AdminLayout title="Estudos e documentos">
      <AdminMateriaisContent />
    </AdminLayout>
  );
}

function AdminMateriaisContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const liberado = can('area_medium');
  const noPlano = can('biblioteca_medium');
  const canView = canGroup('comunicados', 'view');
  const canInsert = canGroup('comunicados', 'insert');
  const canEdit = canGroup('comunicados', 'edit');
  const canDelete = canGroup('comunicados', 'delete');
  const ativo = liberado && noPlano && canView;

  const [lista, setLista] = useState<Material[]>([]);
  const [categorias, setCategorias] = useState<string[]>([...CATEGORIAS_SUGERIDAS]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [movendo, setMovendo] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [grupoOpcoes, setGrupoOpcoes] = useState<GrupoOpcao[]>([]);
  const [excluir, setExcluir] = useState<Material | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    if (!ativo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const res = await apiClient.get<MateriaisResponse>(API);
      setLista(res.data.itens);
      setCategorias(res.data.categorias?.length ? res.data.categorias : [...CATEGORIAS_SUGERIDAS]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [ativo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Grupos da corrente para o público "Grupos" (AM-23) — só para quem publica ou edita.
  useEffect(() => {
    if (!ativo || !(canInsert || canEdit)) return;
    apiClient
      .get<GrupoOpcao[]>('/api/v1/admin/corrente-grupos/opcoes')
      .then((res) => setGrupoOpcoes(Array.isArray(res.data) ? res.data : []))
      .catch(() => setGrupoOpcoes([]));
  }, [ativo, canInsert, canEdit]);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrirNovo = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTouched(false);
    setSaveError(null);
    setDrawerOpen(true);
  };

  const abrirEdicao = useCallback((m: Material) => {
    setEditing(m);
    setForm({
      titulo: m.titulo,
      tipo: m.tipo,
      url: m.url ?? '',
      texto: m.texto ?? '',
      categoria: m.categoria,
      publico: m.publico,
      grupo_ids: (m.grupos ?? []).map((g) => g.id),
      publicado: m.publicado,
    });
    setTouched(false);
    setSaveError(null);
    setDrawerOpen(true);
  }, []);

  const mover = useCallback(
    async (indice: number, delta: -1 | 1) => {
      const alvo = indice + delta;
      if (!canEdit || alvo < 0 || alvo >= lista.length) return;
      const nova = [...lista];
      [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
      setLista(nova);
      setMovendo(true);
      try {
        const res = await apiClient.put<MateriaisResponse>(`${API}/ordem`, { ids: nova.map((m) => m.id) });
        setLista(res.data.itens);
      } catch (err) {
        showError(extractApiErrorMessage(err, 'Não foi possível mudar a ordem.'));
        void carregar();
      } finally {
        setMovendo(false);
      }
    },
    [canEdit, lista, showError, carregar],
  );

  const precisaUrl = form.tipo === 'link';
  const precisaTexto = form.tipo !== 'link';
  const tituloErro = touched && !form.titulo.trim() ? 'Escreva o título' : undefined;
  const urlErro =
    touched && precisaUrl && !form.url.trim()
      ? 'Cole o link'
      : touched && form.url.trim() && !urlValida(form.url)
        ? 'Use um link que comece com http:// ou https://'
        : undefined;
  const textoErro =
    touched && precisaTexto && !form.texto.trim()
      ? form.tipo === 'ponto'
        ? 'Escreva a letra do ponto'
        : 'Escreva o texto'
      : undefined;
  const semGrupo = form.publico === 'grupos' && form.grupo_ids.length === 0;
  const gruposErro = touched && semGrupo ? 'Escolha pelo menos um grupo' : undefined;

  const salvar = async () => {
    setTouched(true);
    if (!form.titulo.trim()) return;
    if (precisaUrl && !form.url.trim()) return;
    if (form.url.trim() && !urlValida(form.url)) return;
    if (precisaTexto && !form.texto.trim()) return;
    if (semGrupo) return;
    if (editing ? !canEdit : !canInsert) return;

    const payload: Record<string, unknown> = {
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      url: form.url.trim() || null,
      texto: form.texto.trim() ? form.texto : null,
      categoria: form.categoria.trim() || 'Estudos',
      publico: form.publico,
      publicado: form.publicado,
    };
    if (form.publico === 'grupos') payload.grupo_ids = form.grupo_ids;

    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await apiClient.put(`${API}/${editing.id}`, payload);
        showSuccess('Material atualizado.');
      } else {
        await apiClient.post(API, payload);
        showSuccess(form.publicado ? 'Material publicado na Área do Médium.' : 'Rascunho salvo.');
      }
      setDrawerOpen(false);
      void carregar();
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, 'Não foi possível salvar o material. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluir || !canDelete) return;
    setExcluindo(true);
    try {
      await apiClient.delete(`${API}/${excluir.id}`);
      showSuccess('Material excluído. Ele saiu da Área do Médium.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível excluir o material.'));
    } finally {
      setExcluindo(false);
      setExcluir(null);
    }
  };

  const temAcoes = canEdit || canDelete;

  const columns = useMemo<ColumnDef<Material>[]>(() => {
    const cols: ColumnDef<Material>[] = [];
    if (canEdit) {
      cols.push({
        id: 'ordem',
        header: 'Ordem',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={movendo || row.index === 0}
              onClick={() => void mover(row.index, -1)}
              aria-label={`Subir ${row.original.titulo}`}
              title="Subir"
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={movendo || row.index === lista.length - 1}
              onClick={() => void mover(row.index, 1)}
              aria-label={`Descer ${row.original.titulo}`}
              title="Descer"
            >
              <ArrowDown />
            </Button>
          </div>
        ),
      });
    }
    cols.push(
      {
        accessorKey: 'titulo',
        header: 'Título',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.titulo}</span>
            <span className="truncate text-xs text-muted-foreground">{descreverTipo(row.original)}</span>
          </div>
        ),
      },
      { accessorKey: 'categoria', header: 'Categoria', enableSorting: false },
      {
        id: 'publico',
        header: 'Para quem',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.publico === 'grupos' && (row.original.grupos?.length ?? 0) > 0 ? (
            <span className="flex flex-wrap gap-1">
              {(row.original.grupos ?? []).map((g) => (
                <GrupoChip key={g.id} grupo={g} size="sm" />
              ))}
            </span>
          ) : (
            descreverPublico(row.original)
          ),
      },
      {
        accessorKey: 'publicado',
        header: 'Situação',
        enableSorting: false,
        cell: ({ getValue }) =>
          getValue<boolean>() ? <Badge variant="secondary">Publicado</Badge> : <Badge variant="outline">Rascunho</Badge>,
      },
    );
    if (temAcoes) {
      cols.push({
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => renderAcoes(row.original),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, canDelete, temAcoes, movendo, lista.length, mover]);

  function renderAcoes(m: Material) {
    return (
      <div className="flex justify-end gap-1">
        {canEdit && (
          <Button variant="ghost" size="icon-sm" onClick={() => abrirEdicao(m)} title="Editar" aria-label={`Editar ${m.titulo}`}>
            <Pencil />
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setExcluir(m)}
            title="Excluir"
            aria-label={`Excluir ${m.titulo}`}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    );
  }

  const renderCard = (m: Material) => {
    const indice = lista.findIndex((x) => x.id === m.id);
    return (
      <div className="flex items-start gap-3 p-3" data-testid="material-card">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{m.titulo}</span>
          <span className="text-xs text-muted-foreground">
            {m.categoria} · {descreverTipo(m)} · {descreverPublico(m)}
          </span>
          {m.publicado ? (
            <Badge variant="secondary" className="self-start">
              Publicado
            </Badge>
          ) : (
            <Badge variant="outline" className="self-start">
              Rascunho
            </Badge>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={movendo || indice <= 0}
              onClick={() => void mover(indice, -1)}
              aria-label={`Subir ${m.titulo}`}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={movendo || indice === lista.length - 1}
              onClick={() => void mover(indice, 1)}
              aria-label={`Descer ${m.titulo}`}
            >
              <ArrowDown />
            </Button>
          </div>
        )}
        {temAcoes && renderAcoes(m)}
      </div>
    );
  };

  if (subLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (!liberado) {
    // Piloto da Área do Médium: sem a chave, nada de oferta de plano — só um aviso neutro.
    return (
      <EmptyState
        icon={<Library />}
        title="Estudos da Área do Médium"
        description="A Área do Médium ainda não está disponível para este terreiro."
      />
    );
  }
  if (!noPlano) {
    return <PlanLocked feature="Estudos e documentos" minPlan={minPlanFor('biblioteca_medium').label} />;
  }
  if (!canView) return <PermissionDenied className="mt-4" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Estudos e documentos"
        subtitle="Apostilas, pontos cantados, rezas e vídeos para a corrente, na Área do Médium."
        className="mb-0"
        actions={
          canInsert ? (
            <Button onClick={abrirNovo}>
              <Plus aria-hidden />
              Novo material
            </Button>
          ) : undefined
        }
      />

      {loadError ? (
        <EmptyState
          icon={<Library />}
          title="Não foi possível carregar os materiais"
          description="Confira a internet e tente de novo."
          action={
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={lista}
          getRowId={(m) => m.id}
          loading={loading}
          pageSize={300}
          renderCard={renderCard}
          emptyIcon={<Library />}
          emptyMessage="Nenhum material ainda."
          emptyDescription={
            canInsert ? 'Publique o primeiro: uma apostila do Drive, um ponto cantado ou um estudo escrito.' : undefined
          }
          data-testid="materiais-tabela"
        />
      )}

      <CrudDrawer
        open={drawerOpen}
        title={editing ? 'Editar material' : 'Novo material'}
        subtitle="Aparece na Área do Médium, em Estudos."
        icon={<Library />}
        onClose={() => setDrawerOpen(false)}
        onSave={salvar}
        saving={saving}
        saveLabel={editing ? 'Salvar' : form.publicado ? 'Publicar' : 'Salvar rascunho'}
        error={saveError}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Tipo</legend>
          <RadioGroup
            value={form.tipo}
            onValueChange={(v) => setField('tipo', v as MaterialTipo)}
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            {(Object.keys(TIPO_LABEL) as MaterialTipo[]).map((t) => (
              <Label
                key={t}
                htmlFor={`material-tipo-${t}`}
                className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id={`material-tipo-${t}`} value={t} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{TIPO_LABEL[t]}</span>
                  <span className="text-xs font-normal text-muted-foreground">{TIPO_AJUDA[t]}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>

        <TextField
          label="Título"
          required
          fullWidth
          maxLength={MATERIAL_TITULO_MAX}
          placeholder={form.tipo === 'ponto' ? 'Ex.: Ponto de Ogum' : 'Ex.: Apostila do desenvolvimento'}
          value={form.titulo}
          onChange={(e) => setField('titulo', e.target.value)}
          error={tituloErro}
        />

        <div className="flex flex-col gap-2">
          <TextField
            label="Categoria"
            fullWidth
            maxLength={MATERIAL_CATEGORIA_MAX}
            value={form.categoria}
            onChange={(e) => setField('categoria', e.target.value)}
            helperText="Os materiais aparecem agrupados por categoria."
          />
          <div className="flex flex-wrap gap-1.5" aria-label="Sugestões de categoria">
            {categorias.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={form.categoria === c ? 'default' : 'outline'}
                onClick={() => setField('categoria', c)}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>

        <TextField
          label={form.tipo === 'ponto' ? 'Link do áudio ou vídeo (opcional)' : form.tipo === 'texto' ? 'Link (opcional)' : 'Link'}
          required={precisaUrl}
          fullWidth
          type="url"
          inputMode="url"
          maxLength={MATERIAL_URL_MAX}
          placeholder="https://drive.google.com/..."
          value={form.url}
          onChange={(e) => setField('url', e.target.value)}
          error={urlErro}
          helperText={urlErro ? undefined : `${PDF_USE_DRIVE} Vídeo do YouTube toca dentro da Área.`}
        />

        <TextField
          label={form.tipo === 'ponto' ? 'Letra do ponto' : form.tipo === 'texto' ? 'Texto' : 'Descrição (opcional)'}
          required={precisaTexto}
          fullWidth
          multiline
          rows={form.tipo === 'link' ? 3 : 8}
          maxLength={MATERIAL_TEXTO_MAX}
          value={form.texto}
          onChange={(e) => setField('texto', e.target.value)}
          error={textoErro}
          helperText={textoErro ? undefined : 'Texto simples: as quebras de linha ficam e os links viram clicáveis.'}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Para quem</legend>
          <RadioGroup
            value={form.publico}
            onValueChange={(v) => setField('publico', v as MaterialPublico)}
            className="flex flex-col gap-2"
          >
            {(Object.keys(PUBLICO_LABEL) as MaterialPublico[]).map((p) => (
              <Label
                key={p}
                htmlFor={`material-publico-${p}`}
                className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id={`material-publico-${p}`} value={p} className="mt-0.5" />
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
              <p className="rounded-md border p-3 text-sm text-muted-foreground" data-testid="material-sem-grupos">
                Nenhum grupo da corrente ainda. Crie em Médiuns → Grupos.
              </p>
            ))}
        </fieldset>

        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="material-publicado" className="font-medium">
              Publicado na Área
            </Label>
            <p className="text-xs text-muted-foreground">Desligado, fica como rascunho: só o painel vê.</p>
          </div>
          <Switch id="material-publicado" checked={form.publicado} onCheckedChange={(v) => setField('publicado', v)} />
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={excluir !== null}
        title="Excluir o material?"
        message={excluir ? `"${excluir.titulo}" sai da Área do Médium e desta lista.` : ''}
        confirmText="Excluir"
        destructive
        loading={excluindo}
        onConfirm={() => void confirmarExclusao()}
        onCancel={() => setExcluir(null)}
      />
    </div>
  );
}
