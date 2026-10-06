/**
 * Dica "Instalar a Porta na tela inicial" (P-01).
 *
 * - Android/Chrome/Edge: aparece quando o navegador oferece a instalação (`beforeinstallprompt`,
 *   capturado em `lib/pwa`) e abre o diálogo nativo.
 * - iPhone/iPad: não existe prompt programático; o botão abre um Popover com o caminho
 *   Compartilhar → Adicionar à Tela de Início.
 * - Some para quem já abriu pelo app instalado (`display-mode: standalone`) e para quem
 *   dispensou (lembrado neste navegador em `localStorage`).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Share, Smartphone, SquarePlus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  INSTALL_PROMPT_EVENT,
  captureInstallPrompt,
  consumeInstallPrompt,
  getInstallPrompt,
  isIos,
  isStandalone,
} from '@/lib/pwa';

export const INSTALL_HINT_DISMISS_KEY = 'girahub:porta-instalar-dispensado';

type Mode = 'hidden' | 'prompt' | 'ios';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_HINT_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(INSTALL_HINT_DISMISS_KEY, '1');
  } catch {
    /* storage bloqueado — some só nesta visita */
  }
}

export default function InstallPortaHint() {
  const [mode, setMode] = useState<Mode>('hidden');

  useEffect(() => {
    if (isStandalone() || readDismissed()) return;
    captureInstallPrompt();
    const sync = () => {
      if (isStandalone() || readDismissed()) {
        setMode('hidden');
        return;
      }
      if (getInstallPrompt()) setMode('prompt');
      else setMode(isIos() ? 'ios' : 'hidden');
    };
    sync();
    window.addEventListener(INSTALL_PROMPT_EVENT, sync);
    return () => window.removeEventListener(INSTALL_PROMPT_EVENT, sync);
  }, []);

  const dismiss = useCallback(() => {
    writeDismissed();
    setMode('hidden');
  }, []);

  const install = useCallback(async () => {
    const prompt = consumeInstallPrompt();
    setMode('hidden');
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* o navegador recusou mostrar de novo — fica pelo menu do navegador */
    }
  }, []);

  if (mode === 'hidden') return null;

  const label = 'Instalar a Porta na tela inicial';
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/40 pl-3" data-testid="porta-instalar">
      <Smartphone className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      {mode === 'prompt' ? (
        <Button type="button" variant="ghost" size="touch" className="flex-1 justify-start px-2" onClick={install}>
          {label}
        </Button>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="touch" className="flex-1 justify-start px-2">
              {label}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 text-sm">
            <p className="mb-2 font-medium">No iPhone ou iPad, pelo Safari:</p>
            <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5">
              <li>
                Toque em <strong>Compartilhar</strong> <Share className="inline size-4 align-text-bottom" aria-hidden />{' '}
                (o quadrado com a seta para cima).
              </li>
              <li>
                Escolha <strong>Adicionar à Tela de Início</strong>{' '}
                <SquarePlus className="inline size-4 align-text-bottom" aria-hidden />.
              </li>
              <li>
                Toque em <strong>Adicionar</strong>.
              </li>
            </ol>
            <p className="mt-2 text-muted-foreground">A Porta passa a abrir direto da tela inicial, sem a barra do navegador.</p>
          </PopoverContent>
        </Popover>
      )}
      <Button type="button" variant="ghost" size="icon-touch" aria-label="Dispensar dica de instalação" onClick={dismiss}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
