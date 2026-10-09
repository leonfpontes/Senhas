/**
 * InstallAreaSheet — passo guiado "Deixe a Área na tela inicial" (AM-06, decisão D-23).
 *
 * Abre sozinho no primeiro acesso à Área neste aparelho (lembrado em localStorage) e pelo
 * Perfil → "Ícone na tela inicial". Instruções para Android e iPhone e o aviso de quem abriu o
 * link dentro do WhatsApp (abrir no Chrome/Safari antes). No Android/Chrome com o
 * `beforeinstallprompt` capturado (lib/pwa), o botão principal abre o diálogo nativo. O ícone
 * instalado abre direto na Área: o manifesto da página é `public/manifest-medium.webmanifest`.
 */
import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  consumeInstallPrompt,
  getInstallPrompt,
  INSTALL_PROMPT_EVENT,
  isIos,
  isStandalone,
} from '@/lib/pwa';
import { TerreiroEmblem } from './TerreiroEmblem';

export const INSTALL_AREA_SEEN_KEY = 'girahub:medium-instalar-visto';

type Plataforma = 'android' | 'iphone';

const PASSOS: Record<Plataforma, React.ReactNode[]> = {
  android: [
    <>
      Toque nos três pontinhos <strong>⋮</strong> no canto de cima.
    </>,
    <>
      Toque em <strong>Adicionar à tela inicial</strong> (ou <strong>Instalar app</strong>).
    </>,
    <>Confirme. O ícone da casa aparece junto dos seus apps.</>,
  ],
  iphone: [
    <>
      Toque no botão <strong>Compartilhar</strong> (o quadrado com a seta para cima).
    </>,
    <>
      Role e toque em <strong>Adicionar à Tela de Início</strong>.
    </>,
    <>
      Toque em <strong>Adicionar</strong>. O ícone da casa aparece junto dos seus apps.
    </>,
  ],
};

/** Já viu o passo neste aparelho (ou já está no app instalado). Nunca lança. */
export function installAreaSeen(): boolean {
  if (isStandalone()) return true;
  try {
    return window.localStorage.getItem(INSTALL_AREA_SEEN_KEY) === '1';
  } catch {
    return true; // storage bloqueado: não insiste a cada tela
  }
}

export function markInstallAreaSeen(): void {
  try {
    window.localStorage.setItem(INSTALL_AREA_SEEN_KEY, '1');
  } catch {
    /* storage bloqueado */
  }
}

export interface InstallAreaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terreiroNome?: string | null;
  logoUrl?: string | null;
}

export function InstallAreaSheet({
  open,
  onOpenChange,
  terreiroNome,
  logoUrl,
}: InstallAreaSheetProps) {
  const [plataforma, setPlataforma] = useState<Plataforma>('android');
  const [temPrompt, setTemPrompt] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPlataforma(isIos() ? 'iphone' : 'android');
    const sync = () => setTemPrompt(Boolean(getInstallPrompt()));
    sync();
    window.addEventListener(INSTALL_PROMPT_EVENT, sync);
    return () => window.removeEventListener(INSTALL_PROMPT_EVENT, sync);
  }, [open]);

  const fechar = () => {
    markInstallAreaSeen();
    onOpenChange(false);
  };

  const instalar = async () => {
    const prompt = consumeInstallPrompt();
    fechar();
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* o navegador recusou: fica pelo menu dele */
    }
  };

  const navegador = plataforma === 'android' ? 'Abrir no Chrome' : 'Abrir no Safari';

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) markInstallAreaSeen();
        onOpenChange(v);
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        // Portado para o <body>: leva a paleta da Área junto.
        className="medium-terra mx-auto max-h-[92dvh] max-w-xl gap-5 overflow-y-auto rounded-t-3xl bg-card px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-foreground"
      >
        <span aria-hidden className="mx-auto h-1.5 w-11 rounded-full bg-border" />
        <SheetHeader className="gap-2 p-0 text-left">
          <SheetTitle className="text-xl leading-tight font-semibold tracking-tight">
            Deixe a Área na tela inicial
          </SheetTitle>
          <SheetDescription className="text-base">
            Assim você abre com um toque, sem procurar o link no WhatsApp.
          </SheetDescription>
        </SheetHeader>

        <div
          aria-hidden
          className="flex justify-center gap-5 rounded-xl border border-border bg-muted p-4"
        >
          <span className="flex flex-col items-center gap-1.5 text-xs font-semibold text-foreground">
            <span className="size-16 rounded-xl bg-card shadow-sm" />
            Banco
          </span>
          <span className="flex flex-col items-center gap-1.5 text-xs font-semibold text-foreground">
            <span className="flex size-16 items-center justify-center rounded-xl bg-primary shadow-lg">
              <TerreiroEmblem nome={terreiroNome} logoUrl={logoUrl} className="size-12 ring-0" />
            </span>
            <span className="max-w-20 truncate">{terreiroNome || 'Sua casa'}</span>
          </span>
          <span className="flex flex-col items-center gap-1.5 text-xs font-semibold text-foreground">
            <span className="size-16 rounded-xl bg-card shadow-sm" />
            Fotos
          </span>
        </div>

        <ToggleGroup
          type="single"
          value={plataforma}
          onValueChange={(v) => v && setPlataforma(v as Plataforma)}
          variant="outline"
          className="w-full"
          aria-label="Tipo de celular"
        >
          <ToggleGroupItem value="android" className="h-12 flex-1 text-base font-semibold">
            Android
          </ToggleGroupItem>
          <ToggleGroupItem value="iphone" className="h-12 flex-1 text-base font-semibold">
            iPhone
          </ToggleGroupItem>
        </ToggleGroup>

        <ol
          className="flex flex-col gap-3"
          aria-label={`Passos no ${plataforma === 'android' ? 'Android' : 'iPhone'}`}
        >
          {PASSOS[plataforma].map((passo, i) => (
            <li key={i} className="flex items-start gap-3 text-base">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              >
                {i + 1}
              </span>
              <span className="pt-1">{passo}</span>
            </li>
          ))}
        </ol>

        <p className="flex items-start gap-2.5 rounded-xl bg-info/10 p-3 text-sm text-info-strong">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Abriu dentro do WhatsApp? Antes, toque nos três pontinhos e escolha{' '}
            <strong>{navegador}</strong>.
          </span>
        </p>

        <div className="flex flex-col gap-2">
          {temPrompt && plataforma === 'android' ? (
            <Button
              type="button"
              size="touch"
              className="w-full font-semibold"
              onClick={() => void instalar()}
            >
              Adicionar à tela inicial
            </Button>
          ) : (
            <Button type="button" size="touch" className="w-full font-semibold" onClick={fechar}>
              Pronto, adicionei
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full font-semibold"
            onClick={fechar}
          >
            Agora não
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default InstallAreaSheet;
