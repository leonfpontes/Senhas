/**
 * Ativação de terreiros novos — tabela da tela "Hoje" (super admin).
 *
 * Lista os cadastros dos últimos 60 dias no estágio do ciclo que gera valor
 * (criar gira → configurar senhas → receber senhas pelo link → Porta), com trial, e-mails de
 * onboarding e contato do responsável, para priorizar o contato pessoal com quem está travado.
 * Dados: `activation` em GET /api/v1/platform/tenant-observatory (services/activation_service.py).
 */
import React from 'react';
import { useRouter } from 'next/router';
import { ExternalLink, Mail, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToneBadge, type Tone } from './PlanBadge';
import { ago, fmtDateShort, whatsappLink } from './format';

export { whatsappLink };

export type ActivationStage = 'sem_gira' | 'sem_senhas' | 'aguardando_senha' | 'recebendo' | 'usou_porta' | 'ativado';

export interface ActivationTenant {
  tenant_id: string;
  tenant_name: string;
  slug: string;
  created_at: string | null;
  days_since_signup: number | null;
  inactive: boolean;
  plan: string | null;
  is_trial: boolean;
  trial_ends_at: string | null;
  trial_days_left: number | null;
  paying: boolean;
  stage: ActivationStage;
  giras: number;
  giras_configuradas: number;
  next_gira_at: string | null;
  public_tickets: number;
  door_used: boolean;
  principal_dor: string | null;
  onboarding_emails: { d1?: string; d3?: string };
  last_activity_at: string | null;
  days_since_activity: number | null;
  contact: { name: string | null; email: string | null; phone: string | null } | null;
}

export interface ActivationData {
  window_days: number;
  total: number;
  by_stage: Record<ActivationStage, number>;
  tenants: ActivationTenant[];
}

export const STAGE_META: Record<ActivationStage, { label: string; hint: string; tone: Tone; color: string }> = {
  sem_gira: { label: 'Sem gira', hint: 'Ainda não criou nenhuma gira', tone: 'destructive', color: 'var(--destructive)' },
  sem_senhas: { label: 'Gira sem senhas', hint: 'Criou gira, mas não configurou as senhas: nada aparece no link', tone: 'destructive', color: 'var(--destructive)' },
  aguardando_senha: { label: 'Aguardando 1ª senha', hint: 'Senhas configuradas, nenhuma emitida pelo link — o link não chegou aos consulentes', tone: 'warning', color: 'var(--warning)' },
  recebendo: { label: 'Recebendo senhas', hint: 'Consulentes já pegam senha pelo link', tone: 'info', color: 'var(--info)' },
  usou_porta: { label: 'Usou a Porta', hint: 'Já fez check-in ou chamou senhas no dia da gira', tone: 'primary', color: 'var(--primary)' },
  ativado: { label: 'Ativado', hint: '20 ou mais senhas pelo link', tone: 'success', color: 'var(--success)' },
};

export const STAGE_ORDER: ActivationStage[] = ['sem_gira', 'sem_senhas', 'aguardando_senha', 'recebendo', 'usou_porta', 'ativado'];

/** Estágios em que o terreiro ainda não gerou valor (alvo de contato). */
export const STUCK_STAGES: ActivationStage[] = ['sem_gira', 'sem_senhas', 'aguardando_senha'];

const DOR_LABELS: Record<string, string> = {
  senhas: 'Senhas',
  mediuns: 'Médiuns',
  financeiro: 'Financeiro',
  divulgacao: 'Divulgação',
  estoque: 'Estoque',
  outro: 'Conhecendo',
};

function TrialCell({ t }: { t: ActivationTenant }) {
  if (t.paying) return <ToneBadge tone="success">Pagante</ToneBadge>;
  if (t.trial_days_left !== null) {
    const tone: Tone = t.trial_days_left <= 7 ? 'destructive' : t.trial_days_left <= 14 ? 'warning' : 'muted';
    return (
      <ToneBadge tone={tone} title={`Termina em ${fmtDateShort(t.trial_ends_at)}`}>
        {`Trial: ${t.trial_days_left}d`}
      </ToneBadge>
    );
  }
  return <span className="text-xs text-muted-foreground uppercase">{t.plan || '—'}</span>;
}

export default function ActivationSection({ data }: { data: ActivationData }) {
  const router = useRouter();

  if (!data.tenants.length) {
    return <p className="text-sm text-muted-foreground">Nenhum cadastro nos últimos {data.window_days} dias.</p>;
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" data-testid="activation-summary">
        {STAGE_ORDER.map((s) => (
          <ToneBadge key={s} tone={STAGE_META[s].tone} title={STAGE_META[s].hint}>
            {`${STAGE_META[s].label}: ${data.by_stage[s] ?? 0}`}
          </ToneBadge>
        ))}
      </div>

      <Card className="overflow-x-auto py-0">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent [&_th]:h-10 [&_th]:text-[0.7rem] [&_th]:font-bold [&_th]:tracking-[0.06em] [&_th]:text-muted-foreground [&_th]:uppercase">
              <TableHead>Terreiro</TableHead>
              <TableHead>Estágio</TableHead>
              <TableHead>Giras</TableHead>
              <TableHead className="text-right">Senhas pelo link</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>E-mails</TableHead>
              <TableHead>Última atividade</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead className="text-center">Ver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.tenants.map((t) => {
              const stage = STAGE_META[t.stage];
              const wa = whatsappLink(t.contact?.phone);
              const contactName = t.contact?.name ?? t.tenant_name;
              return (
                <TableRow
                  key={t.tenant_id}
                  data-testid={`activation-row-${t.slug}`}
                  className={cn('text-[0.8rem] [&_td]:py-2', t.inactive && 'opacity-60')}
                >
                  <TableCell className="min-w-[200px]">
                    <p className="font-semibold">{t.tenant_name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        cadastro {ago(t.days_since_signup)}
                        {t.inactive ? ' · desativado' : ''}
                      </span>
                      {t.principal_dor && (
                        <ToneBadge tone="primary" title="Maior dor informada no cadastro">
                          {DOR_LABELS[t.principal_dor] ?? t.principal_dor}
                        </ToneBadge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={stage.tone} title={stage.hint}>{stage.label}</ToneBadge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{t.giras_configuradas}/{t.giras}</span>
                      </TooltipTrigger>
                      <TooltipContent>Giras com senhas configuradas / total</TooltipContent>
                    </Tooltip>
                    {t.next_gira_at && (
                      <span className="ml-1.5 text-xs text-muted-foreground">próxima {fmtDateShort(t.next_gira_at)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{t.public_tickets}</TableCell>
                  <TableCell><TrialCell t={t} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {t.onboarding_emails.d1 && <ToneBadge title={`Enviado em ${fmtDateShort(t.onboarding_emails.d1)}`}>D+1</ToneBadge>}
                      {t.onboarding_emails.d3 && <ToneBadge title={`Enviado em ${fmtDateShort(t.onboarding_emails.d3)}`}>D+3</ToneBadge>}
                      {!t.onboarding_emails.d1 && !t.onboarding_emails.d3 && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className={cn('whitespace-nowrap', (t.days_since_activity ?? 99) > 7 && 'text-destructive')}>
                    {ago(t.days_since_activity)}
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    {t.contact ? (
                      <div className="flex items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-[0.78rem]">{t.contact.name || '—'}</span>
                        {wa && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button asChild variant="ghost" size="icon-xs" className="text-success">
                                <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${contactName}`}>
                                  <MessageCircle />
                                </a>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>WhatsApp {t.contact.phone}</TooltipContent>
                          </Tooltip>
                        )}
                        {t.contact.email && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button asChild variant="ghost" size="icon-xs">
                                <a href={`mailto:${t.contact.email}`} aria-label={`E-mail de ${contactName}`}>
                                  <Mail />
                                </a>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t.contact.email}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">sem admin ativo</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => router.push(`/platform/tenants/${t.tenant_id}`)}
                      aria-label={`Ver ${t.tenant_name}`}
                    >
                      <ExternalLink />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
    </TooltipProvider>
  );
}
