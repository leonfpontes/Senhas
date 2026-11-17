/**
 * SiteEditor — o construtor "Meu Site": barra superior (estado + publicar), lista
 * de seções / histórico, editor da seção e prévia do rascunho.
 *
 * Layout: ≥1200px três painéis; 900–1199 lista + editor (prévia num Sheet);
 * < 900 lista em tela cheia, editor e prévia em Sheets.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CloudUpload,
  ExternalLink,
  Eye,
  GlobeLock,
  Loader2,
  MoreHorizontal,
  ListOrdered,
  Palette,
  Redo2,
  RefreshCw,
  Save,
  Settings2,
  Undo2,
} from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ReadOnlyNotice } from '@/components/gates';
import type { PublicSiteData, SiteGira, SiteSection } from '../types';
import { sectionLabel } from '../lib';
import { useSiteEditor } from './useSiteEditor';
import { SectionList } from './SectionList';
import { SectionEditor } from './SectionEditor';
import { SectionGallery } from './SectionGallery';
import { SitePreview, type PreviewViewport } from './SitePreview';
import { SetupWizard } from './SetupWizard';
import { SettingsSheet } from './SettingsSheet';
import { HistoryPanel } from './HistoryPanel';
import { SectionIcon } from './sectionIcons';
import { apiClient } from '@/services/api_client';
import { ShareLinkDialog } from '@/components/admin/ShareLinkDialog';
import type { SiteEditing } from '../EditableFrame';
import { activeStyleId, applySiteStyle } from '../styles';
import { GuidedSetup } from './GuidedSetup';
import { StylePanel } from './StylePanel';
import { PublishCheck } from './PublishCheck';

export interface SiteEditorProps {
  canEdit: boolean;
  canInsert: boolean;
  /**
   * Beta "Novo construtor do site" (`beta_novo_construtor_site`): começo guiado, edição
   * direto na prévia, estilos, seções novas, conferência antes de publicar e divulgação.
   */
  novo?: boolean;
}

/** Foco num campo de texto: o Ctrl+Z é do navegador, não do site. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Giras do terreiro para a prévia (API admin; opcional — sem permissão, a prévia usa exemplos). */
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
        const upcoming = (res.data as Array<Record<string, unknown>>)
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
          }));
        setGiras(upcoming);
      })
      .catch(() => {
        /* sem permissão de giras: prévia com exemplos */
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return giras;
}

export function SiteEditor({ canEdit, canInsert, novo = false }: SiteEditorProps) {
  const editor = useSiteEditor({ enabled: true, canEdit });
  const isMobile = useMediaQuery('(max-width: 899px)');
  const hasPreviewPane = useMediaQuery('(min-width: 1200px)');
  const giras = useAdminGiras(!editor.loading);

  const [tab, setTab] = useState<'secoes' | 'historico'>('secoes');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [viewport, setViewport] = useState<PreviewViewport>('mobile');
  const [deleteTarget, setDeleteTarget] = useState<SiteSection | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);

  const { undo, redo } = editor;
  // Desfazer / refazer pelo teclado (fora de campos de texto, onde vale o do navegador).
  useEffect(() => {
    if (!novo || !canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [novo, canEdit, undo, redo]);

  useEffect(() => {
    if (tab === 'historico') void editor.loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
            sections: editor.sections,
            upcoming_giras: giras,
          }
        : null,
    [editor.site, editor.sections, giras],
  );

  const editing: SiteEditing | undefined = novo
    ? {
        selectedId: editor.selectedId,
        onSelect: (id) => {
          editor.setSelectedId(id);
          setTab('secoes');
        },
        onMove: editor.moveSection,
        onToggleHidden: editor.toggleHidden,
        onDelete: (id) => setDeleteTarget(editor.sections.find((s) => s.id === id) ?? null),
        onInsert: (index) => {
          setInsertAt(index);
          setGalleryOpen(true);
        },
        onPatch: editor.patchConfig,
        labelOf: sectionLabel,
        canEdit,
      }
    : undefined;

  const doPublish = async () => {
    const ok = await editor.publish();
    if (ok && novo) {
      setCheckOpen(false);
      setShareOpen(true);
    }
  };

  const historyButtons = novo && canEdit && (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" onClick={editor.undo} disabled={!editor.canUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">
        <Undo2 />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={editor.redo} disabled={!editor.canRedo} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">
        <Redo2 />
      </Button>
    </div>
  );

  const upload = canInsert && canEdit ? editor.uploadImage : undefined;
  const showWizard = !editor.loading && !editor.loadError && editor.sections.length === 0 && !wizardDismissed;
  const busy = editor.saving || editor.publishing;

  const publishDisabled =
    !canEdit || busy || editor.loading || editor.errorCount > 0 || editor.uploading || (editor.isPublished && !editor.dirty);
  const publishLabel = editor.isPublished ? 'Publicar alterações' : 'Publicar site';
  const publishHint =
    editor.errorCount > 0
      ? `Corrija ${editor.errorCount} ${editor.errorCount === 1 ? 'erro' : 'erros'} para publicar`
      : editor.uploading
        ? 'Aguardando o envio da imagem…'
        : null;

  const statusBadge = (() => {
    switch (editor.status) {
      case 'published':
        return (
          <Badge className="gap-1 border-success/30 bg-success/15 text-success-strong" data-testid="site-status">
            <Check /> Publicado e atualizado
          </Badge>
        );
      case 'published-dirty':
        return (
          <Badge className="gap-1 border-warning/30 bg-warning/15 text-warning-strong" data-testid="site-status">
            <AlertCircle /> Rascunho com alterações não publicadas
          </Badge>
        );
      case 'unpublished':
        return (
          <Badge variant="outline" className="gap-1" data-testid="site-status">
            <GlobeLock /> Despublicado
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="gap-1" data-testid="site-status">
            Rascunho
          </Badge>
        );
    }
  })();

  const saveState = editor.saving ? (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin" aria-hidden /> Salvando…
    </span>
  ) : editor.dirty && !editor.isPublished ? (
    <span className="text-xs text-muted-foreground">Alterações pendentes</span>
  ) : editor.lastSavedAt && !editor.isPublished ? (
    <span className="text-xs text-muted-foreground">
      Rascunho salvo às {editor.lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  ) : null;

  const selectSection = (id: string) => {
    editor.setSelectedId(id);
    setTab('secoes');
  };

  const confirmDelete = () => {
    if (deleteTarget) editor.removeSection(deleteTarget.id);
    setDeleteTarget(null);
  };

  const listPanel = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as 'secoes' | 'historico')} className="flex min-h-0 flex-1 flex-col gap-0">
      <TabsList variant="line" className="w-full justify-start border-b border-border px-2">
        <TabsTrigger value="secoes" className="flex-none">
          Seções
        </TabsTrigger>
        <TabsTrigger value="historico" className="flex-none">
          Histórico
        </TabsTrigger>
      </TabsList>
      <TabsContent value="secoes" className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <SectionList
          sections={editor.sections}
          selectedId={editor.selectedId}
          errorsById={editor.errorsById}
          canEdit={canEdit}
          onSelect={selectSection}
          onMove={editor.moveSection}
          onToggleHidden={editor.toggleHidden}
          onDelete={setDeleteTarget}
          onAdd={() => setGalleryOpen(true)}
        />
      </TabsContent>
      <TabsContent value="historico" className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <HistoryPanel versions={editor.versions} loading={editor.versionsLoading} canEdit={canEdit} hasChanges={editor.dirty} onRestore={editor.restore} />
      </TabsContent>
    </Tabs>
  );

  const editorPanel = editor.selected ? (
    <SectionEditor
      section={editor.selected}
      errors={editor.errorsById[editor.selected.id] ?? []}
      onChange={(config) => editor.updateConfig(editor.selected!.id, config)}
      upload={upload}
      hideHeader={isMobile}
    />
  ) : (
    <EmptyState
      icon={<SectionIcon type="CUSTOM_TEXT" className="size-6" />}
      title="Escolha uma seção"
      description={novo ? 'Clique numa seção do site para editar. O "+" entre seções adiciona outra ali.' : 'Selecione uma seção na lista para editar, ou adicione uma nova.'}
      action={canEdit && <Button variant="outline" onClick={() => setGalleryOpen(true)}>Adicionar seção</Button>}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background" data-testid="site-editor">
      {/* ── Barra superior ── */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 sm:px-4">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1">
          <h1 className="sr-only md:not-sr-only md:font-display md:text-[1.75rem] md:leading-tight md:font-normal md:tracking-[-0.02em]">Meu Site</h1>
          {!editor.loading && statusBadge}
          {saveState}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {!showWizard && historyButtons}
          {novo && canEdit && !showWizard && !editor.loading && (
            <Button variant="outline" size="sm" onClick={() => setStyleOpen(true)}>
              <Palette aria-hidden /> Estilo
            </Button>
          )}
          {novo && !showWizard && !editor.loading && hasPreviewPane === false && !isMobile && (
            <Button variant="outline" size="sm" onClick={() => setListOpen(true)}>
              <ListOrdered aria-hidden /> Seções
            </Button>
          )}
          {editor.isPublished && editor.site && (
            <Button asChild variant="ghost" size="sm" className={canEdit ? 'hidden sm:inline-flex' : undefined}>
              <a href={editor.publicUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> <span className="hidden sm:inline">Ver site</span>
                <span className="sr-only sm:hidden">Ver site</span>
              </a>
            </Button>
          )}
          {!hasPreviewPane && !(novo && !isMobile) && (
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={editor.loading}>
              <Eye aria-hidden /> Prévia
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(true)} aria-label="Configurações do site" disabled={editor.loading}>
              <Settings2 />
            </Button>
          )}
          {canEdit && (
            <div className="flex flex-col items-end">
              <Button size="sm" onClick={() => (novo ? setCheckOpen(true) : void editor.publish())} disabled={publishDisabled} data-testid="publish-button">
                {editor.publishing ? <Loader2 className="animate-spin" aria-hidden /> : <CloudUpload aria-hidden />}
                {publishLabel}
              </Button>
            </div>
          )}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {editor.isPublished && editor.site && (
                  <DropdownMenuItem asChild className="sm:hidden">
                    <a href={editor.publicUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> Ver site publicado
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => void editor.save()} disabled={!editor.dirty || busy || editor.errorCount > 0}>
                  <Save /> Salvar rascunho agora
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void editor.reload()} disabled={busy}>
                  <RefreshCw /> Recarregar
                </DropdownMenuItem>
                {editor.isPublished && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirmUnpublish(true)} disabled={busy}>
                      <GlobeLock /> Despublicar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {publishHint && canEdit && (
          <p className="w-full text-right text-xs text-destructive" role="status">
            {publishHint}
          </p>
        )}
      </header>

      {!canEdit && !editor.loading && (
        <div className="px-3 pt-3 sm:px-4">
          <ReadOnlyNotice />
        </div>
      )}

      {/* ── Corpo ── */}
      {editor.loading ? (
        <div className="flex flex-col gap-3 p-4" data-testid="site-editor-loading" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
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
      ) : showWizard && novo ? (
        <GuidedSetup
          slug={editor.site?.slug ?? ''}
          canEdit={canEdit}
          onSkip={() => {
            setWizardDismissed(true);
            if (canEdit) setGalleryOpen(true);
          }}
          onCreate={(drafts) => {
            editor.replaceAll(drafts);
            setWizardDismissed(true);
          }}
        />
      ) : showWizard ? (
        <SetupWizard
          template={editor.site?.template ?? 'moderno'}
          canEdit={canEdit}
          onSkip={() => {
            setWizardDismissed(true);
            if (canEdit) setGalleryOpen(true);
          }}
          onCreate={(drafts) => {
            // O estilo escolhido só monta as seções iniciais: o site público não lê
            // `site.template`, então não há o que gravar (e um PUT /sites em paralelo ao
            // primeiro autosave era o gatilho do 409 falso no primeiro uso).
            editor.replaceAll(drafts);
            setWizardDismissed(true);
          }}
        />
      ) : novo && !isMobile ? (
        <div className="flex min-h-0 flex-1">
          {/* Lista / histórico (≥ 1200); entre 900 e 1199 abre pelo botão "Seções". */}
          {hasPreviewPane && <aside className="flex w-[260px] shrink-0 flex-col border-r border-border">{listPanel}</aside>}
          {/* Prévia editável no centro */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {previewSite && <SitePreview site={previewSite} viewport={viewport} onViewportChange={setViewport} editing={editing} />}
          </main>
          {/* Detalhes da seção escolhida */}
          <aside className="@container min-h-0 w-[360px] shrink-0 overflow-y-auto border-l border-border bg-muted/30 xl:w-[400px]">{editorPanel}</aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Lista / histórico */}
          <aside className="flex w-full min-w-0 flex-col md:w-[300px] md:shrink-0 md:border-r md:border-border">
            {listPanel}
          </aside>

          {/* Editor (≥ 900) */}
          <main className="@container hidden min-h-0 flex-1 overflow-y-auto bg-muted/30 md:block">{editorPanel}</main>

          {/* Prévia (≥ 1200) */}
          {previewSite && (
            <aside className="hidden min-h-0 w-[42%] max-w-[760px] shrink-0 border-l border-border lg:flex lg:flex-col">
              <SitePreview site={previewSite} viewport={viewport} onViewportChange={setViewport} />
            </aside>
          )}
        </div>
      )}

      {/* Editor no celular (Sheet). */}
      <Sheet open={isMobile && editor.selected !== null} onOpenChange={(o) => !o && editor.setSelectedId(null)}>
        <SheetContent side="right" className="@container w-full gap-0 sm:max-w-[520px]">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              {editor.selected && <SectionIcon type={editor.selected.section_type} className="text-muted-foreground" />}
              {editor.selected ? sectionLabel(editor.selected.section_type) : ''}
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{editor.selected && editorPanel}</div>
        </SheetContent>
      </Sheet>

      {/* Prévia em Sheet (< 1200) */}
      <Sheet open={previewOpen && !hasPreviewPane} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[min(100vw,900px)]">
          <SheetTitle className="sr-only">Prévia do site</SheetTitle>
          {previewSite && <SitePreview site={previewSite} viewport={viewport} onViewportChange={setViewport} className="pt-10" editing={editing ? { ...editing, onSelect: (id) => { setPreviewOpen(false); editing.onSelect(id); } } : undefined} />}
        </SheetContent>
      </Sheet>

      <SectionGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        existingTypes={editor.sections.map((s) => s.section_type)}
        novoConstrutor={novo}
        onAdd={(type) => {
          if (insertAt !== null) editor.insertSection(type, insertAt);
          else editor.addSection(type);
          setInsertAt(null);
          setGalleryOpen(false);
          setTab('secoes');
        }}
      />

      {novo && (
        <>
          <StylePanel
            open={styleOpen}
            onOpenChange={setStyleOpen}
            activeId={activeStyleId(editor.sections)}
            onApply={(style) => editor.transformAll((prev) => applySiteStyle(prev, style))}
          />
          <PublishCheck
            open={checkOpen}
            onOpenChange={setCheckOpen}
            site={editor.site}
            sections={editor.sections}
            errorsById={editor.errorsById}
            publishing={editor.publishing}
            isPublished={editor.isPublished}
            onPublish={() => void doPublish()}
            onGoTo={(id) => {
              setCheckOpen(false);
              editing?.onSelect(id);
            }}
          />
          <ShareLinkDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            link={editor.publicUrl}
            title="Seu site está no ar"
            description="Mande o link no WhatsApp, coloque na bio do Instagram ou imprima o QR para o portão."
          />
          <Sheet open={listOpen} onOpenChange={setListOpen}>
            <SheetContent side="left" className="w-full gap-0 p-0 sm:max-w-[320px]">
              <SheetTitle className="sr-only">Seções do site</SheetTitle>
              <div className="flex min-h-0 flex-1 flex-col pt-10">{listPanel}</div>
            </SheetContent>
          </Sheet>
        </>
      )}

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} site={editor.site} onSave={editor.saveSettings} />

      <ConfirmDialog
        open={confirmUnpublish}
        title="Despublicar site"
        message="O site sai do ar e o endereço passa a mostrar “Site em preparação”. Tudo continua salvo como rascunho e pode ser publicado de novo."
        destructive
        confirmText="Despublicar"
        onConfirm={() => {
          setConfirmUnpublish(false);
          void editor.unpublish();
        }}
        onCancel={() => setConfirmUnpublish(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir seção"
        message={
          <>
            Excluir a seção <strong>{deleteTarget ? sectionLabel(deleteTarget.section_type) : ''}</strong>? Ela sai do site na próxima publicação.
          </>
        }
        destructive
        confirmText="Excluir"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default SiteEditor;
