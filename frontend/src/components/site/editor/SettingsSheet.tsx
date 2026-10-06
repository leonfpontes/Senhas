/**
 * SettingsSheet — endereço (slug), template e SEO do site, num Sheet lateral.
 * Chama `PUT /api/v1/admin/sites` pelo `onSave` do pai.
 */
import React, { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TextField } from '@/components/fields';
import type { SiteInfo } from '../types';
import { SITE_TEMPLATES } from './SetupWizard';

export interface SiteSettingsPayload {
  slug: string;
  template: string;
  meta_title: string | null;
  meta_description: string | null;
}

export interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: SiteInfo | null;
  onSave: (payload: SiteSettingsPayload) => Promise<boolean>;
}

export function SettingsSheet({ open, onOpenChange, site, onSave }: SettingsSheetProps) {
  const templateId = useId();
  const [slug, setSlug] = useState('');
  const [template, setTemplate] = useState('moderno');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && site) {
      setSlug(site.slug || '');
      setTemplate(site.template || 'moderno');
      setMetaTitle(site.meta_title || '');
      setMetaDesc(site.meta_description || '');
    }
  }, [open, site]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const slugOk = slug.trim().length > 0;

  const handleSave = async () => {
    if (!slugOk) return;
    setSaving(true);
    try {
      const ok = await onSave({ slug: slug.trim(), template, meta_title: metaTitle || null, meta_description: metaDesc || null });
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Configurações do site</SheetTitle>
          <SheetDescription>Endereço, estilo e textos para o Google.</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <TextField
            label="Endereço do site"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            maxLength={100}
            error={!slugOk && 'Informe o endereço.'}
            helperText={`${origin}/${slug || '…'} — mantenha igual ao endereço do terreiro para os links "Retirar senha" funcionarem.`}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor={templateId}>Estilo</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger id={templateId} className="w-full bg-input-bg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITE_TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TextField label="Título da página (SEO)" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={200} helperText="Aparece na aba do navegador e no Google." />
          <TextField label="Descrição (SEO)" multiline rows={3} value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} maxLength={500} />
        </form>
        <SheetFooter className="border-t border-border sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !slugOk}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Salvar configurações
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default SettingsSheet;
