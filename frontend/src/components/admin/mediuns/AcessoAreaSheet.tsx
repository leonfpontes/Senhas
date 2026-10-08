/**
 * AcessoAreaSheet — acesso de um médium à Área do Médium (AM-03, jornada J10 do protótipo).
 *
 * - Sem acesso / convite enviado: confere o e-mail (mascarado) e a mensagem pronta; "Enviar
 *   pelo WhatsApp" cria o convite (o e-mail sai junto) e abre o `wa.me` com o texto; "Copiar
 *   link do convite" cria e copia. Reenviar cancela o link anterior. Convite em aberto pode
 *   ser cancelado.
 * - Ativo: "Tirar o acesso à Área" (ConfirmDialog) — vale na hora, o cadastro continua.
 * - Sem e-mail válido: pede o e-mail no cadastro ("Editar cadastro").
 *
 * Quem abre já checou `can('area_medium') && canGroup('mediuns', 'edit')`.
 */
import React, { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Clock, Copy, MessageCircle, Pencil } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { useTenant } from '@/providers/ThemeProvider';
import { copyToClipboard } from '@/components/admin/ShareLinkDialog';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  type ConviteCriado,
  type MediumAcesso,
  dataBr,
  detalheErro,
  emailValido,
  mascararEmail,
  primeiroNome,
  statusDe,
} from './acessoArea';

export interface AcessoAreaSheetProps {
  medium: MediumAcesso | null;
  /** Nome do terreiro na prévia da mensagem (padrão: o da marca carregada). */
  casa?: string | null;
  onOpenChange: (open: boolean) => void;
  /** Algo mudou (convite criado, cancelado, acesso retirado): recarregar a lista. */
  onChanged: () => void;
  /** Abre a ficha do médium (para cadastrar o e-mail). */
  onEditar?: (m: MediumAcesso) => void;
}

function Caixa({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3 text-sm">
      <strong className="font-semibold">{titulo}</strong>
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}

export function AcessoAreaSheet({ medium, casa, onOpenChange, onChanged, onEditar }: AcessoAreaSheetProps) {
  const { showSuccess, showError } = useSnackbar();
  const { tenantName } = useTenant();
  const [criado, setCriado] = useState<ConviteCriado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [revogando, setRevogando] = useState(false);

  useEffect(() => {
    setCriado(null);
    setConfirmar(false);
  }, [medium?.id]);

  if (!medium) return null;

  const status = statusDe(medium);
  const primeiro = primeiroNome(medium.nome);
  const temEmail = emailValido(medium.email);
  const reenviar = status === 'convite_enviado';

  const criar = async (): Promise<ConviteCriado | null> => {
    setEnviando(true);
    try {
      const res = await apiClient.post<ConviteCriado>(`/api/v1/admin/mediuns/${medium.id}/convite`);
      setCriado(res.data);
      onChanged();
      return res.data;
    } catch (err) {
      showError(detalheErro(err, 'Não foi possível criar o convite.'));
      return null;
    } finally {
      setEnviando(false);
    }
  };

  const enviarWhatsApp = async () => {
    // Abre a aba já no clique (senão o navegador bloqueia o pop-up depois do await).
    const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    const convite = await criar();
    if (!convite) {
      aba?.close();
      return;
    }
    if (aba) {
      aba.opener = null;
      aba.location.href = convite.whatsapp_url;
    } else {
      window.open(convite.whatsapp_url, '_blank', 'noopener,noreferrer');
    }
    showSuccess(`Convite criado. O WhatsApp abre com a mensagem para ${primeiro}; o convite também foi por e-mail.`);
  };

  const copiarLink = async () => {
    const convite = criado ?? (await criar());
    if (!convite) return;
    const ok = await copyToClipboard(convite.link);
    if (ok) showSuccess('Link do convite copiado.');
    else showError('Não deu para copiar sozinho. Copie o link que aparece na tela.');
  };

  const revogar = async () => {
    setRevogando(true);
    try {
      await apiClient.delete(`/api/v1/admin/mediuns/${medium.id}/acesso`);
      showSuccess(status === 'ativo' ? `Acesso retirado. ${primeiro} saiu da Área.` : 'Convite cancelado.');
      setConfirmar(false);
      onOpenChange(false);
      onChanged();
    } catch (err) {
      showError(detalheErro(err, 'Não foi possível tirar o acesso.'));
    } finally {
      setRevogando(false);
    }
  };

  const linkPrevia = `${typeof window !== 'undefined' ? window.location.origin : ''}/convite/••••`;
  const mensagem =
    criado?.mensagem_whatsapp ??
    `Oi, ${primeiro}! ${casa || tenantName || 'A casa'} convidou você para acessar sua área no GiraHub: a agenda, os avisos e a mensalidade da casa, tudo no seu celular. Ative seu acesso por este link (vale por 7 dias): ${linkPrevia}`;

  let corpo: React.ReactNode;
  if (status === 'ativo') {
    corpo = (
      <>
        <Alert variant="success">
          <CircleCheck aria-hidden />
          <AlertDescription>
            <strong>Acesso ativo{medium.acesso_area?.desde ? ` desde ${dataBr(medium.acesso_area.desde)}` : ''}.</strong>
          </AlertDescription>
        </Alert>
        <Button type="button" variant="destructive" size="touch" onClick={() => setConfirmar(true)}>
          Tirar o acesso à Área
        </Button>
        <p className="text-sm text-muted-foreground">A pessoa sai da Área na hora. O cadastro dela continua.</p>
      </>
    );
  } else if (!medium.is_active) {
    corpo = (
      <Alert variant="warning">
        <CircleAlert aria-hidden />
        <AlertDescription>Médium inativo não recebe convite. Reative o cadastro para convidar.</AlertDescription>
      </Alert>
    );
  } else if (!temEmail) {
    corpo = (
      <>
        <Alert variant="warning">
          <CircleAlert aria-hidden />
          <AlertDescription>
            Para convidar {primeiro}, adicione o e-mail no cadastro. É com ele que {primeiro} vai entrar.
          </AlertDescription>
        </Alert>
        {onEditar && (
          <Button type="button" size="touch" onClick={() => onEditar(medium)}>
            <Pencil aria-hidden /> Editar cadastro
          </Button>
        )}
      </>
    );
  } else {
    corpo = (
      <>
        {criado ? (
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertDescription>
              Convite criado e enviado por e-mail. Vale até {dataBr(criado.expira_em)}.
            </AlertDescription>
          </Alert>
        ) : (
          reenviar && (
            <Alert variant="info">
              <Clock aria-hidden />
              <AlertDescription>
                Convite enviado em {dataBr(medium.acesso_area?.convite_enviado_em)}. Ainda não ativou.
              </AlertDescription>
            </Alert>
          )
        )}
        <Caixa titulo="O convite vai para">
          <strong className="text-foreground">{criado?.email_mascarado ?? mascararEmail(medium.email as string)}</strong>
          <br />
          Confira se o e-mail está certo antes de enviar.
        </Caixa>
        <Caixa titulo="Mensagem pronta">
          <span className="break-words" data-testid="mensagem-convite">
            {mensagem}
          </span>
        </Caixa>
        {criado ? (
          <Button asChild size="touch" className="bg-[#15803d] text-white hover:bg-[#166534]">
            <a href={criado.whatsapp_url} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden /> Enviar pelo WhatsApp
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            size="touch"
            className="bg-[#15803d] text-white hover:bg-[#166534]"
            onClick={enviarWhatsApp}
            disabled={enviando}
          >
            <MessageCircle aria-hidden /> {reenviar ? 'Reenviar pelo WhatsApp' : 'Enviar pelo WhatsApp'}
          </Button>
        )}
        <Button type="button" size="touch" variant="outline" onClick={copiarLink} disabled={enviando}>
          <Copy aria-hidden /> Copiar link do convite
        </Button>
        {criado && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs break-all" data-testid="link-convite">
            {criado.link}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          O convite também vai por e-mail e vale por 7 dias. Reenviar cancela o link anterior.
        </p>
        {(reenviar || criado) && (
          <Button type="button" size="touch" variant="ghost" className="text-destructive-strong" onClick={() => setConfirmar(true)}>
            Cancelar convite
          </Button>
        )}
      </>
    );
  }

  const tirandoAcesso = status === 'ativo';
  return (
    <>
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md" data-testid="acesso-area-sheet">
          <SheetHeader className="border-b">
            <SheetTitle>{medium.nome}</SheetTitle>
            <SheetDescription>Acesso à Área do Médium</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 p-4">{corpo}</div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirmar}
        title={tirandoAcesso ? `Tirar o acesso de ${primeiro}?` : 'Cancelar o convite?'}
        message={
          tirandoAcesso
            ? `${primeiro} sai da Área do Médium na hora. O cadastro continua e você pode convidar de novo depois.`
            : 'O link enviado deixa de valer. Você pode convidar de novo depois.'
        }
        confirmText={tirandoAcesso ? 'Tirar o acesso' : 'Cancelar convite'}
        cancelText="Voltar"
        destructive
        loading={revogando}
        onConfirm={revogar}
        onCancel={() => setConfirmar(false)}
      />
    </>
  );
}

export default AcessoAreaSheet;
