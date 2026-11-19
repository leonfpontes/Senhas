/**
 * ChavesPixCard — cadastro único das chaves PIX da mensalidade (migração 112, 11/2026), em
 * Financeiro → Configuração → Mensalidade.
 *
 * Todas as chaves da casa numa lista só: a principal (selo "Principal") e as outras. A primeira
 * chave cadastrada vira a principal; depois a direção troca em "Definir como principal" (menu ⋮).
 * Quem não está num grupo ligado a outra chave paga na principal. Qual grupo usa qual chave fica
 * em outro card (`ChavePixDosGruposCard`).
 *
 * - Cada chave mostra, ao abrir "Ver QR e copia e cola", a prévia gerada no servidor (o mesmo
 *   código que o médium recebe), com o valor da mensalidade.
 * - `financeiro:view` vê as chaves mascaradas e sem prévia; criar/editar/excluir seguem
 *   insert/edit/delete; definir a principal é `edit`.
 * - Criar, salvar e definir a principal pedem a senha (ConfirmDialog), com `skipAutoLogout`.
 * - A principal só sai quando é a única chave (o servidor responde 409 senão; a tela nem oferece).
 * - Formulário no `CrudDrawer`. Editar não mexe nos grupos (o PUT vai sem `grupo_ids`).
 */
import React, { useState } from 'react';
import { KeyRound, MoreHorizontal, Plus, QrCode, Star, Trash2 } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { CartaoClicavel } from '@/components/admin/CartaoClicavel';
import { PasswordField, TextField } from '@/components/fields';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { Badge } from '@/components/ui/badge';
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
  APELIDO_MAX,
  ContaBancariaSelect,
  INSTRUCOES_MAX,
  PIX_CHAVES_URL,
  PixPreview,
  SEM_CONTA,
  type ChavePixApi,
  type ChavesPixApi,
} from './pixChaves';

interface FormState {
  apelido: string;
  tipo: PixTipo;
  chave: string;
  nome: string;
  cidade: string;
  instrucoes: string;
  conta: string;
}

const EMPTY: FormState = { apelido: '', tipo: 'cpf', chave: '', nome: '', cidade: '', instrucoes: '', conta: SEM_CONTA };

function toForm(c: ChavePixApi): FormState {
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

const CFG_SENHA = { skipAutoLogout: true } as ApiRequestConfig;

interface Props {
  data: ChavesPixApi;
  onChange: (data: ChavesPixApi) => void;
  reload: () => Promise<void>;
  canInsert: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function ChavesPixCard({ data, onChange, reload, canInsert, canEdit, canDelete }: Props) {
  const { showSuccess, showError } = useSnackbar();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChavePixApi | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  // Um diálogo de senha para as duas ações: salvar a chave ou definir a principal.
  const [confirmar, setConfirmar] = useState<'salvar' | 'principal' | null>(null);
  const [principalTarget, setPrincipalTarget] = useState<ChavePixApi | null>(null);
  const [senha, setSenha] = useState('');
  const [senhaError, setSenhaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ChavePixApi | null>(null);
  const [deleting, setDeleting] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const chaveError = validarChavePix(form.tipo, form.chave);
  const apelidoError = !form.apelido.trim() ? 'Dê um nome para a chave.' : null;
  const nomeError = !form.nome.trim() ? 'Informe o nome de quem recebe.' : null;
  const cidadeError = !form.cidade.trim() ? 'Informe a cidade.' : null;
  const invalid = Boolean(chaveError || apelidoError || nomeError || cidadeError);
  const isDirty = JSON.stringify(form) !== JSON.stringify(editTarget ? toForm(editTarget) : EMPTY);
  const tipoAtual = PIX_TIPOS.find((t) => t.value === form.tipo) ?? PIX_TIPOS[0];
  const semChave = data.chaves.length === 0;
  const principal = data.chaves.find((c) => c.principal) ?? null;

  const abrirNova = () => {
    setEditTarget(null);
    setForm(EMPTY);
    setTouched(false);
    setDrawerOpen(true);
  };
  const abrirEdicao = (c: ChavePixApi) => {
    setEditTarget(c);
    setForm(toForm(c));
    setTouched(false);
    setDrawerOpen(true);
  };
  const pedirSenha = (acao: 'salvar' | 'principal') => {
    setSenha('');
    setSenhaError(null);
    setConfirmar(acao);
  };

  const confirmarComSenha = async () => {
    if (!senha) {
      setSenhaError('Digite sua senha para confirmar.');
      return;
    }
    setSaving(true);
    setSenhaError(null);
    try {
      if (confirmar === 'principal' && principalTarget) {
        const res = await apiClient.post<ChavesPixApi>(
          `${PIX_CHAVES_URL}/${principalTarget.id}/principal`,
          { senha },
          CFG_SENHA,
        );
        onChange(res.data);
        showSuccess(`“${principalTarget.apelido}” agora é a chave principal.`);
        setPrincipalTarget(null);
      } else {
        const body = {
          apelido: form.apelido,
          tipo: form.tipo,
          chave: form.chave,
          nome_recebedor: form.nome,
          cidade: form.cidade,
          instrucoes: form.instrucoes,
          conta_bancaria_id: form.conta === SEM_CONTA ? null : form.conta,
          ...(editTarget ? {} : { grupo_ids: [] as string[] }),
          senha,
        };
        const res = editTarget
          ? await apiClient.put<ChavesPixApi>(`${PIX_CHAVES_URL}/${editTarget.id}`, body, CFG_SENHA)
          : await apiClient.post<ChavesPixApi>(PIX_CHAVES_URL, body, CFG_SENHA);
        onChange(res.data);
        setDrawerOpen(false);
        showSuccess(
          editTarget
            ? 'Chave PIX atualizada.'
            : semChave
              ? 'Chave PIX cadastrada. Ela é a chave principal da casa.'
              : 'Chave PIX cadastrada. Escolha abaixo os grupos que pagam nela.',
        );
      }
      setConfirmar(null);
      setSenha('');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setSenhaError(
        status === 401
          ? 'Senha incorreta. Confira e tente de novo.'
          : extractApiErrorMessage(e, 'Não foi possível salvar a chave PIX.'),
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
      showSuccess(
        deleteTarget.principal
          ? 'Chave excluída. A casa ficou sem chave PIX.'
          : 'Chave excluída. Os grupos dela voltam a pagar na chave principal.',
      );
      await reload();
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Não foi possível excluir a chave.'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // A principal só pode sair quando é a única chave.
  const podeExcluir = (c: ChavePixApi) => canDelete && (!c.principal || data.chaves.length === 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-brand" aria-hidden /> Chaves PIX da casa
        </CardTitle>
        <CardDescription>
          Para onde vai o dinheiro quando o médium usa “Pagar com PIX”. Sem taxa: o pagamento cai direto na conta da chave.
          A chave principal vale para toda a corrente, menos os grupos que você ligar a outra chave.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {semChave ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma chave cadastrada. Sem chave, a Área do Médium mostra “Combine o pagamento com a casa”. A primeira
            chave que você cadastrar vira a principal.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {data.chaves.map((c) => (
              <li key={c.id} className="flex flex-col" data-testid="pix-chave">
              <CartaoClicavel
                variante="linha"
                aoAbrir={canEdit ? () => abrirEdicao(c) : undefined}
                rotulo={`Editar a chave ${c.apelido}`}
                className="px-3 py-3"
              >
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {c.apelido}
                      {c.principal && (
                        <Badge variant="outline" data-testid="pix-chave-principal">
                          <Star aria-hidden /> Principal
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">{PIX_TIPO_LABEL[c.tipo]} · </span>
                      <span className="font-mono break-all">{c.chave ?? c.chave_mascarada}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.conta_bancaria_nome ? `Cai na conta ${c.conta_bancaria_nome}` : 'Sem conta bancária definida'}
                      {c.principal
                        ? ' · quem não está num grupo ligado a outra chave paga aqui'
                        : ` · ${c.total_mediuns} ${c.total_mediuns === 1 ? 'médium' : 'médiuns'}`}
                      {c.alterado_em && ` · alterada em ${formatDateBr(c.alterado_em)}`}
                    </p>
                    {!c.principal && c.grupos.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.grupos.map((g) => (
                          <GrupoChip key={g.id} grupo={g} size="sm" />
                        ))}
                      </div>
                    )}
                    {c.chave && !c.brcode_previa && (
                      <p className="text-xs text-warning-strong">
                        Não deu para montar o QR desta chave. Abra a chave e confira o nome e a cidade de quem recebe.
                      </p>
                    )}
                  </div>
                  {(canEdit || podeExcluir(c)) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações da chave ${c.apelido}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && <DropdownMenuItem onSelect={() => abrirEdicao(c)}>Editar</DropdownMenuItem>}
                        {canEdit && !c.principal && (
                          <DropdownMenuItem
                            onSelect={() => {
                              setPrincipalTarget(c);
                              pedirSenha('principal');
                            }}
                          >
                            <Star /> Definir como principal
                          </DropdownMenuItem>
                        )}
                        {podeExcluir(c) && (
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(c)}>
                            <Trash2 /> Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CartaoClicavel>
              {c.brcode_previa && (
                <div className="flex flex-col gap-2 px-3 pb-3 pl-10">
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={aberta === c.id}
                      onClick={() => setAberta((a) => (a === c.id ? null : c.id))}
                    >
                      <QrCode aria-hidden /> {aberta === c.id ? 'Esconder QR e copia e cola' : 'Ver QR e copia e cola'}
                    </Button>
                  </div>
                  {aberta === c.id && <PixPreview brcode={c.brcode_previa} valor={data.valor_previa} />}
                </div>
              )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && principal && data.chaves.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Para trocar a principal, use “Definir como principal” no menu ⋮ da chave. A principal só pode ser excluída
            quando for a única chave.
          </p>
        )}

        {canInsert && (
          <div>
            <Button type="button" variant="outline" onClick={abrirNova}>
              <Plus aria-hidden /> Nova chave PIX
            </Button>
          </div>
        )}
      </CardContent>

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editTarget ? 'Editar chave PIX' : 'Nova chave PIX'}
        subtitle={
          editTarget?.principal
            ? 'Chave principal da casa'
            : semChave
              ? 'A primeira chave vira a principal da casa'
              : 'Outra conta onde a casa recebe a mensalidade'
        }
        icon={<KeyRound />}
        onSave={() => {
          setTouched(true);
          if (!invalid) pedirSenha('salvar');
        }}
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
            placeholder="Ex.: Conta Sicredi"
            error={touched && apelidoError ? apelidoError : undefined}
            helperText="Só a direção vê esse nome."
            autoFocus
          />
          <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pix-chave-tipo">Tipo de chave</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as PixTipo, chave: '' }))}>
                <SelectTrigger id="pix-chave-tipo" className="w-full" aria-label="Tipo de chave">
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
            helperText={`Até ${NOME_RECEBEDOR_MAX} letras, vai sem acento no QR. O banco do médium mostra o nome do titular da chave.`}
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
            id="pix-chave-conta"
            value={form.conta}
            onChange={(v) => set('conta', v)}
            contas={data.contas_bancarias}
            nomeAtual={editTarget?.conta_bancaria_nome}
          />
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={confirmar !== null}
        title="Confirme com a sua senha"
        confirmText={confirmar === 'principal' ? 'Definir como principal' : 'Salvar chave'}
        loading={saving}
        onCancel={() => {
          setConfirmar(null);
          setPrincipalTarget(null);
        }}
        onConfirm={confirmarComSenha}
        message={
          <div className="flex flex-col gap-3">
            {confirmar === 'principal' && principalTarget ? (
              <p>
                <strong>{principalTarget.apelido}</strong> passa a ser a chave principal. Quem não está num grupo ligado a
                outra chave passa a pagar nela e vê o aviso “Chave alterada” na Área do Médium.
                {principal && (
                  <>
                    {' '}
                    “{principal.apelido}” continua cadastrada.
                  </>
                )}
              </p>
            ) : (
              <p>
                {editTarget?.principal || semChave
                  ? 'A corrente passa a pagar na chave'
                  : editTarget && editTarget.grupos.length > 0
                    ? 'Os grupos desta chave passam a pagar na chave'
                    : 'Cadastrar a chave'}{' '}
                <strong>{PIX_TIPO_LABEL[form.tipo]}</strong> <span className="font-mono">{form.chave}</span>.{' '}
                Todos os administradores do terreiro recebem um e-mail quando uma chave é criada ou muda.
              </p>
            )}
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
          deleteTarget?.principal ? (
            <>
              A chave <strong>{deleteTarget.apelido}</strong> é a única da casa. Sem ela, a Área do Médium mostra “Combine o
              pagamento com a casa”. As mensalidades já pagas continuam na conta em que caíram.
            </>
          ) : (
            <>
              A chave <strong>{deleteTarget?.apelido}</strong> sai e os grupos dela voltam a pagar na chave principal. As
              mensalidades já pagas continuam na conta em que caíram.
            </>
          )
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

export default ChavesPixCard;
