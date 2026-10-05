/**
 * Checklist "primeira gira" do dashboard.
 *
 * Guia o terreiro novo pelo ciclo que gera valor no GiraHub (análise de
 * produção de 2026-10-05): criar gira → compartilhar o link de senhas →
 * receber senhas pelo link → usar a Porta no dia da gira. Dos 11 cadastros
 * self-service até ali, 7 criaram gira mas só 5 receberam alguma senha —
 * ninguém dizia que o link precisa ir para o WhatsApp do terreiro.
 *
 * O estado vem do backend (`onboarding` no /dashboard-summary). Só "já
 * compartilhei" e "ocultar" ficam no localStorage, por tenant: são
 * conveniências do navegador, e o passo de compartilhar também se completa
 * sozinho quando chega a primeira senha pelo link.
 */
import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { setAnalyticsTag, trackEvent } from '@/services/analytics';

export interface OnboardingStatus {
  has_gira: boolean;
  public_tickets: number;
  door_used: boolean;
  public_link: string | null;
  completed: boolean;
  /** Resposta do cadastro; define a trilha do tour de boas-vindas. */
  principal_dor?: string | null;
}

export interface FirstGiraChecklistProps {
  status: OnboardingStatus;
  tenantId?: string | null;
  tenantName?: string | null;
  primary: string;
  canCreateGira: boolean;
  canViewPorta: boolean;
}

/**
 * A partir de quantas senhas pelo link o terreiro conta como ativado e o
 * checklist some, mesmo sem usar a Porta (ex.: tenant pagante que só usa a
 * emissão). Evita mostrar "primeiros passos" a quem já usa há meses.
 */
export const ACTIVATED_PUBLIC_TICKETS = 20;

const storageKey = (kind: 'dismissed' | 'shared', tenantId?: string | null) =>
  `girahub:first-gira-checklist:${kind}:${tenantId ?? 'unknown'}`;

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* modo privado / storage bloqueado — segue só na memória */
  }
}

export function buildWhatsAppShareUrl(link: string, tenantName?: string | null): string {
  const quem = tenantName ? ` do ${tenantName}` : '';
  const text =
    `Para pegar sua senha para as giras${quem}, é só abrir este link no celular:\n${link}\n\n` +
    'O link é o mesmo para todas as giras — pode salvar.';
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cai no fallback */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

interface Step {
  key: string;
  title: string;
  done: boolean;
  description: React.ReactNode;
  actions?: React.ReactNode;
}

export default function FirstGiraChecklist({
  status,
  tenantId,
  tenantName,
  primary,
  canCreateGira,
  canViewPorta,
}: FirstGiraChecklistProps) {
  // localStorage só no cliente (evita mismatch de hidratação).
  const [dismissed, setDismissed] = useState(false);
  const [shared, setShared] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    setDismissed(readFlag(storageKey('dismissed', tenantId)));
    setShared(readFlag(storageKey('shared', tenantId)));
    setHydrated(true);
  }, [tenantId]);

  const link = status.public_link;
  const hasPublicTickets = status.public_tickets > 0;

  const markShared = () => {
    if (!shared) {
      setShared(true);
      writeFlag(storageKey('shared', tenantId));
    }
  };

  const handleWhatsApp = () => {
    markShared();
    trackEvent('onboarding_share_whatsapp');
  };

  const handleCopy = async () => {
    if (!link) return;
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopied(true);
      markShared();
      trackEvent('onboarding_copy_link');
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  // Abrir o QR não conta como "compartilhado": se contasse, o passo avançaria
  // e o QR sumiria no mesmo clique, porque ele só aparece no passo atual.
  const handleToggleQr = () => {
    if (!showQr) trackEvent('onboarding_show_qr');
    setShowQr((v) => !v);
  };

  const handleDismiss = () => {
    setDismissed(true);
    writeFlag(storageKey('dismissed', tenantId));
    trackEvent('onboarding_dismiss');
  };

  const shareActions = link ? (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }}>
      <Button
        variant="contained"
        size="small"
        startIcon={<WhatsAppIcon />}
        href={buildWhatsAppShareUrl(link, tenantName)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleWhatsApp}
        sx={{ bgcolor: '#25D366', color: '#fff', '&:hover': { bgcolor: '#1ebe5b' } }}
      >
        Enviar no WhatsApp
      </Button>
      <Button variant="outlined" size="small" startIcon={<ContentCopyRoundedIcon />} onClick={handleCopy}>
        {copied ? 'Link copiado!' : 'Copiar link'}
      </Button>
      <Button variant="outlined" size="small" startIcon={<QrCode2RoundedIcon />} onClick={handleToggleQr}>
        {showQr ? 'Esconder QR code' : 'QR code'}
      </Button>
    </Stack>
  ) : null;

  const steps: Step[] = [
    {
      key: 'gira',
      title: 'Crie sua primeira gira',
      done: status.has_gira,
      description: 'Defina a data, o horário e quantas senhas liberar. Leva menos de um minuto.',
      actions: canCreateGira ? (
        <Button
          component={Link}
          href="/admin/giras?nova=1"
          variant="contained"
          size="small"
          onClick={() => trackEvent('onboarding_cta_create_gira')}
          sx={{ bgcolor: primary, '&:hover': { bgcolor: primary, filter: 'brightness(0.92)' } }}
        >
          Criar gira
        </Button>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Peça a um administrador do terreiro para criar a gira.
        </Typography>
      ),
    },
    {
      key: 'share',
      title: 'Compartilhe o link de senhas',
      done: shared || hasPublicTickets,
      description: (
        <>
          É por este link que os consulentes pegam a senha pelo celular. Mande no grupo de WhatsApp do
          terreiro: ele vale para todas as giras, então é só compartilhar uma vez.
          {link && (
            <Box
              component="span"
              sx={{
                display: 'block',
                mt: 1,
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                wordBreak: 'break-all',
                color: 'text.primary',
              }}
            >
              {link}
            </Box>
          )}
        </>
      ),
      actions: shareActions,
    },
    {
      key: 'tickets',
      title: 'Receba as primeiras senhas',
      done: hasPublicTickets,
      description: hasPublicTickets
        ? `${status.public_tickets} senha(s) já recebida(s) pelo link.`
        : 'Assim que alguém pegar uma senha pelo link, este passo se completa sozinho. Dica: abra o link no seu celular e pegue uma senha de teste.',
      // Enquanto espera a primeira senha, o terreiro ainda precisa das mesmas
      // ações de compartilhar (inclusive o QR), além de testar o link.
      actions: link ? (
        <Stack spacing={1}>
          <Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<OpenInNewRoundedIcon />}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('onboarding_test_link')}
            >
              Testar o link
            </Button>
          </Box>
          {shareActions}
        </Stack>
      ) : null,
    },
    {
      key: 'porta',
      title: 'Use a Porta no dia da gira',
      done: status.door_used,
      description:
        'Na hora da gira, abra a Porta no celular para fazer o check-in e chamar as senhas na ordem.',
      actions: canViewPorta ? (
        <Button
          component={Link}
          href="/admin/porta"
          variant="outlined"
          size="small"
          onClick={() => trackEvent('onboarding_cta_porta')}
        >
          Abrir a Porta
        </Button>
      ) : null,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const currentIndex = steps.findIndex((s) => !s.done);

  const hidden =
    status.completed || status.public_tickets >= ACTIVATED_PUBLIC_TICKETS || dismissed || !hydrated;

  useEffect(() => {
    if (hidden) return;
    setAnalyticsTag('onboarding_step', String(currentIndex + 1));
  }, [hidden, currentIndex]);

  if (hidden) return null;

  return (
    <Paper
      elevation={0}
      data-testid="first-gira-checklist"
      data-tour="first-gira-checklist"
      sx={{ border: '1px solid', borderColor: primary, borderRadius: 3, p: { xs: 2, sm: 3 }, mb: 3 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Primeiros passos: sua primeira gira
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Siga estes passos para os consulentes começarem a pegar senha pelo celular.
          </Typography>
        </Box>
        <Tooltip title="Ocultar">
          <IconButton size="small" onClick={handleDismiss} aria-label="Ocultar primeiros passos">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2, mb: 1 }}>
        <LinearProgress
          variant="determinate"
          value={(doneCount / steps.length) * 100}
          sx={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            '& .MuiLinearProgress-bar': { bgcolor: primary },
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {doneCount} de {steps.length}
        </Typography>
      </Box>

      <Stack component="ol" spacing={0} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex;
          return (
            <Box
              component="li"
              key={step.key}
              data-testid={`checklist-step-${step.key}`}
              data-done={step.done ? 'true' : 'false'}
              aria-current={isCurrent ? 'step' : undefined}
              sx={{
                display: 'flex',
                gap: 1.5,
                py: 1.5,
                borderTop: i === 0 ? 'none' : '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ pt: '2px', flexShrink: 0 }}>
                {step.done ? (
                  <CheckCircleRoundedIcon sx={{ color: '#22c55e' }} aria-label="Concluído" />
                ) : (
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '2px solid',
                      borderColor: isCurrent ? primary : 'divider',
                      color: isCurrent ? primary : 'text.secondary',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </Box>
                )}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  fontWeight={isCurrent ? 700 : 500}
                  color={step.done ? 'text.secondary' : 'text.primary'}
                  sx={{ textDecoration: step.done ? 'line-through' : 'none' }}
                >
                  {step.title}
                </Typography>
                <Collapse in={isCurrent} unmountOnExit>
                  <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                    {step.description}
                  </Typography>
                  {step.actions && <Box sx={{ mt: 1.5 }}>{step.actions}</Box>}
                  {(step.key === 'share' || step.key === 'tickets') && link && (
                    <Collapse in={showQr} unmountOnExit>
                      <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                          <QRCodeSVG value={link} size={148} level="M" data-testid="checklist-qr" />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 260 }}>
                          Imprima e deixe na entrada do terreiro: quem chegar aponta a câmera do celular e pega a
                          senha.
                        </Typography>
                      </Box>
                    </Collapse>
                  )}
                </Collapse>
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}
