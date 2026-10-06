/**
 * useSiteEditor — estado e operações do construtor "Meu Site".
 *
 * Mesmas chamadas de API de antes (`backend/src/api/v1/admin/sites.py`):
 *   GET /sites, GET/PUT /sites/sections (lock otimista por `site_version`, Gap #6;
 *   re-GET depois do PUT para pegar os UUIDs reais, Gap #12), POST /publish,
 *   POST /unpublish, PUT /sites, GET /versions, POST /versions/{id}/restore,
 *   POST /images (upload trava o salvamento, Gap #13).
 *
 * Decisões:
 * - Salvar automático (debounce) só enquanto o site NÃO está publicado: em
 *   PUBLISHED, qualquer PUT /sections já vai ao ar, então as mudanças ficam locais
 *   até "Publicar alterações" — é isso que dá sentido a "alterações não publicadas".
 * - `beforeunload` e guarda de rota enquanto houver alteração não salva.
 * - Seção "desligada" = `config.hidden === true` (convenção do frontend; o backend
 *   aceita qualquer chave na config).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import type { SectionConfig, SectionType, SiteInfo, SiteSection, SiteVersion } from '../types';
import { catalogEntry, validateSection } from '../lib';
import type { SiteSettingsPayload } from './SettingsSheet';
import type { SectionDraft } from './SetupWizard';

export type SiteStatusKind = 'draft' | 'unpublished' | 'published' | 'published-dirty';

export interface UseSiteEditorOptions {
  /** Carrega dados (plano e permissão de view ok). */
  enabled: boolean;
  canEdit: boolean;
}

const AUTOSAVE_MS = 1500;
const UNSAVED_MESSAGE = 'Você tem alterações não publicadas. Sair mesmo assim?';

function tempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function errorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as { status?: number; response?: { status?: number } };
  return e.response?.status ?? e.status;
}

export function useSiteEditor({ enabled, canEdit }: UseSiteEditorOptions) {
  const router = useRouter();

  const [site, setSite] = useState<SiteInfo | null>(null);
  const [sections, setSectionsState] = useState<SiteSection[]>([]);
  const [versions, setVersions] = useState<SiteVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [siteUpdatedAt, setSiteUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [conflict, setConflict] = useState(false);

  // Refs para as operações assíncronas lerem o estado mais recente.
  const sectionsRef = useRef(sections);
  const siteRef = useRef(site);
  const dirtyRef = useRef(dirty);
  const siteUpdatedAtRef = useRef(siteUpdatedAt);
  const savingRef = useRef(false);
  const editSeqRef = useRef(0);
  sectionsRef.current = sections;
  siteRef.current = site;
  dirtyRef.current = dirty;
  siteUpdatedAtRef.current = siteUpdatedAt;

  // ── Carregamento ────────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setConflict(false);
    try {
      const [siteRes, sectionsRes] = await Promise.all([
        apiClient.get('/api/v1/admin/sites'),
        apiClient.get('/api/v1/admin/sites/sections'),
      ]);
      setSite(siteRes.data);
      setSectionsState(Array.isArray(sectionsRes.data?.sections) ? sectionsRes.data.sections : []);
      setSiteUpdatedAt(sectionsRes.data?.site_updated_at || siteRes.data?.updated_at || '');
      setDirty(false);
    } catch (err) {
      setLoadError(extractApiErrorMessage(err, 'Erro ao carregar o site.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void reload();
  }, [enabled, reload]);

  const loadVersions = useCallback(async () => {
    if (!enabled) return;
    setVersionsLoading(true);
    try {
      const res = await apiClient.get('/api/v1/admin/sites/versions');
      setVersions(Array.isArray(res.data) ? res.data : []);
    } catch {
      /* não crítico */
    } finally {
      setVersionsLoading(false);
    }
  }, [enabled]);

  // ── Mutações locais ─────────────────────────────────────────────────────────

  const mutate = useCallback((fn: (prev: SiteSection[]) => SiteSection[]) => {
    editSeqRef.current += 1;
    setSectionsState((prev) => fn(prev).map((s, i) => ({ ...s, order_index: i })));
    setDirty(true);
  }, []);

  const addSection = useCallback(
    (type: SectionType, config?: SectionConfig): string => {
      const id = tempId();
      const base = catalogEntry(type)?.defaultConfig ?? {};
      mutate((prev) => [...prev, { id, _tempId: id, section_type: type, order_index: prev.length, config: { ...base, ...(config ?? {}) } }]);
      setSelectedId(id);
      return id;
    },
    [mutate],
  );

  const replaceAll = useCallback(
    (drafts: SectionDraft[]) => {
      const next = drafts.map((d, i) => {
        const id = tempId();
        return { id, _tempId: id, section_type: d.section_type, order_index: i, config: d.config } as SiteSection;
      });
      mutate(() => next);
      setSelectedId(next[0]?.id ?? null);
    },
    [mutate],
  );

  const moveSection = useCallback(
    (id: string, direction: 'up' | 'down') => {
      mutate((prev) => {
        const idx = prev.findIndex((s) => s.id === id);
        const swap = direction === 'up' ? idx - 1 : idx + 1;
        if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[swap]] = [next[swap], next[idx]];
        return next;
      });
    },
    [mutate],
  );

  const removeSection = useCallback(
    (id: string) => {
      mutate((prev) => prev.filter((s) => s.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [mutate],
  );

  const updateConfig = useCallback(
    (id: string, config: SectionConfig) => {
      mutate((prev) => prev.map((s) => (s.id === id ? { ...s, config } : s)));
    },
    [mutate],
  );

  const toggleHidden = useCallback(
    (id: string) => {
      mutate((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const { hidden, ...rest } = s.config;
          return { ...s, config: hidden === true ? rest : { ...rest, hidden: true } };
        }),
      );
    },
    [mutate],
  );

  // ── Validação ───────────────────────────────────────────────────────────────

  const errorsById = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const s of sections) {
      const errs = validateSection(s);
      if (errs.length) out[s.id] = errs;
    }
    return out;
  }, [sections]);
  const errorCount = useMemo(() => Object.values(errorsById).reduce((n, e) => n + e.length, 0), [errorsById]);
  const uploading = uploadingCount > 0;

  // ── Salvar ──────────────────────────────────────────────────────────────────

  const save = useCallback(
    async (opts?: { silent?: boolean }): Promise<boolean> => {
      if (!canEdit || savingRef.current) return false;
      const current = sectionsRef.current;
      const errs = current.flatMap((s) => validateSection(s));
      if (errs.length > 0) {
        if (!opts?.silent) toast.error(errs[0]);
        return false;
      }
      savingRef.current = true;
      setSaving(true);
      const seq = editSeqRef.current;
      try {
        await apiClient.put('/api/v1/admin/sites/sections', {
          sections: current.map((s) => ({ section_type: s.section_type, config: s.config })),
          site_version: siteUpdatedAtRef.current || undefined,
        });
        // Re-busca para sincronizar os UUIDs reais (Gap #12).
        const res = await apiClient.get('/api/v1/admin/sites/sections');
        const fresh: SiteSection[] = Array.isArray(res.data?.sections) ? res.data.sections : current;
        if (res.data?.site_updated_at) setSiteUpdatedAt(res.data.site_updated_at);
        if (editSeqRef.current === seq) {
          // Nada mudou durante o salvamento: adota as seções do servidor e remapeia a seleção pela posição.
          setSelectedId((prev) => {
            if (!prev) return prev;
            const idx = current.findIndex((s) => s.id === prev);
            return idx >= 0 && fresh[idx] ? fresh[idx].id : prev;
          });
          setSectionsState(fresh);
          setDirty(false);
        }
        setLastSavedAt(new Date());
        setConflict(false);
        if (!opts?.silent) toast.success('Rascunho salvo.');
        return true;
      } catch (err) {
        if (errorStatus(err) === 409) {
          setConflict(true);
          toast.warning('O site foi alterado por outro usuário.', {
            description: 'Recarregue a página para ver as mudanças.',
            duration: 10000,
            action: { label: 'Recarregar', onClick: () => void reload() },
          });
          return false;
        }
        toast.error(extractApiErrorMessage(err, 'Erro ao salvar.'));
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [canEdit, reload],
  );
  const saveRef = useRef(save);
  saveRef.current = save;

  // Salvar automático enquanto não publicado.
  const siteStatus = site?.status;
  useEffect(() => {
    if (!canEdit || !dirty || saving || uploading || errorCount > 0 || conflict) return;
    if (!site || siteStatus === 'PUBLISHED') return;
    const t = setTimeout(() => void saveRef.current({ silent: true }), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [sections, dirty, saving, uploading, errorCount, conflict, canEdit, site, siteStatus]);

  // Aviso ao sair com alterações pendentes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onRouteChange = () => {
      if (typeof window !== 'undefined' && !window.confirm(UNSAVED_MESSAGE)) {
        router.events?.emit?.('routeChangeError');
        throw 'Navegação cancelada: alterações não publicadas.';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    router.events?.on?.('routeChangeStart', onRouteChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      router.events?.off?.('routeChangeStart', onRouteChange);
    };
  }, [dirty, router.events]);

  // ── Publicar / despublicar ──────────────────────────────────────────────────

  const publish = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return false;
    setPublishing(true);
    const wasPublished = siteRef.current?.status === 'PUBLISHED';
    try {
      if (dirtyRef.current) {
        const ok = await saveRef.current({ silent: true });
        if (!ok) return false;
      }
      if (!wasPublished) {
        const res = await apiClient.post('/api/v1/admin/sites/publish');
        setSite((prev) => (res.data?.id ? res.data : prev ? { ...prev, status: 'PUBLISHED' } : prev));
      }
      toast.success(wasPublished ? 'Alterações publicadas!' : 'Site publicado!');
      return true;
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao publicar.'));
      return false;
    } finally {
      setPublishing(false);
    }
  }, [canEdit]);

  const unpublish = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return false;
    try {
      const res = await apiClient.post('/api/v1/admin/sites/unpublish');
      setSite((prev) => (res.data?.id ? res.data : prev ? { ...prev, status: 'UNPUBLISHED' } : prev));
      toast.info('Site despublicado. Ele continua salvo como rascunho.');
      return true;
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao despublicar.'));
      return false;
    }
  }, [canEdit]);

  // ── Versões ─────────────────────────────────────────────────────────────────

  const restore = useCallback(
    async (version: SiteVersion) => {
      if (!canEdit) return;
      try {
        const res = await apiClient.post(`/api/v1/admin/sites/versions/${version.id}/restore`);
        setSectionsState(Array.isArray(res.data?.sections) ? res.data.sections : []);
        if (res.data?.site_updated_at) setSiteUpdatedAt(res.data.site_updated_at);
        setDirty(false);
        setSelectedId(null);
        toast.success('Versão restaurada!');
      } catch (err) {
        toast.error(extractApiErrorMessage(err, 'Erro ao restaurar versão.'));
      }
    },
    [canEdit],
  );

  // ── Configurações ───────────────────────────────────────────────────────────

  const saveSettings = useCallback(
    async (payload: SiteSettingsPayload): Promise<boolean> => {
      if (!canEdit) return false;
      try {
        const res = await apiClient.put('/api/v1/admin/sites', payload);
        setSite((prev) => (res.data?.id ? res.data : prev ? { ...prev, ...payload } : prev));
        toast.success('Configurações salvas!');
        return true;
      } catch (err) {
        toast.error(extractApiErrorMessage(err, 'Erro ao salvar configurações.'));
        return false;
      }
    },
    [canEdit],
  );

  // ── Upload de imagem ────────────────────────────────────────────────────────

  const uploadImage = useCallback(async (file: File): Promise<{ id: string; url: string }> => {
    setUploadingCount((n) => n + 1);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // fetch direto: o Content-Type padrão do axios briga com multipart. Sessão normal
      // autentica pelo cookie HttpOnly; só a impersonação leva bearer do sessionStorage.
      const impersonationToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('access_token') : null;
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${origin}/api/v1/admin/sites/images`, {
        method: 'POST',
        credentials: 'include',
        headers: impersonationToken ? { Authorization: `Bearer ${impersonationToken}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Erro ${res.status} ao enviar a imagem.`);
      }
      const data = await res.json();
      return { id: String(data.id), url: String(data.url) };
    } finally {
      setUploadingCount((n) => Math.max(0, n - 1));
    }
  }, []);

  // ── Derivados ───────────────────────────────────────────────────────────────

  const isPublished = site?.status === 'PUBLISHED';
  const status: SiteStatusKind = isPublished ? (dirty ? 'published-dirty' : 'published') : site?.status === 'UNPUBLISHED' ? 'unpublished' : 'draft';
  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const publicUrl = site && typeof window !== 'undefined' ? `${window.location.origin}/${site.slug}` : site ? `/${site.slug}` : '';

  return {
    site,
    sections,
    versions,
    versionsLoading,
    loading,
    loadError,
    selectedId,
    setSelectedId,
    selected,
    dirty,
    saving,
    publishing,
    lastSavedAt,
    uploading,
    conflict,
    errorsById,
    errorCount,
    status,
    isPublished,
    publicUrl,
    reload,
    loadVersions,
    addSection,
    replaceAll,
    moveSection,
    removeSection,
    updateConfig,
    toggleHidden,
    save,
    publish,
    unpublish,
    restore,
    saveSettings,
    uploadImage,
  };
}

export type SiteEditorState = ReturnType<typeof useSiteEditor>;
