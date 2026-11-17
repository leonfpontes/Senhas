/**
 * PublishCheck — conferência antes de publicar (beta "Novo construtor do site"): o que
 * falta, como o site aparece no Google e no WhatsApp. Só erro bloqueia; aviso é aviso.
 */
import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, CloudUpload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SiteInfo, SiteSection } from '../types';
import { isSectionHidden, sectionLabel } from '../lib';

export type CheckLevel = 'erro' | 'aviso' | 'ok';
export interface CheckItem {
  level: CheckLevel;
  text: string;
  /** Seção para abrir ao clicar ("Ajustar"). */
  sectionId?: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/** Itens da conferência. Puro, para teste. */
export function buildChecklist(site: SiteInfo | null, sections: SiteSection[], errorsById: Record<string, string[]>): CheckItem[] {
  const out: CheckItem[] = [];
  for (const [id, errs] of Object.entries(errorsById)) errs.forEach((e) => out.push({ level: 'erro', text: e, sectionId: id }));
  const visiveis = sections.filter((s) => !isSectionHidden(s));
  const hero = visiveis.find((s) => s.section_type === 'HERO');
  if (!hero) out.push({ level: 'aviso', text: 'O site não tem capa: falta o nome da casa e o botão "Retirar senha" no topo.' });
  for (const s of visiveis) {
    const c = s.config;
    const nome = sectionLabel(s.section_type);
    if (s.section_type === 'ABOUT' && !str(c.body)) out.push({ level: 'aviso', text: `"${nome}" está sem texto.`, sectionId: s.id });
    if (s.section_type === 'LOCATION' && !str(c.address) && !str(c.street)) out.push({ level: 'aviso', text: '"Como chegar" está sem endereço.', sectionId: s.id });
    if (s.section_type === 'GALLERY' && list(c.items).length === 0) out.push({ level: 'aviso', text: '"Fotos" ainda não tem fotos.', sectionId: s.id });
    if (s.section_type === 'LINHAS' && list(c.items).length === 0) out.push({ level: 'aviso', text: '"Linhas de trabalho" está vazia.', sectionId: s.id });
    if (s.section_type === 'FAQ') {
      const semResposta = list(c.items).filter((p) => !str((p as Record<string, unknown>)?.resposta)).length;
      if (semResposta) out.push({ level: 'aviso', text: `${semResposta} pergunta(s) sem resposta em "Perguntas frequentes".`, sectionId: s.id });
    }
    if (s.section_type === 'AJUDAR' && !str(c.pix_chave) && !str(c.necessidades)) out.push({ level: 'aviso', text: '"Como ajudar a casa" está sem PIX e sem lista.', sectionId: s.id });
  }
  if (!str(site?.meta_description)) out.push({ level: 'aviso', text: 'Falta a descrição para o Google (em Configurações do site).' });
  if (!out.some((i) => i.level !== 'ok')) out.push({ level: 'ok', text: 'Tudo certo para publicar.' });
  return out;
}

export function googleSnippet(site: SiteInfo | null, sections: SiteSection[], origin: string) {
  const hero = sections.find((s) => s.section_type === 'HERO');
  const about = sections.find((s) => s.section_type === 'ABOUT');
  const title = str(site?.meta_title) || str(hero?.config.title) || 'Site do terreiro';
  const description = (str(site?.meta_description) || str(about?.config.body) || str(hero?.config.subtitle)).slice(0, 160);
  const host = origin.replace(/^https?:\/\//, '');
  return { title, description, url: `${host}/${site?.slug ?? ''}` };
}

const ICON: Record<CheckLevel, React.ReactNode> = {
  erro: <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />,
  aviso: <AlertTriangle className="size-4 shrink-0 text-warning-strong" aria-hidden />,
  ok: <CheckCircle2 className="size-4 shrink-0 text-success-strong" aria-hidden />,
};

export function PublishCheck({
  open,
  onOpenChange,
  site,
  sections,
  errorsById,
  publishing,
  isPublished,
  onPublish,
  onGoTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: SiteInfo | null;
  sections: SiteSection[];
  errorsById: Record<string, string[]>;
  publishing: boolean;
  isPublished: boolean;
  onPublish: () => void;
  onGoTo: (sectionId: string) => void;
}) {
  const items = buildChecklist(site, sections, errorsById);
  const erros = items.filter((i) => i.level === 'erro').length;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://girahub.com.br';
  const g = googleSnippet(site, sections, origin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isPublished ? 'Publicar alterações' : 'Publicar o site'}</DialogTitle>
          <DialogDescription>Uma olhada rápida antes de o site ir ao ar. Avisos não impedem a publicação.</DialogDescription>
        </DialogHeader>

        <ul className="flex list-none flex-col gap-2 p-0" aria-label="Conferência">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {ICON[it.level]}
              <span className="flex-1">{it.text}</span>
              {it.sectionId && (
                <button type="button" className="text-xs font-medium text-brand underline-offset-2 hover:underline" onClick={() => onGoTo(it.sectionId!)}>
                  Ajustar
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">No Google</p>
            <div className="rounded-lg border border-border bg-white p-3 text-left text-[#202124]">
              <p className="truncate text-xs text-[#4d5156]">{g.url}</p>
              <p className="truncate text-lg text-[#1a0dab]">{g.title}</p>
              <p className="line-clamp-2 text-sm text-[#4d5156]">{g.description || 'Sem descrição: o Google escolhe um trecho do site.'}</p>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Quando o link é mandado no WhatsApp</p>
            <div className="max-w-[340px] overflow-hidden rounded-lg border border-border bg-[#f0f2f5] text-left text-[#111b21]">
              <div className="border-l-4 border-[#2E6A4E] bg-white/80 p-2">
                <p className="truncate text-sm font-semibold">{g.title}</p>
                <p className="line-clamp-2 text-xs text-[#667781]">{g.description}</p>
                <p className="truncate text-xs text-[#667781]">{g.url.split('/')[0]}</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar e ajustar
          </Button>
          <Button onClick={onPublish} disabled={erros > 0 || publishing} data-testid="publish-confirm">
            {publishing ? <Loader2 className="animate-spin" aria-hidden /> : <CloudUpload aria-hidden />}
            {erros > 0 ? `Corrija ${erros} ${erros === 1 ? 'erro' : 'erros'}` : isPublished ? 'Publicar alterações' : 'Publicar agora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
