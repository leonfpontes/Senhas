/**
 * SettingsSheet — endereço (somente leitura) e SEO do site, num Sheet lateral.
 * Chama `PUT /api/v1/admin/sites` pelo `onSave` do pai.
 *
 * - Endereço: é sempre o slug do terreiro (o botão "Retirar senha" do site monta
 *   `/{slug}/...` com ele). O backend ignora `slug` no PUT e sincroniza com o tenant.
 * - Estilo/template: não fica aqui — o site público não lê `site.template`; ele só
 *   escolhe as seções iniciais no assistente de primeiro uso (SetupWizard).
 * - SEO: campo vazio é enviado como `null` e LIMPA o valor no backend.
 */
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TextField } from '@/components/fields';
import type { SiteInfo } from '../types';

export interface SiteSettingsPayload {
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
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && site) {
      setMetaTitle(site.meta_title || '');
      setMetaDesc(site.meta_description || '');
    }
  }, [open, site]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const endereco = site ? `${origin}/${site.slug}` : '';

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await onSave({ meta_title: metaTitle.trim() || null, meta_description: metaDesc.trim() || null });
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
          <SheetDescription>Endereço e textos para o Google.</SheetDescription>
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
            value={endereco}
            readOnly
            helperText="É o endereço do terreiro — o mesmo dos links de retirada de senha."
          />
          <TextField label="Título da página (SEO)" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={200} helperText="Aparece na aba do navegador e no Google." />
          <TextField label="Descrição (SEO)" multiline rows={3} value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} maxLength={500} />
        </form>
        <SheetFooter className="border-t border-border sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Salvar configurações
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default SettingsSheet;
