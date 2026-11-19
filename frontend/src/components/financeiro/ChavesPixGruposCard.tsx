/**
 * ChavesPixGruposCard — outras chaves PIX da casa e a chave de cada grupo da corrente (migração 100;
 * refeito em 11/2026), em Financeiro → Configuração → Mensalidade, logo abaixo da chave principal.
 *
 * Dois passos, como a direção pensa:
 * 1. "Outras chaves PIX": a casa cadastra quantas chaves precisar (ex.: PJ e uma conta
 *    "alternativa"), cada uma com a conta bancária onde cai. Cadastrar não muda ninguém de chave.
 * 2. "Chave de cada grupo": para cada grupo da corrente, escolhe entre a chave principal e as
 *    cadastradas (`PUT /config/pix/grupos`). Quem não está em grupo com outra chave paga na principal.
 * Médium em dois grupos com chaves diferentes aparece num aviso (vale a chave cadastrada primeiro).
 *
 * - `financeiro:view` vê as chaves mascaradas; criar/editar/excluir seguem insert/edit/delete;
 *   escolher a chave dos grupos é `edit`.
 * - Criar, salvar e escolher pedem a senha (ConfirmDialog), com `skipAutoLogout` como na principal.
 * - Formulários no `CrudDrawer`. Editar uma chave não mexe nos grupos dela (o PUT vai sem `grupo_ids`).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CircleAlert, KeyRound, MoreHorizontal, Plus, Trash2, Users } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PasswordField, TextField } from '@/components/fields';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CartaoClicavel } from '@/components/admin/CartaoClicavel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateBr } from '@/lib/dateBr';
import {
  CIDADE_MAX,
  NOME_RECEBEDOR_MAX,
  PIX_TIPOS,
  PIX_TIPO_LABEL,
  chaveParaCampo,
  maskChavePix,
  validarChavePix,
  type PixTipo,
} from '@/lib/pixChave';
import { apiClient, extractApiErrorMessage, type ApiRequestConfig } from '@/services/api_client';
import { useSnackbar } from '@/contexts/SnackbarContext';
import {
  ContaBancariaSelect,
  INSTRUCOES_MAX,
  PIX_CHAVES_URL,
  SEM_CONTA,
  type ContaBancariaOpcao,
} from './PixConfigCard';

const APELIDO_MAX = 60;
export const PIX_GRUPOS_URL = '/api/v1/admin/financeiro/config/pix/grupos';
/** Valor do Select quando o grupo paga na chave principal. */
const PRINCIPAL = '__principal__';

interface GrupoResumoApi {
  id: string;
  nome: string;
  cor: string;
}

export interface ChavePixGrupoApi {
  id: string;
  apelido: string;
  tipo: PixTipo;
  chave_mascarada: string;
  chave: string | null;
  nome_recebedor: string;
  cidade: string;
  instrucoes: string | null;
  alterado_em: string | null;
  conta_bancaria_id: string | null;
  conta_bancaria_nome: string | null;
  grupos: GrupoResumoApi[];
  total_mediuns: number;
  brcode_previa: string | null;
}

export interface ChavesPixApi {
  chaves: ChavePixGrupoApi[];
  grupos: (GrupoResumoApi & { chave_id: string | null })[];
  contas_bancarias: ContaBancariaOpcao[];
  conflitos: { medium_id: string; medium_nome: string; chave_valida: string; outras: string[] }[];
}

interface FormState {
  apelido: string;
  tipo: PixTipo;
  chave: string;
  nome: string;
  cidade: string;
  instrucoes: string;
  conta: string;
}

const EMPTY: FormState = {
  apelido: '',
  tipo: 'cpf',
  chave: '',
  nome: '',
  cidade: '',
  instrucoes: '',
  conta: SEM_CONTA,
};

function toForm(c: ChavePixGrupoApi): FormState {
  return {
    apelido: c.apelido,
    tipo: c.tipo,
    chave: c.chave ? chaveParaCampo(c.tipo, c.chave) : '',
    nome: c.nome_recebedor,
    cidade: c.cidade,
    instrucoes: c.instrucoes ?? '',
    conta: c.conta_bancaria_id ?? SEM_CONTA,
  };
}

interface Props {
  canInsert: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function ChavesPixGruposCard({ canInsert, canEdit, canDelete }: Props) {
  const { showSuccess, showError } = useSnackbar();
  const [data, setData] = useState<ChavesPixApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChavePixGrupoApi | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [senha, setSenha] = useState('');
  const [senhaError, setSenhaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ChavePixGrupoApi | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Passo 2: chave de cada grupo (grupo_id → chave_id ou PRINCIPAL).
  const [gruposOpen, setGruposOpen] = useState(false);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [gruposConfirmOpen, setGruposConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<ChavesPixApi>(PIX_CHAVES_URL);
      if (!Array.isArray(res.data?.chaves)) throw new Error('resposta inesperada');
      setData(res.data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Skeleton className="h-32 w-full" aria-label="Carregando as chaves dos grupos" />;
  if (loadError || !data) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertDescription>Não foi possível carregar as chaves PIX dos grupos.</AlertDescription>
      </Alert>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const chaveError = validarChavePix(form.tipo, form.chave);
  const apelidoError = !form.apelido.trim() ? 'Dê um nome para a chave.' : null;
  const nomeError = !form.nome.trim() ? 'Informe o nome de quem recebe.' : null;
  const cidadeError = !form.cidade.trim() ? 'Informe a cidade.' : null;
  const invalid = Boolean(chaveError || apelidoError || nomeError || cidadeError);
  const isDirty = JSON.stringify(form) !== JSON.stringify(editTarget ? toForm(editTarget) : EMPTY);
  const tipoAtual = PIX_TIPOS.find((t) => t.value === form.tipo) ?? PIX_TIPOS[0];

  const nomeDaChave = (id: string | null) =>
    (id && data.chaves.find((c) => c.id === id)?.apelido) || 'Chave principal';
  const escolhasAtuais = (): Record<string, string> =>
    Object.fromEntries(data.grupos.map((g) => [g.id, g.chave_id ?? PRINCIPAL]));
  const gruposMudados = data.grupos.filter((g) => (escolhas[g.id] ?? PRINCIPAL) !== (g.chave_id ?? PRINCIPAL));
  const podeEscolherGrupos = canEdit && data.grupos.length > 0 && data.chaves.length > 0;

  const abrirNova = () => {
    setEditTarget(null);
    setForm(EMPTY);
    setTouched(false);
    setDrawerOpen(true);
  };
  const abrirEdicao = (c: ChavePixGrupoApi) => {
    setEditTarget(c);
    setForm(toForm(c));
    setTouched(false);
    setDrawerOpen(true);
  };

  const pedirSenha = () => {
    setTouched(true);
    if (invalid) return;
    setSenha('');
    setSenhaError(null);
    setConfirmOpen(true);
  };

  const salvar = async () => {
    if (!senha) {
      setSenhaError('Digite sua senha para confirmar.');
      return;
    }
    setSaving(true);
    setSenhaError(null);
    const body = {
      apelido: form.apelido,
      tipo: form.tipo,
      chave: form.chave,
      nome_recebedor: form.nome,
      cidade: form.cidade,
      instrucoes: form.instrucoes,
      conta_bancaria_id: form.conta === SEM_CONTA ? null : form.conta,
      // Chave nova nasce sem grupo; editar não mexe nos grupos (escolhidos em "Chave de cada grupo").
      ...(editTarget ? {} : { grupo_ids: [] as string[] }),
      senha,
    };
    // 401 aqui é "senha errada", não sessão expirada: não pode deslogar.
    const cfg = { skipAutoLogout: true } as ApiRequestConfig;
    try {
      const res = editTarget
        ? await apiClient.put<ChavesPixApi>(`${PIX_CHAVES_URL}/${editTarget.id}`, body, cfg)
        : await apiClient.post<ChavesPixApi>(PIX_CHAVES_URL, body, cfg);
      setData(res.data);
      setConfirmOpen(false);
      setDrawerOpen(false);
      setSenha('');
      showSuccess(
        editTarget
          ? 'Chave PIX atualizada.'
          : 'Chave PIX cadastrada. Agora escolha, em “Chave de cada grupo”, quem paga nela.',
      );
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setSenhaError(
        status === 401 ? 'Senha incorreta. Confira e tente de novo.' : extractApiErrorMessage(e, 'Não foi possível salvar a chave PIX.'),
      );
    } finally {
      setSaving(false);
    }
  };

  const abrirGrupos = () => {
    setEscolhas(escolhasAtuais());
    setGruposOpen(true);
  };

  const pedirSenhaGrupos = () => {
    if (gruposMudados.length === 0) return;
    setSenha('');
    setSenhaError(null);
    setGruposConfirmOpen(true);
  };

  const salvarGrupos = async () => {
    if (!senha) {
      setSenhaError('Digite sua senha para confirmar.');
      return;
    }
    setSaving(true);
    setSenhaError(null);
    const body = {
      grupos: gruposMudados.map((g) => ({
        grupo_id: g.id,
        chave_id: escolhas[g.id] === PRINCIPAL ? null : escolhas[g.id],
      })),
      senha,
    };
    try {
      const res = await apiClient.put<ChavesPixApi>(PIX_GRUPOS_URL, body, { skipAutoLogout: true } as ApiRequestConfig);
      setData(res.data);
      setGruposConfirmOpen(false);
      setGruposOpen(false);
      setSenha('');
      showSuccess('Chaves dos grupos salvas. Os médiuns desses grupos já veem a chave nova.');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setSenhaError(
        status === 401
          ? 'Senha incorreta. Confira e tente de novo.'
          : extractApiErrorMessage(e, 'Não foi possível salvar as chaves dos grupos.'),
      );
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`${PIX_CHAVES_URL}/${deleteTarget.id}`);
      showSuccess('Chave excluída. Os grupos dela voltam a pagar na chave principal.');
      await load();
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Não foi possível excluir a chave.'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-brand" aria-hidden /> Outras chaves PIX da casa
        </CardTitle>
        <CardDescription>
          Recebe em mais de uma conta? Cadastre aqui quantas chaves precisar e depois escolha qual chave cada grupo da
          corrente usa. Cada mensalidade entra no saldo da conta da chave usada. Quem não está num grupo com outra chave
          paga na chave principal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.conflitos.length > 0 && (
          <Alert variant="warning" data-testid="pix-conflitos">
            <CircleAlert aria-hidden />
            <AlertTitle>
              {data.conflitos.length === 1
                ? '1 médium está em grupos com chaves diferentes'
                : `${data.conflitos.length} médiuns estão em grupos com chaves diferentes`}
            </AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {data.conflitos.map((c) => (
                  <li key={c.medium_id}>
                    {c.medium_nome}: paga na “{c.chave_valida}” (também está em grupo da “{c.outras.join('”, “')}”)
                  </li>
                ))}
              </ul>
              Vale a chave cadastrada primeiro. Para mudar, tire o médium de um dos grupos ou ajuste os grupos das chaves.
            </AlertDescription>
          </Alert>
        )}

        {data.chaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma outra chave cadastrada. Toda a corrente paga na chave principal.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {data.chaves.map((c) => (
              // Clique para editar (04/11/2026): a linha da chave abre a edição; o menu ⋮ guarda o excluir.
              <CartaoClicavel
                as="li"
                variante="linha"
                key={c.id}
                aoAbrir={canEdit ? () => abrirEdicao(c) : undefined}
                rotulo={`Editar a chave ${c.apelido}`}
                className="flex items-start gap-3 px-3 py-3"
                data-testid="pix-chave-grupo"
              >
                <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm font-semibold">{c.apelido}</p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{PIX_TIPO_LABEL[c.tipo]} · </span>
                    <span className="font-mono">{c.chave ?? c.chave_mascarada}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.conta_bancaria_nome ? `Cai na conta ${c.conta_bancaria_nome}` : 'Sem conta bancária definida'}
                    {` · ${c.total_mediuns} ${c.total_mediuns === 1 ? 'médium' : 'médiuns'}`}
                    {c.alterado_em && ` · alterada em ${formatDateBr(c.alterado_em)}`}
                  </p>
                  {c.grupos.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {c.grupos.map((g) => (
                        <GrupoChip key={g.id} grupo={g} size="sm" />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum grupo usa esta chave ainda.</p>
                  )}
                </div>
                {(canEdit || canDelete) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Ações da chave ${c.apelido}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && (
                        <DropdownMenuItem onSelect={() => abrirEdicao(c)}>
                          Editar
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(c)}>
                          <Trash2 /> Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CartaoClicavel>
            ))}
          </ul>
        )}

        {canInsert && (
          <div>
            <Button type="button" variant="outline" onClick={abrirNova}>
              <Plus aria-hidden /> Nova chave PIX
            </Button>
          </div>
        )}

        <section className="flex flex-col gap-3 border-t pt-4" aria-labelledby="pix-chave-de-cada-grupo">
          <div className="flex flex-col gap-1">
            <h3 id="pix-chave-de-cada-grupo" className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-brand" aria-hidden /> Chave de cada grupo da corrente
            </h3>
            <p className="text-sm text-muted-foreground">
              Os médiuns veem na Área do Médium o PIX copia e cola e o QR da chave do grupo deles.
            </p>
          </div>
          {data.grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              A corrente ainda não tem grupos. Crie os grupos em Médiuns → Grupos da corrente para escolher quem paga em
              cada chave.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border" data-testid="pix-grupos-lista">
              {data.grupos.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <GrupoChip grupo={g} size="sm" />
                  <span className="text-sm">
                    <span className="text-muted-foreground">paga na </span>
                    <span className="font-medium">{nomeDaChave(g.chave_id)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {podeEscolherGrupos && (
            <div>
              <Button type="button" variant="outline" onClick={abrirGrupos}>
                Escolher a chave dos grupos
              </Button>
            </div>
          )}
          {canEdit && data.grupos.length > 0 && data.chaves.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Cadastre outra chave acima para escolher grupos que pagam nela.
            </p>
          )}
        </section>
      </CardContent>

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editTarget ? 'Editar chave PIX' : 'Nova chave PIX'}
        subtitle="Outra conta onde a casa recebe a mensalidade"
        icon={<KeyRound />}
        onSave={pedirSenha}
        saveLabel="Salvar chave"
        saving={saving}
        saveDisabled={!isDirty}
        isDirty={isDirty}
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nome da chave"
            value={form.apelido}
            onChange={(e) => set('apelido', e.target.value.slice(0, APELIDO_MAX))}
            maxLength={APELIDO_MAX}
            placeholder="Ex.: Conta Inter"
            error={touched && apelidoError ? apelidoError : undefined}
            helperText="Só a direção vê esse nome."
            autoFocus
          />
          <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pix-grupo-tipo">Tipo de chave</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as PixTipo, chave: '' }))}>
                <SelectTrigger id="pix-grupo-tipo" className="w-full" aria-label="Tipo de chave">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIX_TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TextField
              label="Chave PIX"
              value={form.chave}
              onChange={(e) => set('chave', maskChavePix(form.tipo, e.target.value))}
              placeholder={tipoAtual.placeholder}
              inputMode={form.tipo === 'cpf' || form.tipo === 'telefone' ? 'numeric' : form.tipo === 'email' ? 'email' : 'text'}
              autoComplete="off"
              error={touched && chaveError ? chaveError : undefined}
            />
          </div>
          <TextField
            label="Nome de quem recebe"
            value={form.nome}
            onChange={(e) => set('nome', e.target.value.slice(0, NOME_RECEBEDOR_MAX))}
            maxLength={NOME_RECEBEDOR_MAX}
            error={touched && nomeError ? nomeError : undefined}
            helperText={`Até ${NOME_RECEBEDOR_MAX} letras, vai sem acento no QR.`}
          />
          <TextField
            label="Cidade"
            value={form.cidade}
            onChange={(e) => set('cidade', e.target.value.slice(0, CIDADE_MAX))}
            maxLength={CIDADE_MAX}
            error={touched && cidadeError ? cidadeError : undefined}
            helperText={`Até ${CIDADE_MAX} letras.`}
          />
          <TextField
            label="Instruções para o médium (opcional)"
            value={form.instrucoes}
            onChange={(e) => set('instrucoes', e.target.value.slice(0, INSTRUCOES_MAX))}
            multiline
            rows={2}
            maxLength={INSTRUCOES_MAX}
          />
          <ContaBancariaSelect
            id="pix-grupo-conta"
            value={form.conta}
            onChange={(v) => set('conta', v)}
            contas={data.contas_bancarias}
            nomeAtual={editTarget?.conta_bancaria_nome}
          />
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirme com a sua senha"
        confirmText="Salvar chave"
        loading={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={salvar}
        message={
          <div className="flex flex-col gap-3">
            <p>
              {editTarget && editTarget.grupos.length > 0 ? 'Os grupos desta chave passam a pagar na chave' : 'Cadastrar a chave'}{' '}
              <strong>{PIX_TIPO_LABEL[form.tipo]}</strong> <span className="font-mono">{form.chave}</span>
              {editTarget && editTarget.grupos.length > 0 ? '.' : '. Ninguém muda de chave até você escolher os grupos.'}{' '}
              Todos os administradores do terreiro recebem um e-mail quando uma chave é criada ou muda.
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir chave PIX"
        message={
          <>
            A chave <strong>{deleteTarget?.apelido}</strong> sai e os grupos dela voltam a pagar na chave principal. As
            mensalidades já pagas continuam na conta em que caíram.
          </>
        }
        confirmText="Excluir"
        destructive
        loading={deleting}
        onConfirm={excluir}
        onCancel={() => setDeleteTarget(null)}
      />
      <CrudDrawer
        open={gruposOpen}
        onClose={() => setGruposOpen(false)}
        title="Chave de cada grupo"
        subtitle="Escolha entre as chaves cadastradas"
        icon={<Users />}
        onSave={pedirSenhaGrupos}
        saveLabel="Salvar"
        saving={saving}
        saveDisabled={gruposMudados.length === 0}
        isDirty={gruposMudados.length > 0}
      >
        <div className="flex flex-col gap-4">
          {data.grupos.map((g) => (
            <div key={g.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`pix-grupo-${g.id}`}>{g.nome}</Label>
              <Select value={escolhas[g.id] ?? PRINCIPAL} onValueChange={(v) => setEscolhas((e) => ({ ...e, [g.id]: v }))}>
                <SelectTrigger id={`pix-grupo-${g.id}`} className="w-full" aria-label={`Chave do grupo ${g.nome}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PRINCIPAL}>Chave principal</SelectItem>
                  {data.chaves.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.conta_bancaria_nome ? `${c.apelido} (${c.conta_bancaria_nome})` : c.apelido}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Os médiuns dos grupos que mudarem de chave veem o aviso “Chave alterada” na Área do Médium.
          </p>
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={gruposConfirmOpen}
        title="Confirme com a sua senha"
        confirmText="Salvar"
        loading={saving}
        onCancel={() => setGruposConfirmOpen(false)}
        onConfirm={salvarGrupos}
        message={
          <div className="flex flex-col gap-3">
            <ul className="list-disc pl-4">
              {gruposMudados.map((g) => (
                <li key={g.id}>
                  {g.nome}: passa a pagar na{' '}
                  <strong>{nomeDaChave(escolhas[g.id] === PRINCIPAL ? null : escolhas[g.id])}</strong>
                </li>
              ))}
            </ul>
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

export default ChavesPixGruposCard;
