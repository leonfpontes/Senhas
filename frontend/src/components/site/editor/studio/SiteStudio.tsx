/**
 * SiteStudio — o estúdio do site do terreiro (beta "Novo construtor do site"), em tela cheia,
 * no padrão dos construtores de mercado (Wix, Squarespace, Framer):
 *
 *   ┌ barra superior: voltar ao painel · nome e situação · aparelho · desfazer · visualizar · publicar
 *   ├ barra de ferramentas (ícones) → painel: Seções, Adicionar, Estilo, Próximos passos, Configurações, Histórico
 *   ├ tela: o site de verdade, editável com um clique (texto direto nele, "+" entre seções)
 *   └ painel da seção escolhida (campos, duplicar, ocultar, excluir)
 *
 * No celular a tela ocupa tudo, os painéis abrem como gaveta de baixo e há uma barra inferior.
 * Site sem seções abre no começo (perguntas, modelos ou do zero).
 *
 * Usa o mesmo `useSiteEditor` do construtor antigo: rascunho com salvamento automático,
 * conflito de versão, histórico, publicar e despublicar continuam iguais.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CloudUpload,
  ExternalLink,
  Eye,
  GlobeLock,
  History,
  Keyboard,
  Layers,
  ListChecks,
  Loader2,
  Monitor,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Settings2,
  Share2,
  Smartphone,
  Tablet,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { apiClient } from '@/services/api_client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { ShareLinkDialog } from '@/components/admin/ShareLinkDialog';
import type { PublicSiteData, SiteGira } from '../../types';
import { sectionLabel, siteBrandColor } from '../../lib';
import type { SiteEditing } from '../../EditableFrame';
import { useSiteEditor } from '../useSiteEditor';
import { HistoryPanel } from '../HistoryPanel';
import { PublishCheck } from '../PublishCheck';
import { StudioCanvas, DEVICE_LABEL, type StudioDevice } from './StudioCanvas';
import { StudioStart } from './StudioStart';
import { Inspector } from './Inspector';
import { buildBlocks, decodeBlockDrag, existingFor, type Block } from './blocks';
import { AddPanel, LayersPanel, NextStepsPanel, PanelHeader, SettingsPanel, StyleRailPanel, buildNextSteps, type NextStep } from './panels';

type PanelId = 'secoes' | 'adicionar' | 'estilo' | 'passos' | 'config' | 'historico';

const PANELS: { id: PanelId; label: string; icon: React.ReactNode }[] = [
  { id: 'secoes', label: 'Seções', icon: <Layers /> },
  { id: 'adicionar', label: 'Adicionar', icon: <Plus /> },
  { id: 'estilo', label: 'Estilo', icon: <Palette /> },
  { id: 'passos', label: 'Passos', icon: <ListChecks /> },
  { id: 'config', label: 'Ajustes', icon: <Settings2 /> },
  { id: 'historico', label: 'Histórico', icon: <History /> },
];

/** Foco num campo de texto: atalhos de teclado são do campo, não do estúdio. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Giras do terreiro para a prévia (API admin; sem permissão, a prévia usa exemplos). */
function useAdminGiras(enabled: boolean): SiteGira[] {
  const [giras, setGiras] = useState<SiteGira[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiClient
      .get('/api/v1/admin/giras?limit=20')
      .then((res) => {
        if (cancelled || !Array.isArray(res.data)) return;
        const now = Date.now();
        setGiras(
          (res.data as Array<Record<string, unknown>>)
            .filter((g) => g.data_inicio && new Date(String(g.data_inicio)).getTime() >= now - 6 * 3600 * 1000)
            .map((g) => ({
              id: String(g.id),
              nome: String(g.nome ?? ''),
              data_hora: g.data_inicio ? String(g.data_inicio) : null,
              descricao: g.descricao ? String(g.descricao) : null,
              has_tickets: g.max_tickets != null,
              has_sponsor_tickets: g.sponsor_max_tickets != null,
              release_start_at: g.release_start_at ? String(g.release_start_at) : null,
              release_end_at: g.release_end_at ? String(g.release_end_at) : null,
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return giras;
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl + Z', 'Desfazer'],
  ['Ctrl + Shift + Z', 'Refazer'],
  ['Ctrl + D', 'Duplicar a seção escolhida'],
  ['Alt + ↑ / ↓', 'Subir ou descer a seção escolhida'],
  ['Delete', 'Excluir a seção escolhida'],
  ['Esc', 'Fechar o painel da seção ou sair da visualização'],
  ['P', 'Visualizar o site sem as ferramentas'],
];

export interface SiteStudioProps {
  canEdit: boolean;
  canInsert: boolean;
}

export function SiteStudio({ canEdit, canInsert }: SiteStudioProps) {
  const editor = useSiteEditor({ enabled: true, canEdit });
  const isPhone = useMediaQuery('(max-width: 899px)');
  const roomy = useMediaQuery('(min-width: 1280px)');
  // Tela larga cabe painel + site + seção; abaixo disso o painel fecha ao clicar no site (como no Wix).
  const wide = useMediaQuery('(min-width: 1600px)');
  const giras = useAdminGiras(!editor.loading);

  const [panel, setPanel] = useState<PanelId | null>('secoes');
  const [sheetPanel, setSheetPanel] = useState<PanelId | null>(null);
  const [device, setDevice] = useState<StudioDevice>('desktop');
  const [previewMode, setPreviewMode] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  /** Bloco sendo arrastado da gaveta "Adicionar". */
  const [dragBlock, setDragBlock] = useState<Block | null>(null);
  const [scroll, setScroll] = useState<{ id: string | null; key: number }>({ id: null, key: 0 });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const router = useRouter();

  /** Volta ao painel sem perder nada: rascunho é salvo antes; site no ar com alterações pergunta. */
  const leave = async () => {
    if (editor.dirty && canEdit) {
      if (!editor.isPublished && editor.errorCount === 0 && (await editor.save({ silent: true }))) {
        editor.releaseLeaveGuard();
        void router.push('/admin');
        return;
      }
      setConfirmLeave(true);
      return;
    }
    void router.push('/admin');
  };

  const shownDevice: StudioDevice = isPhone ? 'mobile' : device;
  const sections = editor.sections;
  const selected = editor.selected;
  const selectedIndex = selected ? sections.findIndex((s) => s.id === selected.id) : -1;
  const showStart = !editor.loading && !editor.loadError && sections.length === 0;
  const upload = canInsert && canEdit ? editor.uploadImage : undefined;
  const busy = editor.saving || editor.publishing;

  // Painel aberto: lateral no computador, gaveta no celular.
  // Painel aberto antes da gaveta "Adicionar", para voltar a ele ao cancelar.
  const beforeAdd = useRef<PanelId | null>(null);
  const openPanel = (id: PanelId) => {
    if (id === 'adicionar' && !isPhone && panel !== 'adicionar') beforeAdd.current = panel;
    if (isPhone) setSheetPanel(id);
    else setPanel((p) => (p === id && id !== 'adicionar' ? null : id));
  };

  const select = (id: string, scrollTo = true) => {
    editor.setSelectedId(id);
    if (scrollTo) setScroll((s) => ({ id, key: s.key + 1 }));
    if (isPhone) setSheetPanel(null);
  };

  const insertIndex = insertAt ?? (selectedIndex >= 0 ? selectedIndex + 1 : sections.length);
  const insertHint =
    insertIndex >= sections.length ? 'no fim do site' : insertIndex === 0 ? 'no começo do site' : `depois de "${sectionLabel(sections[insertIndex - 1].section_type)}"`;

  const blocks = useMemo(() => buildBlocks(true), []);

  /** Coloca o bloco (seção com o jeito escolhido) na posição `index`. */
  const placeBlock = (block: Block, index: number) => {
    const existing = existingFor(block, sections);
    if (existing) {
      select(existing.id);
      toast.info(`${sectionLabel(block.type)} já está no site. Ela só pode aparecer uma vez.`);
      return;
    }
    const id = editor.insertSection(block.type, index, block.config);
    setInsertAt(null);
    setScroll((s) => ({ id, key: s.key + 1 }));
    if (isPhone) setSheetPanel(null);
  };

  const addSection = (block: Block) => placeBlock(block, insertIndex);

  /** Fecha a gaveta "Adicionar" sem adicionar nada e volta para a lista de seções. */
  const closeAdd = () => {
    setInsertAt(null);
    setDragBlock(null);
    if (isPhone) setSheetPanel(null);
    else setPanel(beforeAdd.current ?? 'secoes');
    beforeAdd.current = null;
  };
  const addOpen = isPhone ? sheetPanel === 'adicionar' : panel === 'adicionar';

  const dropBlock = (raw: string, index: number) => {
    setDragBlock(null);
    const block = decodeBlockDrag(raw, blocks);
    if (block) placeBlock(block, index);
  };

  const duplicate = (id: string) => {
    const copy = editor.duplicateSection(id);
    if (copy) {
      setScroll((s) => ({ id: copy, key: s.key + 1 }));
      toast.success('Seção duplicada.');
    }
  };

  const { undo, redo } = editor;
  // Atalhos de teclado (fora de campos de texto).
  useEffect(() => {
    if (!canEdit && !previewMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') {
        if (previewMode) setPreviewMode(false);
        else if (addOpen) closeAdd();
        else editor.setSelectedId(null);
        return;
      }
      if (!canEdit) return;
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) {
        e.preventDefault();
        redo();
      } else if (mod && k === 'd' && editor.selectedId) {
        e.preventDefault();
        duplicate(editor.selectedId);
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && editor.selectedId) {
        e.preventDefault();
        editor.moveSection(editor.selectedId, e.key === 'ArrowUp' ? 'up' : 'down');
        setScroll((s) => ({ id: editor.selectedId, key: s.key + 1 }));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selectedId && !mod) {
        e.preventDefault();
        setDeleteId(editor.selectedId);
      } else if (k === 'p' && !mod && !e.altKey) {
        setPreviewMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, previewMode, undo, redo, editor.selectedId, editor.moveSection, addOpen]);

  useEffect(() => {
    if (panel === 'historico' || sheetPanel === 'historico') void editor.loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, sheetPanel]);

  const previewSite: PublicSiteData | null = useMemo(
    () =>
      editor.site
        ? {
            id: editor.site.id,
            slug: editor.site.slug,
            status: editor.site.status,
            template: editor.site.template,
            meta_title: editor.site.meta_title,
            meta_description: editor.site.meta_description,
            sections,
            upcoming_giras: giras,
          }
        : null,
    [editor.site, sections, giras],
  );

  const editing: SiteEditing | undefined = previewMode
    ? undefined
    : {
        selectedId: editor.selectedId,
        onSelect: (id) => {
          select(id, false);
          if (!wide) setPanel(null);
        },
        onMove: editor.moveSection,
        onToggleHidden: editor.toggleHidden,
        onDelete: (id) => setDeleteId(id),
        onInsert: (index) => {
          setInsertAt(index);
          openPanel('adicionar');
        },
        onPatch: editor.patchConfig,
        labelOf: sectionLabel,
        canEdit,
      };

  const steps = useMemo(() => buildNextSteps(editor.site, sections, editor.dirty), [editor.site, sections, editor.dirty]);
  const pendingSteps = steps.filter((s) => !s.done && s.id !== 'divulgar').length;

  const onStep = (step: NextStep) => {
    if (step.sectionId) return select(step.sectionId);
    if (step.addType) {
      const id = editor.insertSection(step.addType, step.addType === 'HERO' ? 0 : sections.length);
      setScroll((s) => ({ id, key: s.key + 1 }));
      if (isPhone) setSheetPanel(null);
      return;
    }
    if (step.action === 'settings') return openPanel('config');
    if (step.action === 'publish') return setCheckOpen(true);
    if (step.action === 'share') return editor.isPublished ? setShareOpen(true) : setCheckOpen(true);
  };

  const doPublish = async () => {
    const ok = await editor.publish();
    if (ok) {
      setCheckOpen(false);
      setShareOpen(true);
    }
  };

  const publishDisabled = !canEdit || busy || editor.loading || editor.uploading || (editor.isPublished && !editor.dirty);
  const publishLabel = editor.isPublished ? (editor.dirty ? 'Publicar alterações' : 'Publicado') : 'Publicar';
  const siteName = String(sections.find((s) => s.section_type === 'HERO')?.config.title || '') || 'Meu site';

  const statusPill = (() => {
    const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap';
    switch (editor.status) {
      case 'published':
        return (
          <span className={cn(base, 'bg-success/15 text-success-strong')} data-testid="site-status">
            <Check className="size-3" aria-hidden /> No ar
          </span>
        );
      case 'published-dirty':
        return (
          <span className={cn(base, 'bg-warning/15 text-warning-strong')} data-testid="site-status">
            <AlertCircle className="size-3" aria-hidden /> Alterações não publicadas
          </span>
        );
      case 'unpublished':
        return (
          <span className={cn(base, 'bg-muted text-muted-foreground')} data-testid="site-status">
            <GlobeLock className="size-3" aria-hidden /> Fora do ar
          </span>
        );
      default:
        return (
          <span className={cn(base, 'bg-muted text-muted-foreground')} data-testid="site-status">
            Rascunho
          </span>
        );
    }
  })();

  const saveState = editor.saving ? (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin" aria-hidden /> Salvando…
    </span>
  ) : editor.errorCount > 0 ? (
    <span className="text-xs text-destructive">
      {editor.errorCount} {editor.errorCount === 1 ? 'campo precisa' : 'campos precisam'} de ajuste
    </span>
  ) : editor.dirty && editor.isPublished ? (
    <span className="text-xs text-muted-foreground">O site no ar só muda quando você publicar</span>
  ) : editor.dirty ? (
    <span className="text-xs text-muted-foreground">Salvando em instantes</span>
  ) : editor.lastSavedAt ? (
    <span className="text-xs text-muted-foreground">Salvo às {editor.lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
  ) : null;

  const renderPanel = (id: PanelId) => {
    switch (id) {
      case 'secoes':
        return (
          <LayersPanel
            sections={sections}
            selectedId={editor.selectedId}
            errorsById={editor.errorsById}
            canEdit={canEdit}
            onSelect={(sid) => select(sid)}
            onMove={editor.moveSection}
            onMoveTo={editor.moveSectionTo}
            onToggleHidden={editor.toggleHidden}
            onDuplicate={duplicate}
            onDelete={(sid) => setDeleteId(sid)}
            onAdd={() => {
              setInsertAt(null);
              openPanel('adicionar');
            }}
          />
        );
      case 'adicionar':
        return canEdit ? (
          <AddPanel
            sections={sections}
            novoConstrutor
            insertHint={insertHint}
            accent={siteBrandColor(sections)}
            onAdd={addSection}
            onGoTo={(sid) => select(sid)}
            onDragBlock={setDragBlock}
            onClose={closeAdd}
          />
        ) : (
          <PanelHeader title="Adicionar seção" description="Você só pode ver o site." />
        );
      case 'estilo':
        return <StyleRailPanel sections={sections} canEdit={canEdit} onTransform={editor.transformAll} />;
      case 'passos':
        return <NextStepsPanel steps={steps} canEdit={canEdit} onStep={onStep} />;
      case 'config':
        return <SettingsPanel key={editor.site?.updated_at} site={editor.site} sections={sections} publicUrl={editor.publicUrl} canEdit={canEdit} onSave={editor.saveSettings} />;
      case 'historico':
        return (
          <div className="flex min-h-0 flex-1 flex-col">
            <PanelHeader title="Histórico" description="Cada publicação e cada rascunho importante ficam guardados." />
            <HistoryPanel versions={editor.versions} loading={editor.versionsLoading} canEdit={canEdit} hasChanges={editor.dirty} onRestore={editor.restore} />
          </div>
        );
    }
  };

  const inspector = selected && (
    <Inspector
      section={selected}
      index={selectedIndex}
      total={sections.length}
      errors={editor.errorsById[selected.id] ?? []}
      canEdit={canEdit}
      upload={upload}
      onChange={(config) => editor.updateConfig(selected.id, config)}
      onMove={(dir) => {
        editor.moveSection(selected.id, dir);
        setScroll((s) => ({ id: selected.id, key: s.key + 1 }));
      }}
      onDuplicate={() => duplicate(selected.id)}
      onToggleHidden={() => editor.toggleHidden(selected.id)}
      onDelete={() => setDeleteId(selected.id)}
      onClose={isPhone ? undefined : () => editor.setSelectedId(null)}
    />
  );

  const deviceToggle = (
    <ToggleGroup type="single" variant="outline" size="sm" value={device} onValueChange={(v) => v && setDevice(v as StudioDevice)} aria-label="Ver o site como">
      {(
        [
          ['desktop', <Monitor key="d" />],
          ['tablet', <Tablet key="t" />],
          ['mobile', <Smartphone key="m" />],
        ] as const
      ).map(([d, icon]) => (
        <ToggleGroupItem key={d} value={d} aria-label={DEVICE_LABEL[d]} title={DEVICE_LABEL[d]}>
          {icon}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  const deleteTarget = deleteId ? sections.find((s) => s.id === deleteId) : null;

  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-background text-foreground" data-testid="site-studio">
      {/* ── Barra superior ── */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-2 sm:px-3">
        <Button variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => void leave()} aria-label="Voltar ao painel">
          <ArrowLeft aria-hidden /> <span className="hidden lg:inline">Painel</span>
        </Button>
        <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col justify-center sm:flex-none sm:max-w-[34%]">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{siteName}</h1>
            {!editor.loading && statusPill}
          </div>
          <div className="hidden min-h-4 sm:block">{canEdit && saveState}</div>
        </div>

        <div className="hidden flex-1 justify-center md:flex">{!showStart && !isPhone && !editor.loading && deviceToggle}</div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {canEdit && !showStart && (
            <>
              <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!editor.canUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">
                <Undo2 />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!editor.canRedo} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" className="hidden sm:inline-flex">
                <Redo2 />
              </Button>
            </>
          )}
          {!showStart && !editor.loading && (
            <Button variant={previewMode ? 'secondary' : 'ghost'} size="sm" onClick={() => setPreviewMode((v) => !v)} title="Visualizar (P)">
              {previewMode ? <Pencil aria-hidden /> : <Eye aria-hidden />}
              <span className="hidden sm:inline">{previewMode ? 'Editar' : 'Visualizar'}</span>
            </Button>
          )}
          {canEdit && !showStart && (
            <Button size="sm" onClick={() => setCheckOpen(true)} disabled={publishDisabled} data-testid="publish-button">
              {editor.publishing ? <Loader2 className="animate-spin" aria-hidden /> : editor.isPublished && !editor.dirty ? <Check aria-hidden /> : <CloudUpload aria-hidden />}
              {publishLabel}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {editor.isPublished && (
                <>
                  <DropdownMenuItem asChild>
                    <a href={editor.publicUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> Abrir o site publicado
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setShareOpen(true)}>
                    <Share2 /> Divulgar o site
                  </DropdownMenuItem>
                </>
              )}
              {canEdit && (
                <DropdownMenuItem onSelect={() => void editor.save()} disabled={!editor.dirty || busy || editor.errorCount > 0}>
                  <Save /> Salvar rascunho agora
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => void editor.reload()} disabled={busy}>
                <RefreshCw /> Recarregar
              </DropdownMenuItem>
              {!isPhone && (
                <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                  <Keyboard /> Atalhos do teclado
                </DropdownMenuItem>
              )}
              {canEdit && editor.isPublished && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmUnpublish(true)} disabled={busy}>
                    <GlobeLock /> Tirar o site do ar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {!canEdit && !editor.loading && (
        <p className="border-b border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground" role="status">
          Você pode ver o site, mas não alterar. Peça ao administrador da casa a permissão de editar o site.
        </p>
      )}

      {/* ── Corpo ── */}
      {editor.loading ? (
        <div className="flex min-h-0 flex-1 gap-4 p-4" aria-busy="true" data-testid="site-editor-loading">
          <Skeleton className="hidden h-full w-64 md:block" />
          <Skeleton className="h-full flex-1" />
        </div>
      ) : editor.loadError ? (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Não foi possível carregar o site</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              {editor.loadError}
              <Button variant="outline" size="sm" className="self-start" onClick={() => void editor.reload()}>
                <RefreshCw aria-hidden /> Tentar de novo
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : showStart ? (
        <StudioStart
          slug={editor.site?.slug ?? ''}
          canEdit={canEdit}
          onCreate={(drafts) => {
            editor.replaceAll(drafts);
            editor.setSelectedId(null);
            setPanel('passos');
          }}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Barra de ferramentas (computador) */}
          {!isPhone && !previewMode && (
            <nav aria-label="Ferramentas do site" className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-2">
              {PANELS.map((p) => {
                const on = panel === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (p.id === 'adicionar') {
                        if (panel === 'adicionar') return closeAdd();
                        setInsertAt(null);
                      }
                      openPanel(p.id);
                    }}
                    aria-pressed={on}
                    className={cn(
                      'relative flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-5',
                      on ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {p.icon}
                    {p.label}
                    {p.id === 'passos' && pendingSteps > 0 && (
                      <span className="absolute top-1 right-2 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white" aria-label={`${pendingSteps} passos a fazer`}>
                        {pendingSteps}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Painel da ferramenta (computador) */}
          {!isPhone && !previewMode && panel && (
            <aside className={cn('flex shrink-0 flex-col border-r border-border bg-card transition-[width]', panel === 'adicionar' ? 'w-[360px]' : 'w-[300px]')} aria-label="Painel">
              {renderPanel(panel)}
            </aside>
          )}

          {/* Tela */}
          {previewSite && (
            <StudioCanvas
              site={previewSite}
              device={shownDevice}
              editing={editing}
              scrollToId={scroll.id}
              scrollKey={scroll.key}
              className={cn(isPhone && !previewMode && 'pb-16')}
              draggingLabel={dragBlock ? (dragBlock.variant ? `${dragBlock.label} · ${dragBlock.variant}` : dragBlock.label) : null}
              onDropBlock={isPhone ? undefined : dropBlock}
            />
          )}

          {/* Painel da seção (computador) */}
          {!isPhone && !previewMode && selected && (
            <aside className={cn('flex shrink-0 flex-col border-l border-border bg-card', roomy ? 'w-[380px]' : 'w-[340px]')} aria-label="Seção escolhida">
              {inspector}
            </aside>
          )}
        </div>
      )}

      {/* Visualização: botão para voltar a editar */}
      {previewMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[46] flex justify-center">
          <Button className="pointer-events-auto shadow-lg" onClick={() => setPreviewMode(false)}>
            <Pencil aria-hidden /> Voltar a editar
          </Button>
        </div>
      )}

      {/* Barra inferior (celular) */}
      {isPhone && !showStart && !editor.loading && !previewMode && (
        <nav aria-label="Ferramentas do site" className="fixed inset-x-0 bottom-0 z-[46] flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
          {PANELS.filter((p) => p.id !== 'historico').map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (p.id === 'adicionar') setInsertAt(null);
                openPanel(p.id);
              }}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground [&_svg]:size-5"
            >
              {p.icon}
              {p.label}
              {p.id === 'passos' && pendingSteps > 0 && <span className="absolute top-1 right-[calc(50%-18px)] size-2 rounded-full bg-brand" aria-hidden />}
            </button>
          ))}
        </nav>
      )}

      {/* Painéis no celular */}
      <Sheet open={isPhone && sheetPanel !== null} onOpenChange={(o) => !o && setSheetPanel(null)}>
        <SheetContent side="bottom" className="z-[60] flex h-[82vh] flex-col gap-0 rounded-t-2xl p-0">
          <SheetTitle className="sr-only">{PANELS.find((p) => p.id === sheetPanel)?.label}</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col pt-6">{sheetPanel && renderPanel(sheetPanel)}</div>
        </SheetContent>
      </Sheet>

      {/* Seção escolhida no celular */}
      <Sheet open={isPhone && selected !== null && !previewMode} onOpenChange={(o) => !o && editor.setSelectedId(null)}>
        <SheetContent side="bottom" className="z-[60] flex h-[82vh] flex-col gap-0 rounded-t-2xl p-0">
          <SheetTitle className="sr-only">{selected ? sectionLabel(selected.section_type) : ''}</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col pt-6">{inspector}</div>
        </SheetContent>
      </Sheet>

      <PublishCheck
        open={checkOpen}
        onOpenChange={setCheckOpen}
        site={editor.site}
        sections={sections}
        errorsById={editor.errorsById}
        publishing={editor.publishing}
        isPublished={editor.isPublished}
        onPublish={() => void doPublish()}
        onGoTo={(id) => {
          setCheckOpen(false);
          select(id);
        }}
      />
      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        link={editor.publicUrl}
        title="Seu site está no ar"
        description="Mande o link no WhatsApp, coloque na bio do Instagram ou imprima o QR para o portão."
      />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atalhos do teclado</DialogTitle>
            <DialogDescription>Valem quando o cursor não está num campo de texto.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {SHORTCUTS.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                </dt>
                <dd className="m-0 text-muted-foreground">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmUnpublish}
        title="Tirar o site do ar"
        message="O endereço passa a mostrar “Site em preparação”. Tudo continua salvo e pode ser publicado de novo com um clique."
        destructive
        confirmText="Tirar do ar"
        onConfirm={() => {
          setConfirmUnpublish(false);
          void editor.unpublish();
        }}
        onCancel={() => setConfirmUnpublish(false)}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Sair sem publicar?"
        message={
          editor.isPublished
            ? 'Você mudou o site, mas ainda não publicou. Se sair agora, essas mudanças se perdem e o site no ar continua como estava.'
            : 'Há mudanças que ainda não foram salvas. Se sair agora, elas se perdem.'
        }
        destructive
        confirmText="Sair e descartar"
        cancelText="Continuar editando"
        onConfirm={() => {
          setConfirmLeave(false);
          editor.releaseLeaveGuard();
          void router.push('/admin');
        }}
        onCancel={() => setConfirmLeave(false)}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        title="Excluir seção"
        message={
          <>
            Excluir a seção <strong>{deleteTarget ? sectionLabel(deleteTarget.section_type) : ''}</strong>? Dá para desfazer com Ctrl+Z, e o site no ar só muda quando você publicar.
          </>
        }
        destructive
        confirmText="Excluir"
        onConfirm={() => {
          if (deleteId) editor.removeSection(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

export default SiteStudio;

