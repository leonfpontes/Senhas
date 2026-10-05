/**
 * Ativação de terreiros novos — seção do Observatório (super-admin).
 *
 * Lista os cadastros dos últimos 60 dias no estágio do ciclo que gera valor
 * (criar gira → configurar senhas → receber senhas pelo link → Porta), com
 * trial, e-mails de onboarding e contato do responsável, para priorizar o
 * contato pessoal com quem está travado. Dados: `activation` em
 * GET /api/v1/platform/tenant-observatory (services/activation_service.py).
 */
import React from "react";
import { useRouter } from "next/router";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";

export type ActivationStage = "sem_gira" | "sem_senhas" | "aguardando_senha" | "recebendo" | "usou_porta" | "ativado";

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

export const STAGE_META: Record<ActivationStage, { label: string; hint: string; color: string }> = {
  sem_gira: { label: "Sem gira", hint: "Ainda não criou nenhuma gira", color: "#EF4444" },
  sem_senhas: { label: "Gira sem senhas", hint: "Criou gira, mas não configurou as senhas: nada aparece no link", color: "#EF4444" },
  aguardando_senha: { label: "Aguardando 1ª senha", hint: "Senhas configuradas, nenhuma emitida pelo link — o link não chegou aos consulentes", color: "#F59E0B" },
  recebendo: { label: "Recebendo senhas", hint: "Consulentes já pegam senha pelo link", color: "#3B82F6" },
  usou_porta: { label: "Usou a Porta", hint: "Já fez check-in ou chamou senhas no dia da gira", color: "#8B5CF6" },
  ativado: { label: "Ativado", hint: "20 ou mais senhas pelo link", color: "#10B981" },
};

const STAGE_ORDER: ActivationStage[] = ["sem_gira", "sem_senhas", "aguardando_senha", "recebendo", "usou_porta", "ativado"];

const DOR_LABELS: Record<string, string> = {
  senhas: "Senhas",
  mediuns: "Médiuns",
  financeiro: "Financeiro",
  divulgacao: "Divulgação",
  estoque: "Estoque",
  outro: "Conhecendo",
};

/** wa.me exige DDI; o cadastro guarda só dígitos (10–13), normalmente sem o 55. */
export function whatsappLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`}`;
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ago(days: number | null): string {
  if (days === null) return "nunca";
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days}d`;
}

function SmallChip({ label, color, title }: { label: string; color: string; title?: string }) {
  const chip = (
    <Chip label={label} size="small" sx={{ fontSize: "0.65rem", fontWeight: 700, height: 20, bgcolor: `${color}18`, color }} />
  );
  return title ? <Tooltip title={title}>{chip}</Tooltip> : chip;
}

function TrialCell({ t }: { t: ActivationTenant }) {
  if (t.paying) return <SmallChip label="Pagante" color="#10B981" />;
  if (t.trial_days_left !== null) {
    const color = t.trial_days_left <= 7 ? "#EF4444" : t.trial_days_left <= 14 ? "#F59E0B" : "#64748B";
    return <SmallChip label={`Trial: ${t.trial_days_left}d`} color={color} title={`Termina em ${fmtShort(t.trial_ends_at)}`} />;
  }
  return (
    <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", textTransform: "uppercase" }}>{t.plan || "—"}</Typography>
  );
}

export default function ActivationSection({ data }: { data: ActivationData }) {
  const router = useRouter();

  if (!data.tenants.length) {
    return (
      <Typography sx={{ fontSize: "0.85rem", color: "text.secondary" }}>
        Nenhum cadastro nos últimos {data.window_days} dias.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }} data-testid="activation-summary">
        {STAGE_ORDER.map((s) => (
          <SmallChip key={s} label={`${STAGE_META[s].label}: ${data.by_stage[s] ?? 0}`} color={STAGE_META[s].color} title={STAGE_META[s].hint} />
        ))}
      </Box>

      <TableContainer component={Card} variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow sx={{ "& th": { fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary", py: 1.25, whiteSpace: "nowrap" } }}>
              <TableCell>Terreiro</TableCell>
              <TableCell>Estágio</TableCell>
              <TableCell>Giras</TableCell>
              <TableCell align="right">Senhas pelo link</TableCell>
              <TableCell>Plano</TableCell>
              <TableCell>E-mails</TableCell>
              <TableCell>Última atividade</TableCell>
              <TableCell>Contato</TableCell>
              <TableCell align="center">Ver</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.tenants.map((t) => {
              const stage = STAGE_META[t.stage];
              const wa = whatsappLink(t.contact?.phone);
              return (
                <TableRow key={t.tenant_id} hover data-testid={`activation-row-${t.slug}`} sx={{ "& td": { py: 1.1, fontSize: "0.8rem" }, opacity: t.inactive ? 0.55 : 1 }}>
                  <TableCell sx={{ minWidth: 200 }}>
                    <Typography sx={{ fontSize: "0.82rem", fontWeight: 600 }}>{t.tenant_name}</Typography>
                    <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", mt: 0.25 }}>
                      <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
                        cadastro {ago(t.days_since_signup)}
                        {t.inactive ? " · desativado" : ""}
                      </Typography>
                      {t.principal_dor && <SmallChip label={DOR_LABELS[t.principal_dor] ?? t.principal_dor} color="#6366F1" title="Maior dor informada no cadastro" />}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <SmallChip label={stage.label} color={stage.color} title={stage.hint} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <Tooltip title="Giras com senhas configuradas / total">
                      <span>{t.giras_configuradas}/{t.giras}</span>
                    </Tooltip>
                    {t.next_gira_at && (
                      <Typography component="span" sx={{ fontSize: "0.7rem", color: "text.secondary", ml: 0.75 }}>
                        próxima {fmtShort(t.next_gira_at)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{t.public_tickets}</TableCell>
                  <TableCell><TrialCell t={t} /></TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      {t.onboarding_emails.d1 && <SmallChip label="D+1" color="#64748B" title={`Enviado em ${fmtShort(t.onboarding_emails.d1)}`} />}
                      {t.onboarding_emails.d3 && <SmallChip label="D+3" color="#64748B" title={`Enviado em ${fmtShort(t.onboarding_emails.d3)}`} />}
                      {!t.onboarding_emails.d1 && !t.onboarding_emails.d3 && <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>—</Typography>}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", color: (t.days_since_activity ?? 99) > 7 ? "#EF4444" : "text.primary" }}>
                    {ago(t.days_since_activity)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    {t.contact ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Typography sx={{ fontSize: "0.78rem", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.contact.name || "—"}
                        </Typography>
                        {wa && (
                          <Tooltip title={`WhatsApp ${t.contact.phone}`}>
                            <IconButton size="small" component="a" href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${t.contact.name ?? t.tenant_name}`}>
                              <WhatsAppIcon sx={{ fontSize: "1rem", color: "#25D366" }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {t.contact.email && (
                          <Tooltip title={t.contact.email}>
                            <IconButton size="small" component="a" href={`mailto:${t.contact.email}`} aria-label={`E-mail de ${t.contact.name ?? t.tenant_name}`}>
                              <MailOutlineRoundedIcon sx={{ fontSize: "1rem" }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>sem admin ativo</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Ver tenant">
                      <IconButton size="small" onClick={() => router.push(`/platform/tenants/${t.tenant_id}`)} aria-label={`Ver ${t.tenant_name}`}>
                        <OpenInNewRoundedIcon sx={{ fontSize: "0.9rem" }} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
