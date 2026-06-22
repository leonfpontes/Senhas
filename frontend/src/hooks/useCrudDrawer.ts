/**
 * useCrudDrawer — eliminates the 6-state boilerplate repeated in every CRUD page.
 *
 * Encapsulates: drawerOpen, drawerMode, editId, formData, touched, saving.
 * Provides helpers: openCreate, openEdit, close, setField, handleSave.
 *
 * Usage:
 *   const crud = useCrudDrawer<UserForm>(EMPTY_FORM, async (mode, id, data) => {
 *     if (mode === 'edit') await apiClient.put(`/api/v1/admin/users/${id}`, data);
 *     else await apiClient.post('/api/v1/admin/users', data);
 *     refetch();
 *   });
 *
 *   <CrudDrawer open={crud.open} mode={crud.mode} onClose={crud.close} ... />
 */

import { useState, useCallback } from 'react';

export type CrudMode = 'create' | 'edit';

interface UseCrudDrawerReturn<T extends Record<string, unknown>> {
  open: boolean;
  mode: CrudMode;
  editId: string | null;
  formData: T;
  touched: Partial<Record<keyof T, boolean>>;
  saving: boolean;
  saveError: string | null;
  openCreate: () => void;
  openEdit: (id: string, initialData: T) => void;
  close: () => void;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  handleSave: () => Promise<void>;
}

type SaveFn<T> = (mode: CrudMode, id: string | null, data: T) => Promise<void>;

export function useCrudDrawer<T extends Record<string, unknown>>(
  emptyForm: T,
  onSave: SaveFn<T>,
): UseCrudDrawerReturn<T> {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CrudMode>('create');
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<T>(emptyForm);
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setMode('create');
    setEditId(null);
    setFormData(emptyForm);
    setTouched({});
    setSaveError(null);
    setOpen(true);
  }, [emptyForm]);

  const openEdit = useCallback((id: string, initialData: T) => {
    setMode('edit');
    setEditId(id);
    setFormData(initialData);
    setTouched({});
    setSaveError(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setSaveError(null);
  }, []);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setTouched(prev => ({ ...prev, [key]: true }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(mode, editId, formData);
      setOpen(false);
    } catch (err: unknown) {
      setSaveError((err as { message?: string })?.message ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }, [mode, editId, formData, onSave]);

  return { open, mode, editId, formData, touched, saving, saveError, openCreate, openEdit, close, setField, handleSave };
}
