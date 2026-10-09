/**
 * Cobranças automáticas do mês (F-02/AM-22) — o PIX/boleto que cada médium gerou na Área, na
 * conta da casa (Stripe ou Mercado Pago), com a situação de cada um. Só leitura: a baixa é do
 * webhook. Some quando o mês não tem nenhuma (casa sem a baixa automática não vê nada).
 *
 * `GET /api/v1/admin/financeiro/mensalidades/cobrancas?mes=` (FINANCEIRO:view). A tela só monta
 * com `enabled` (plano `mensalidade_automatica` + grupo `financeiro:view`).
 */
import React, { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL, formatDateBr } from '@/lib/dateBr';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';

export interface CobrancaAutomaticaItem {
  id: string;
  mediun_id: string;
  mediun_nome: string;
  mes: string;
  valor: number;
  provedor: string;
  metodo: 'pix' | 'boleto';
  status: 'pendente' | 'paga' | 'expirada' | 'cancelada' | 'estornada';
  criada_em: string;
  expira_em: string | null;
  pago_em: string | null;
  valor_pago: number | null;
}

const STATUS: Record<CobrancaAutomaticaItem['status'], { label: string; className: string }> = {
  pendente: { label: 'Aguardando pagamento', className: 'bg-warning/15 text-warning-strong' },
  paga: { label: 'Paga', className: 'bg-success/15 text-success-strong' },
  expirada: { label: 'Expirou', className: 'bg-muted text-muted-foreground' },
  cancelada: { label: 'Substituída', className: 'bg-muted text-muted-foreground' },
  estornada: { label: 'Estornada', className: 'bg-destructive/15 text-destructive-strong' },
};

export function CobrancasAutomaticasDoMes({
  mes,
  enabled,
  refreshKey = 0,
}: {
  mes: string;
  enabled: boolean;
  refreshKey?: number;
}) {
  const [itens, setItens] = useState<CobrancaAutomaticaItem[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let vivo = true;
    apiClient
      .get<CobrancaAutomaticaItem[]>('/api/v1/admin/financeiro/mensalidades/cobrancas', { params: { mes } })
      .then((res) => vivo && setItens(Array.isArray(res.data) ? res.data : []))
      .catch(() => vivo && setItens([]));
    return () => {
      vivo = false;
    };
  }, [enabled, mes, refreshKey]);

  if (!enabled || itens.length === 0) return null;

  return (
    <Card data-testid="cobrancas-automaticas">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="size-4 text-brand" aria-hidden /> Cobranças automáticas do mês
        </CardTitle>
        <CardDescription>PIX e boletos gerados pelos médiuns na Área. A baixa é automática quando o pagamento cai.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {itens.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{c.mediun_nome}</span>
              <span className="text-muted-foreground">
                {c.metodo === 'pix' ? 'PIX' : 'Boleto'} · {formatBRL(c.valor_pago ?? c.valor)}
                {c.pago_em ? ` · paga em ${formatDateBr(c.pago_em)}` : ` · gerada em ${formatDateBr(c.criada_em)}`}
              </span>
              <Badge className={cn('border-transparent', STATUS[c.status]?.className)}>{STATUS[c.status]?.label ?? c.status}</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default CobrancasAutomaticasDoMes;
