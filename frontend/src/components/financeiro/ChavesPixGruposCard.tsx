/**
 * ChavesPixGruposCard — chaves PIX por grupo da corrente (migração 100), em Financeiro →
 * Configuração → Mensalidade, logo abaixo da chave do terreiro.
 *
 * A casa que recebe em mais de uma conta (ex.: PJ e uma conta "alternativa") cadastra aqui a outra
 * chave, diz em qual conta bancária ela cai e quais grupos da corrente pagam nela. Quem não está
 * nesses grupos continua com a chave do terreiro. Médium em dois grupos com chaves diferentes
 * aparece num aviso (vale a chave cadastrada primeiro).
 *
 * - `financeiro:view` vê as chaves mascaradas; criar/editar/excluir seguem insert/edit/delete.
 * - Criar e salvar pedem a senha (ConfirmDialog), com `skipAutoLogout` como na chave do terreiro.
 * - Formulário no `CrudDrawer`; grupos num `MultiCombobox` com a cor de cada grupo.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CircleAlert, KeyRound, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { MultiCombobox, PasswordField, TextField } from '@/components/fields';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { corDoGrupo } from '@/constants/correnteGrupos';
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
  grupos: string[];
}

const EMPTY: FormState = {
  apelido: '',
  tipo: 'cpf',
  chave: '',
  nome: '',
  cidade: '',
  instrucoes: '',
  conta: SEM_CONTA,
  grupos: [],
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
    grupos: c.grupos.map((g) => g.id),
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

  const nomeDaChave = (id: string | null) => data.chaves.find((c) => c.id === id)?.apelido;
  const opcoesGrupos = data.grupos.map((g) => {
    const outra = g.chave_id && g.chave_id !== editTarget?.id ? nomeDaChave(g.chave_id) : undefined;
    return {
      value: g.id,
      label: g.nome,
      dot: corDoGrupo(g.cor),
      description: outra ? `Hoje paga na chave “${outra}” — escolher aqui muda para esta` : undefined,
    };
  });

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
      grupo_ids: form.grupos,
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
      showSuccess(editTarget ? 'Chave PIX atualizada.' : 'Chave PIX criada. Os administradores foram avisados por e-mail.');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setSenhaError(
        status === 401 ? 'Senha incorreta. Confira e tente de novo.' : extractApiErrorMessage(e, 'Não foi possível salvar a chave PIX.'),
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
      showSuccess('Chave excluída. Esses grupos voltam a pagar na chave do terreiro.');
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
          <Users className="size-4 text-brand" aria-hidden /> Chaves PIX por grupo da corrente
        </CardTitle>
        <CardDescription>
          Recebe em mais de uma conta? Cadastre a outra chave e escolha os grupos que pagam nela. Cada mensalidade entra
          no saldo da conta da chave usada. Quem não está nesses grupos paga na chave do terreiro.
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
            Nenhuma chave por grupo. Toda a corrente paga na chave do terreiro.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {data.chaves.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-3 py-3" data-testid="pix-chave-grupo">
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
                    <p className="text-xs text-warning-strong">Nenhum grupo usa esta chave ainda.</p>
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
                          <Pencil /> Editar
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
              </li>
            ))}
          </ul>
        )}

        {canInsert && (
          <div>
            <Button type="button" variant="outline" onClick={abrirNova}>
              <Plus aria-hidden /> Nova chave para grupos
            </Button>
          </div>
        )}
        {data.grupos.length === 0 && (canInsert || canEdit) && (
          <p className="text-xs text-muted-foreground">
            A corrente ainda não tem grupos. Crie os grupos em Médiuns → Grupos da corrente para escolher quem paga em
            cada chave.
          </p>
        )}
      </CardContent>

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editTarget ? 'Editar chave PIX' : 'Nova chave PIX para grupos'}
        subtitle="Outra conta onde parte da corrente paga a mensalidade"
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
          <MultiCombobox
            label="Grupos que pagam nesta chave"
            options={opcoesGrupos}
            value={form.grupos}
            onChange={(v) => set('grupos', v)}
            placeholder={data.grupos.length ? 'Escolha os grupos' : 'Nenhum grupo da corrente'}
            searchPlaceholder="Buscar grupo..."
            countLabel={(n) => `${n} ${n === 1 ? 'grupo' : 'grupos'}`}
            helperText="Os médiuns desses grupos passam a ver esta chave na Área do Médium e recebem o aviso de chave alterada."
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
              Os grupos escolhidos passam a pagar na chave <strong>{PIX_TIPO_LABEL[form.tipo]}</strong>{' '}
              <span className="font-mono">{form.chave}</span>. Todos os administradores do terreiro recebem um e-mail
              quando a chave muda.
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
            A chave <strong>{deleteTarget?.apelido}</strong> sai e os grupos dela voltam a pagar na chave do terreiro. As
            mensalidades já pagas continuam na conta em que caíram.
          </>
        }
        confirmText="Excluir"
        destructive
        loading={deleting}
        onConfirm={excluir}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}

export default ChavesPixGruposCard;
