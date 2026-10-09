/**
 * MensalidadeGatewayCard — "Receber a mensalidade automaticamente" (F-02/AM-22), em Financeiro →
 * Configuração → Mensalidade, logo abaixo da chave PIX (AM-10).
 *
 * A casa escolhe onde recebe (decisão do dono de 09/10): **Stripe** (Stripe Connect — cadastro da
 * casa no próprio Stripe, com CPF ou CNPJ) ou **Mercado Pago** (OAuth: a casa entra na conta dela e
 * autoriza; a volta cai em `/admin/financeiro/mercadopago-retorno`). Conectada e com o PIX
 * liberado, o "Pagar com PIX" da Área vira cobrança dinâmica na conta da casa e o mês fica pago
 * sozinho. Sem conexão, tudo segue com a chave PIX + comprovante.
 *
 * - Provedor sem credencial na plataforma não aparece (`provedores_disponiveis`); nenhum → o card
 *   some (a não ser que já exista conta conectada, para poder desconectar).
 * - Plano sem `mensalidade_automatica` → aviso "a partir do Pro" (`minPlanFor`), sem botões.
 * - Conectar / continuar o cadastro / desconectar pedem a senha (ConfirmDialog) e só aparecem com
 *   `financeiro:edit`. Senha errada é **400** (`SENHA_INCORRETA`) — mesmo assim a chamada vai com
 *   `skipAutoLogout` por segurança. Todos os administradores recebem e-mail.
 * - Volta do cadastro do Stripe: `?stripe=retorno` → relê a conta (`/gateway/stripe/atualizar`);
 *   link vencido: `?stripe=renovar` → mostra "Continuar cadastro no Stripe".
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CircleAlert, CircleCheck, Clock, Loader2, Unplug, Zap } from 'lucide-react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PasswordField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { minPlanFor } from '@/constants/plans';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { formatDateBr } from '@/lib/dateBr';
import { apiClient, extractApiErrorMessage, type ApiRequestConfig } from '@/services/api_client';

export const GATEWAY_URL = '/api/v1/admin/financeiro/gateway';

export interface GatewayInfo {
  provedor: 'stripe' | 'mercadopago';
  provedor_label: string;
  status: 'pendente' | 'ativo' | 'desconectado';
  pix_disponivel: boolean;
  boleto_disponivel: boolean;
  cadastro_completo: boolean;
  recebimentos_ativos: boolean;
  cobrando: boolean;
  conectado_em: string | null;
  conectado_por_nome: string | null;
  desconectado_em: string | null;
}

export interface GatewayStatus {
  provedores_disponiveis: string[];
  plano_inclui: boolean;
  gateway: GatewayInfo | null;
}

type Provedor = 'stripe' | 'mercadopago';
type Acao = { tipo: 'conectar'; provedor: Provedor } | { tipo: 'desconectar' };

const PROVEDORES: Record<string, { label: string; descricao: string }> = {
  stripe: {
    label: 'Stripe',
    descricao:
      'A casa abre a conta dela no Stripe (CPF ou CNPJ e a conta do banco para o repasse). Taxa do Stripe por PIX pago, descontada da casa; o GiraHub não cobra nada.',
  },
  mercadopago: {
    label: 'Mercado Pago',
    descricao:
      'A casa entra na conta Mercado Pago dela (CPF ou CNPJ) e autoriza o GiraHub a gerar as cobranças. O PIX cai na conta da casa; a taxa do Mercado Pago é descontada da casa e o GiraHub não cobra nada.',
  },
};

function semAutoLogout(): ApiRequestConfig {
  return { skipAutoLogout: true } as ApiRequestConfig;
}

export function MensalidadeGatewayCard({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const { showSuccess, showError } = useSnackbar();
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [senha, setSenha] = useState('');
  const [senhaError, setSenhaError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const retorno = router?.query?.stripe;

  const atualizarStripe = useCallback(async () => {
    setAtualizando(true);
    try {
      const res = await apiClient.post<GatewayInfo>(`${GATEWAY_URL}/stripe/atualizar`);
      setStatus((s) => (s ? { ...s, gateway: res.data } : s));
      if (res.data.status === 'ativo') showSuccess('Conta do Stripe conectada.');
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Não foi possível conferir a conta no Stripe agora.'));
    } finally {
      setAtualizando(false);
    }
  }, [showError, showSuccess]);

  useEffect(() => {
    let vivo = true;
    apiClient
      .get<GatewayStatus>(GATEWAY_URL)
      .then((res) => {
        if (!vivo) return;
        setStatus(res.data);
        // Voltou do cadastro do Stripe: relê a conta (o webhook também atualiza).
        if (retorno === 'retorno' && canEdit && res.data.gateway?.provedor === 'stripe') void atualizarStripe();
      })
      .catch(() => vivo && setLoadError(true))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
    // `retorno` só importa na carga inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrir = (a: Acao) => {
    setSenha('');
    setSenhaError(null);
    setAcao(a);
  };

  const confirmar = async () => {
    if (!acao) return;
    if (!senha) {
      setSenhaError('Digite sua senha para confirmar.');
      return;
    }
    setEnviando(true);
    setSenhaError(null);
    try {
      if (acao.tipo === 'conectar') {
        const res = await apiClient.post<{ url: string | null; gateway?: GatewayInfo }>(
          `${GATEWAY_URL}/${acao.provedor}/conectar`,
          { senha },
          semAutoLogout(),
        );
        // Mercado Pago só devolve a URL da autorização; o gateway nasce na volta (callback).
        if (res.data.gateway) setStatus((s) => (s ? { ...s, gateway: res.data.gateway ?? null } : s));
        setAcao(null);
        if (res.data.url) {
          window.location.assign(res.data.url);
          return;
        }
        showSuccess('Conta conectada.');
      } else {
        const res = await apiClient.post<GatewayStatus>(`${GATEWAY_URL}/desconectar`, { senha }, semAutoLogout());
        setStatus(res.data);
        setAcao(null);
        showSuccess('Conta desconectada. Os médiuns voltam a pagar pela chave PIX.');
      }
    } catch (e) {
      const code = (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
      setSenhaError(
        code === 'SENHA_INCORRETA'
          ? 'Senha incorreta. Confira e tente de novo.'
          : extractApiErrorMessage(e, 'Não foi possível concluir agora.'),
      );
    } finally {
      setEnviando(false);
    }
  };

  if (loading) return <Skeleton className="h-32 w-full" aria-label="Carregando a mensalidade automática" />;
  if (loadError || !status) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertDescription>Não foi possível carregar a mensalidade automática.</AlertDescription>
      </Alert>
    );
  }

  const gw = status.gateway && status.gateway.status !== 'desconectado' ? status.gateway : null;
  const disponiveis = (Array.isArray(status.provedores_disponiveis) ? status.provedores_disponiveis : []).filter(
    (p) => PROVEDORES[p],
  );
  // Nenhum provedor configurado na plataforma e nada conectado: a opção não aparece.
  if (!gw && disponiveis.length === 0) return null;

  const minPlan = minPlanFor('mensalidade_automatica');

  return (
    <Card data-testid="mensalidade-gateway">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="size-4 text-brand" aria-hidden /> Receber a mensalidade automaticamente
        </CardTitle>
        <CardDescription>
          Conecte a conta da casa e o “Pagar com PIX” da Área vira uma cobrança na conta da casa: quando o médium paga, a
          mensalidade fica paga sozinha, sem comprovante.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!status.plano_inclui && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="gateway-plano">
            <span>
              Disponível a partir do plano <strong>{minPlan.label}</strong>.
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/billing?plan=${minPlan.key}`}>Ver planos</Link>
            </Button>
          </div>
        )}

        {gw ? (
          <div className="flex flex-col gap-3 rounded-md border px-3 py-3 text-sm" data-testid="gateway-conectado">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{gw.provedor_label}</strong>
              {gw.status === 'ativo' ? (
                <Badge className="border-transparent bg-success/15 text-success-strong">
                  <CircleCheck aria-hidden /> Conectada
                </Badge>
              ) : (
                <Badge className="border-transparent bg-warning/15 text-warning-strong">
                  <Clock aria-hidden /> Cadastro em andamento
                </Badge>
              )}
              {gw.conectado_em && (
                <span className="text-muted-foreground">
                  desde {formatDateBr(gw.conectado_em)}
                  {gw.conectado_por_nome ? ` · por ${gw.conectado_por_nome}` : ''}
                </span>
              )}
            </div>
            {gw.status === 'pendente' && (
              <p className="text-muted-foreground">
                {gw.cadastro_completo
                  ? 'O cadastro foi enviado e está em verificação no Stripe. Isso pode levar alguns dias.'
                  : 'Falta terminar o cadastro da casa no Stripe.'}
              </p>
            )}
            {gw.status === 'ativo' && (
              <p className={gw.pix_disponivel ? 'text-success-strong' : 'text-warning-strong'}>
                {gw.pix_disponivel
                  ? `PIX automático ligado${gw.boleto_disponivel ? ' (e boleto)' : ''}.`
                  : `A conta está ativa, mas o PIX ainda não foi liberado pelo ${gw.provedor_label}. Enquanto isso, a Área segue com a chave PIX.`}
              </p>
            )}
            {gw.status === 'ativo' && gw.pix_disponivel && !gw.cobrando && (
              <p className="text-muted-foreground">A cobrança automática está pausada: o plano atual não inclui o recurso.</p>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {gw.provedor === 'stripe' && !gw.cadastro_completo && status.plano_inclui && (
                  <Button type="button" onClick={() => abrir({ tipo: 'conectar', provedor: 'stripe' })}>
                    Continuar cadastro no Stripe
                  </Button>
                )}
                {gw.provedor === 'stripe' && status.plano_inclui && (
                  <Button type="button" variant="outline" onClick={() => void atualizarStripe()} disabled={atualizando}>
                    {atualizando && <Loader2 className="animate-spin" aria-hidden />} Conferir situação
                  </Button>
                )}
                <Button type="button" variant="ghost" className="text-destructive-strong" onClick={() => abrir({ tipo: 'desconectar' })}>
                  <Unplug aria-hidden /> Desconectar
                </Button>
              </div>
            )}
          </div>
        ) : (
          status.plano_inclui &&
          (canEdit ? (
            <div className="flex flex-col gap-3">
              {retorno === 'renovar' && (
                <p className="text-sm text-muted-foreground">O link do cadastro venceu. Toque de novo para continuar.</p>
              )}
              {disponiveis.map((p) => (
                <div key={p} className="flex flex-col gap-2 rounded-md border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <strong>{PROVEDORES[p].label}</strong>
                    <span className="text-muted-foreground">{PROVEDORES[p].descricao}</span>
                  </div>
                  <Button type="button" onClick={() => abrir({ tipo: 'conectar', provedor: p as Provedor })}>
                    Conectar {PROVEDORES[p].label}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma conta conectada. Quem tem permissão de editar o financeiro pode conectar.</p>
          ))
        )}
      </CardContent>

      <ConfirmDialog
        open={acao !== null}
        title="Confirme com a sua senha"
        confirmText={
          acao?.tipo === 'desconectar' ? 'Desconectar' : `Continuar no ${PROVEDORES[acao?.provedor ?? 'stripe'].label}`
        }
        destructive={acao?.tipo === 'desconectar'}
        loading={enviando}
        onCancel={() => setAcao(null)}
        onConfirm={confirmar}
        message={
          <div className="flex flex-col gap-3">
            <p>
              {acao?.tipo === 'desconectar'
                ? 'A casa deixa de receber pela conta conectada e os médiuns voltam a pagar pela chave PIX, com comprovante. A conta continua sendo da casa.'
                : acao?.provedor === 'mercadopago'
                  ? 'Você vai para o Mercado Pago entrar na conta da casa e autorizar o GiraHub. É ela que recebe o dinheiro dos médiuns.'
                  : 'Você vai para o site do Stripe para cadastrar a conta da casa. É ela que recebe o dinheiro dos médiuns.'}{' '}
              Todos os administradores recebem um e-mail avisando.
            </p>
            <PasswordField
              label="Sua senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              error={senhaError ?? undefined}
              autoFocus
            />
          </div>
        }
      />
    </Card>
  );
}

export default MensalidadeGatewayCard;
