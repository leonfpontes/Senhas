/**
 * /platform/parceiros — pedidos do Programa de Parceiros GiraHub (C-06), só super-admin.
 *
 * Lista os pedidos do formulário público /parceiros (`GET /api/v1/platform/parceiros`) com abas
 * por status (contagem vinda do backend) e busca por nome, loja, cidade, e-mail ou cupom. Clicar
 * num pedido abre o `CrudDrawer` com os contatos e os campos da equipe: status, cupom (criado à mão
 * no Stripe até o $-05) e observações (`PATCH /api/v1/platform/parceiros/{id}`).
 * `?pedido=<id>` (link do e-mail de aviso à equipe) abre o pedido direto.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Handshake, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import PlatformLayout from './layout';
import CrudDrawer from '@/components/CrudDrawer';
import { PageHeader } from '@/components/admin/PageHeader';
import { DataTable, type ColumnDef } from '@/components/admin/DataTable';
import { FieldWrapper, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToneBadge, fmtDateTime, type Tone } from '@/components/platform';
import { tipoParceiroLabel } from '@/constants/parceiros';

export type StatusPedido = 'novo' | 'em_contato' | 'aprovado' | 'recusado';

export interface PedidoParceiro {
  id: string;
  nome: string;
  tipo: string;
  nome_negocio: string | null;
  cidade: string;
  uf: string;
  whatsapp: string;
  email: string;
  como_divulgar: string;
  aceite_regulamento_em: string;
  status: StatusPedido;
  cupom: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

interface ListaResposta {
  items: PedidoParceiro[];
  total: number;
  counts: Record<StatusPedido, number>;
}

export const STATUS_META: Record<StatusPedido, { label: string; tone: Tone }> = {
  novo: { label: 'Novo', tone: 'info' },
  em_contato: { label: 'Em contato', tone: 'warning' },
  aprovado: { label: 'Aprovado', tone: 'success' },
  recusado: { label: 'Recusado', tone: 'muted' },
};
const STATUS_ORDER: StatusPedido[] = ['novo', 'em_contato', 'aprovado', 'recusado'];
type Filtro = StatusPedido | 'todos';

const CUPOM_RE = /^[A-Z0-9_-]{3,40}$/;

function StatusBadge({ status }: { status: StatusPedido }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'muted' as Tone };
  return <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>;
}

/** wa.me com DDI 55 quando o número veio só com DDD. */
function whatsappLink(digitos: string): string {
  const d = digitos.replace(/\D/g, '');
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

interface EdicaoState {
  status: StatusPedido;
  cupom: string;
  observacoes: string;
}

function PedidoDrawer({
  pedido,
  onClose,
  onSaved,
}: {
  pedido: PedidoParceiro | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const inicial = useMemo<EdicaoState>(
    () => ({ status: pedido?.status ?? 'novo', cupom: pedido?.cupom ?? '', observacoes: pedido?.observacoes ?? '' }),
    [pedido],
  );
  const [form, setForm] = useState<EdicaoState>(inicial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(inicial);
    setError(null);
  }, [inicial]);

  const cupomNormalizado = form.cupom.trim().toUpperCase();
  const cupomInvalido = cupomNormalizado !== '' && !CUPOM_RE.test(cupomNormalizado);
  const isDirty =
    form.status !== inicial.status || cupomNormalizado !== inicial.cupom || form.observacoes.trim() !== inicial.observacoes;

  const salvar = async () => {
    if (!pedido || cupomInvalido) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/api/v1/platform/parceiros/${pedido.id}`, {
        status: form.status,
        cupom: cupomNormalizado,
        observacoes: form.observacoes.trim(),
      });
      onSaved();
      toast.success('Pedido atualizado.');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível salvar o pedido.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrudDrawer
      open={!!pedido}
      onClose={onClose}
      title={pedido?.nome ?? 'Pedido'}
      subtitle={pedido ? `${tipoParceiroLabel(pedido.tipo)} · ${pedido.cidade}/${pedido.uf}` : undefined}
      icon={<Handshake />}
      onSave={salvar}
      saving={saving}
      saveDisabled={!isDirty || cupomInvalido}
      isDirty={isDirty}
      error={error}
    >
      {pedido && (
        <div className="grid gap-5">
          <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Loja / casa / perfil</dt>
              <dd className="font-medium">{pedido.nome_negocio || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contato</dt>
              <dd className="mt-1 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={whatsappLink(pedido.whatsapp)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden /> {pedido.whatsapp}
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`mailto:${pedido.email}`}>
                    <Mail aria-hidden /> {pedido.email}
                  </a>
                </Button>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Como pretende divulgar</dt>
              <dd className="whitespace-pre-line">{pedido.como_divulgar}</dd>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>Recebido em {fmtDateTime(pedido.created_at)}</span>
              <span>Regulamento aceito em {fmtDateTime(pedido.aceite_regulamento_em)}</span>
            </div>
          </dl>

          <FieldWrapper id="pedido-status" label="Status">
            {(control) => (
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as StatusPedido }))}>
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldWrapper>

          <TextField
            id="pedido-cupom"
            label="Cupom"
            value={form.cupom}
            onChange={(e) => setForm((f) => ({ ...f, cupom: e.target.value.toUpperCase() }))}
            maxLength={40}
            error={cupomInvalido ? 'De 3 a 40 letras, números, hífen ou sublinhado.' : undefined}
            helperText="Crie o código promocional no Stripe com o mesmo nome (20% nos 3 primeiros meses)."
          />

          <TextField
            id="pedido-observacoes"
            label="Observações da equipe"
            multiline
            rows={4}
            maxLength={2000}
            value={form.observacoes}
            onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            helperText="Ex.: material enviado, chave PIX, combinados."
          />
        </div>
      )}
    </CrudDrawer>
  );
}

function ParceirosPageContent() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('novo');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [dados, setDados] = useState<ListaResposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aberto, setAberto] = useState<PedidoParceiro | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { limit: 200 };
      if (filtro !== 'todos') params.status = filtro;
      if (buscaAplicada) params.q = buscaAplicada;
      const res = await apiClient.get('/api/v1/platform/parceiros', { params });
      setDados(res.data as ListaResposta);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível carregar os pedidos.'));
    } finally {
      setLoading(false);
    }
  }, [filtro, buscaAplicada]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // ?pedido=<id> (link do e-mail de aviso): abre o pedido, buscando por id se não estiver na lista.
  const pedidoQuery = typeof router.query.pedido === 'string' ? router.query.pedido : null;
  useEffect(() => {
    if (!pedidoQuery) return;
    let ativo = true;
    apiClient
      .get(`/api/v1/platform/parceiros/${pedidoQuery}`)
      .then((res) => ativo && setAberto(res.data as PedidoParceiro))
      .catch(() => ativo && toast.error('Pedido não encontrado.'));
    return () => {
      ativo = false;
    };
  }, [pedidoQuery]);

  const fechar = () => {
    setAberto(null);
    if (pedidoQuery) void router.replace('/platform/parceiros', undefined, { shallow: true });
  };

  const aoSalvar = () => {
    fechar();
    void carregar();
  };

  const counts = dados?.counts;
  const totalGeral = counts ? STATUS_ORDER.reduce((acc, s) => acc + (counts[s] ?? 0), 0) : 0;

  const columns = useMemo<ColumnDef<PedidoParceiro, unknown>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Recebido',
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{fmtDateTime(row.original.created_at)}</span>,
      },
      {
        accessorKey: 'nome',
        header: 'Nome',
        meta: { mobile: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.nome}</p>
            {row.original.nome_negocio && <p className="truncate text-xs text-muted-foreground">{row.original.nome_negocio}</p>}
          </div>
        ),
      },
      { accessorKey: 'tipo', header: 'Tipo', meta: { mobile: true }, cell: ({ row }) => tipoParceiroLabel(row.original.tipo) },
      {
        id: 'local',
        header: 'Cidade',
        meta: { mobile: true },
        accessorFn: (p) => `${p.cidade}/${p.uf}`,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: { mobile: true },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'cupom',
        header: 'Cupom',
        cell: ({ row }) => (row.original.cupom ? <code className="text-xs">{row.original.cupom}</code> : '—'),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Parceiros"
        subtitle="Pedidos do Programa de Parceiros (página pública /parceiros)."
        actions={
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={loading}>
            <RefreshCw aria-hidden /> Atualizar
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <TabsList className="h-auto flex-wrap">
            {STATUS_ORDER.map((s) => (
              <TabsTrigger key={s} value={s}>
                {STATUS_META[s].label}
                {counts ? ` (${counts[s] ?? 0})` : ''}
              </TabsTrigger>
            ))}
            <TabsTrigger value="todos">Todos{counts ? ` (${totalGeral})` : ''}</TabsTrigger>
          </TabsList>
        </Tabs>
        <TextField
          id="parceiros-busca"
          label="Buscar"
          placeholder="Nome, loja, cidade, e-mail ou cupom"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="lg:max-w-xs"
        />
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={dados?.items ?? []}
        getRowId={(p) => p.id}
        loading={loading}
        pageSize={25}
        onRowClick={(p) => setAberto(p)}
        emptyMessage="Nenhum pedido aqui"
        emptyDescription="Os pedidos chegam pelo formulário da página /parceiros."
        emptyIcon={<Handshake />}
      />

      <PedidoDrawer pedido={aberto} onClose={fechar} onSaved={aoSalvar} />
    </>
  );
}

export default function PlatformParceirosPage() {
  return (
    <PlatformLayout title="Parceiros">
      <ParceirosPageContent />
    </PlatformLayout>
  );
}
