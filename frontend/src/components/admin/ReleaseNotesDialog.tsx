/**
 * ReleaseNotesDialog — "Novidades do GiraHub": a versão atual aberta e o histórico das
 * anteriores em acordeões fechados (conteúdo em `constants/releaseNotes.ts`).
 *
 * Abre pelo menu do perfil ("Novidades da versão") e sozinho ao entrar no painel, uma vez
 * por login, até o usuário marcar "Não mostrar novamente". A marca vale só para a versão
 * atual: quando sai uma versão nova, o modal volta a abrir. Tudo fica no navegador
 * (localStorage por usuário; sessionStorage para "uma vez por login").
 *
 * É um Dialog de leitura, não um formulário CRUD (a regra do CrudDrawer não se aplica).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTour } from '@reactour/tour';
import { Sparkles } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RELEASE_NOTES, formatReleaseDate, type ReleaseNote } from '@/constants/releaseNotes';
import { APP_VERSION } from '@/lib/version';

export const releaseNotesDismissedKey = (userId: string) => `girahub:release-notes:dismissed:${userId}`;
export const releaseNotesShownKey = (userId: string) => `girahub:release-notes:shown:${userId}`;

function read(storage: 'local' | 'session', key: string): string | null {
  try {
    return (storage === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(storage: 'local' | 'session', key: string, value: string | null): void {
  try {
    const s = storage === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* modo privado / storage bloqueado: o modal só deixa de lembrar a escolha */
  }
}

/** O usuário marcou "Não mostrar novamente" para a versão atual? */
export function isReleaseNotesDismissed(userId: string): boolean {
  return read('local', releaseNotesDismissedKey(userId)) === APP_VERSION;
}

/** Chamado no logout: o próximo login volta a mostrar o modal (se não foi dispensado). */
export function clearReleaseNotesSession(userId: string | null | undefined): void {
  if (userId) write('session', releaseNotesShownKey(userId), null);
}

/**
 * Abre o modal sozinho uma vez por login quando a versão atual não foi dispensada.
 * Espera um instante e desiste nesta sessão se o tour de boas-vindas estiver aberto
 * (cadastro novo): os dois juntos se atropelam; o modal aparece no próximo login.
 */
export function useReleaseNotesAutoOpen(userId: string | null | undefined, enabled: boolean) {
  const [open, setOpen] = useState(false);
  const { isOpen: tourOpen } = useTour();
  const tourOpenRef = useRef(tourOpen);
  tourOpenRef.current = tourOpen;

  useEffect(() => {
    if (!enabled || !userId) return;
    if (isReleaseNotesDismissed(userId)) return;
    if (read('session', releaseNotesShownKey(userId)) === APP_VERSION) return;
    const timer = window.setTimeout(() => {
      if (tourOpenRef.current) return;
      write('session', releaseNotesShownKey(userId), APP_VERSION);
      setOpen(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [enabled, userId]);

  return [open, setOpen] as const;
}

function NoteBody({ note }: { note: ReleaseNote }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm">
        {note.highlights.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      {note.fixes && note.fixes.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Correções</p>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
            {note.fixes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export interface ReleaseNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null | undefined;
}

export function ReleaseNotesDialog({ open, onOpenChange, userId }: ReleaseNotesDialogProps) {
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (open && userId) setDontShow(isReleaseNotesDismissed(userId));
  }, [open, userId]);

  const handleOpenChange = (next: boolean) => {
    if (!next && userId) write('local', releaseNotesDismissedKey(userId), dontShow ? APP_VERSION : null);
    onOpenChange(next);
  };

  const current = RELEASE_NOTES[0];
  const history = RELEASE_NOTES.slice(1);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-xl" data-testid="release-notes">
        <DialogHeader className="border-b px-6 pt-6 pb-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand" aria-hidden /> Novidades do GiraHub
          </DialogTitle>
          <DialogDescription>O que mudou na versão atual e o histórico das anteriores.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          <Accordion type="multiple" defaultValue={[current.version]}>
            {[current, ...history].map((note, i) => (
              <AccordionItem key={note.version} value={note.version}>
                <AccordionTrigger className="items-center hover:no-underline">
                  <span className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Versão {note.version}</span>
                      {i === 0 && <Badge className="border-transparent">Atual</Badge>}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {note.title} · {formatReleaseDate(note.date)}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <NoteBody note={note} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <DialogFooter className="flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id="release-notes-dont-show" checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
            <Label htmlFor="release-notes-dont-show" className="text-sm font-normal">
              Não mostrar novamente
            </Label>
          </div>
          <Button onClick={() => handleOpenChange(false)}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReleaseNotesDialog;
