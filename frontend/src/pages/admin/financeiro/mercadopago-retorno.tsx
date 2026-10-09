/**
 * /admin/financeiro/mercadopago-retorno — volta da autorização do Mercado Pago (F-02/AM-22).
 *
 * É o `MERCADOPAGO_REDIRECT_URI` cadastrado na aplicação do GiraHub no Mercado Pago. O Mercado Pago
 * devolve `?code=…&state=…` (ou `?error=…` se a casa recusou). A página, já logada no painel, manda o
 * código para `POST /api/v1/admin/financeiro/gateway/mercadopago/callback` — o backend confere que o
 * `state` é deste terreiro e deste usuário, troca o código pelos tokens da casa (gravados cifrados) e
 * avisa os administradores. Depois volta para Financeiro → Configuração → Mensalidade.
 *
 * Gates: plano `mensalidade_automatica` e grupo `financeiro:edit` (o mesmo do backend).
 */
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CircleAlert, Loader2 } from 'lucide-react';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import { useSnackbar } from '../../../contexts/SnackbarContext';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { minPlanFor } from '@/constants/plans';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';

const CONFIG = '/admin/financeiro/config?tab=mensalidade';

export default function MercadoPagoRetornoPage() {
  return (
    <AdminLayout title="Conectando o Mercado Pago">
      <MercadoPagoRetorno />
    </AdminLayout>
  );
}

function MercadoPagoRetorno() {
  const router = useRouter();
  const { can, loading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess } = useSnackbar();
  const [erro, setErro] = useState<string | null>(null);
  const enviado = useRef(false);

  const podeEditar = canGroup('financeiro', 'edit');
  const noPlano = can('mensalidade_automatica');
  const code = typeof router.query.code === 'string' ? router.query.code : '';
  const state = typeof router.query.state === 'string' ? router.query.state : '';
  const recusou = typeof router.query.error === 'string';

  useEffect(() => {
    if (!router.isReady || loading || enviado.current || !podeEditar || !noPlano) return;
    if (recusou || !code || !state) {
      setErro('A conexão com o Mercado Pago não foi autorizada. Você pode tentar de novo.');
      return;
    }
    enviado.current = true;
    apiClient
      .post('/api/v1/admin/financeiro/gateway/mercadopago/callback', { code, state })
      .then(() => {
        showSuccess('Mercado Pago conectado. O "Pagar com PIX" da Área já cobra na conta da casa.');
        void router.replace(CONFIG);
      })
      .catch((e) => setErro(extractApiErrorMessage(e, 'Não foi possível conectar o Mercado Pago agora.')));
  }, [router, loading, podeEditar, noPlano, recusou, code, state, showSuccess]);

  if (!loading && !noPlano) {
    return <PlanLocked feature="Mensalidade com baixa automática" minPlan={minPlanFor('mensalidade_automatica').label} />;
  }
  if (!podeEditar) return <PermissionDenied />;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-10">
      {erro ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertTitle>Não deu para conectar</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            {erro}
            <Button asChild size="sm" variant="outline">
              <Link href={CONFIG}>Voltar para a configuração</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Conectando a conta do Mercado Pago…
        </p>
      )}
    </div>
  );
}
