/**
 * ChavePixDosGruposCard — qual chave PIX cada grupo da corrente usa (11/2026), separado do
 * cadastro das chaves (`ChavesPixCard`): primeiro a casa cadastra as chaves, depois escolhe aqui,
 * grupo a grupo, entre as chaves cadastradas (`PUT /config/pix/grupos`, FINANCEIRO:edit + senha).
 *
 * - Lista cada grupo com a chave que ele usa ("Chave principal" quando não tem outra).
 * - "Escolher a chave dos grupos" abre um `CrudDrawer` com um select por grupo; salvar pede a senha
 *   e manda só os grupos que mudaram. Escolher a principal = o grupo fica sem ligação.
 * - Médium em dois grupos com chaves diferentes aparece num aviso (vale a chave cadastrada primeiro).
 */
import React, { useState } from 'react';
import { CircleAlert, Users } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PasswordField } from '@/components/fields';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient, extractApiErrorMessage, type ApiRequestConfig } from '@/services/api_client';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { PIX_GRUPOS_URL, type ChavesPixApi } from './pixChaves';

/** Valor do Select quando o grupo paga na chave principal. */
const PRINCIPAL = '__principal__';

interface Props {
  data: ChavesPixApi;
  onChange: (data: ChavesPixApi) => void;
  canEdit: boolean;
}

export function ChavePixDosGruposCard({ data, onChange, canEdit }: Props) {
  const { showSuccess } = useSnackbar();
  const [open, setOpen] = useState(false);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [senha, setSenha] = useState('');
  const [senhaError, setSenhaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const principal = data.chaves.find((c) => c.principal) ?? null;
  const outras = data.chaves.filter((c) => !c.principal);
  const nomeDaChave = (id: string | null) => {
    const chave = id ? data.chaves.find((c) => c.id === id) : null;
    if (!chave || chave.principal) return principal ? `${principal.apelido} (principal)` : 'Chave principal';
    return chave.apelido;
  };
  const atual = (g: { chave_id: string | null }) => g.chave_id ?? PRINCIPAL;
  const mudados = data.grupos.filter((g) => (escolhas[g.id] ?? atual(g)) !== atual(g));
  const podeEscolher = canEdit && data.grupos.length > 0 && outras.length > 0;

  const abrir = () => {
    setEscolhas(Object.fromEntries(data.grupos.map((g) => [g.id, atual(g)])));
    setOpen(true);
  };

  const salvar = async () => {
    if (!senha) {
      setSenhaError('Digite sua senha para confirmar.');
      return;
    }
    setSaving(true);
    setSenhaError(null);
    try {
      const res = await apiClient.put<ChavesPixApi>(
        PIX_GRUPOS_URL,
        {
          grupos: mudados.map((g) => ({ grupo_id: g.id, chave_id: escolhas[g.id] === PRINCIPAL ? null : escolhas[g.id] })),
          senha,
        },
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      onChange(res.data);
      setConfirmOpen(false);
      setOpen(false);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-brand" aria-hidden /> Chave de cada grupo da corrente
        </CardTitle>
        <CardDescription>
          Escolha, entre as chaves cadastradas, em qual chave cada grupo paga. Os médiuns veem na Área do Médium o PIX copia
          e cola e o QR da chave do grupo deles.
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
              Vale a chave cadastrada primeiro. Para mudar, tire o médium de um dos grupos ou ajuste a chave dos grupos.
            </AlertDescription>
          </Alert>
        )}

        {data.grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            A corrente ainda não tem grupos. Crie os grupos em Médiuns → Grupos da corrente para escolher quem paga em cada
            chave. Enquanto isso, toda a corrente paga na chave principal.
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

        {podeEscolher && (
          <div>
            <Button type="button" variant="outline" onClick={abrir}>
              Escolher a chave dos grupos
            </Button>
          </div>
        )}
        {canEdit && data.grupos.length > 0 && outras.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Todos os grupos pagam na chave principal. Cadastre outra chave em “Chaves PIX da casa” para escolher grupos que
            pagam nela.
          </p>
        )}
      </CardContent>

      <CrudDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Chave de cada grupo"
        subtitle="Escolha entre as chaves cadastradas"
        icon={<Users />}
        onSave={() => {
          if (mudados.length === 0) return;
          setSenha('');
          setSenhaError(null);
          setConfirmOpen(true);
        }}
        saveLabel="Salvar"
        saving={saving}
        saveDisabled={mudados.length === 0}
        isDirty={mudados.length > 0}
      >
        <div className="flex flex-col gap-4">
          {data.grupos.map((g) => (
            <div key={g.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`pix-grupo-${g.id}`}>{g.nome}</Label>
              <Select value={escolhas[g.id] ?? atual(g)} onValueChange={(v) => setEscolhas((e) => ({ ...e, [g.id]: v }))}>
                <SelectTrigger id={`pix-grupo-${g.id}`} className="w-full" aria-label={`Chave do grupo ${g.nome}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PRINCIPAL}>{nomeDaChave(null)}</SelectItem>
                  {outras.map((c) => (
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
        open={confirmOpen}
        title="Confirme com a sua senha"
        confirmText="Salvar"
        loading={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={salvar}
        message={
          <div className="flex flex-col gap-3">
            <ul className="list-disc pl-4">
              {mudados.map((g) => (
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

export default ChavePixDosGruposCard;
