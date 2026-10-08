/**
 * "Trocar senha" (AM-13): senha atual, nova (regra visível, a mesma do servidor) e confirmação.
 * `POST /api/v1/medium/perfil/senha` segue as regras do perfil do painel: derruba TODAS as
 * sessões, esta inclusive — a tela avisa e manda para o login. Senha atual errada volta 400
 * (`SENHA_INCORRETA`), nunca 401: a sessão não cai por engano.
 */
import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { PasswordField } from '@/components/fields';
import { PasswordRules } from '@/components/auth';
import { fraunces } from '@/components/landing/fonts';
import { apiClient, type ApiRequestConfig } from '@/services/api_client';
import { passwordError } from '@/constants/passwordPolicy';
import { cn } from '@/lib/utils';
import { PERFIL_URL, erroDaApi } from './perfil';

export interface TrocarSenhaDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Senha trocada: as sessões já caíram no servidor. */
  onDone: () => void;
}

export function TrocarSenhaDrawer({ open, onClose, onDone }: TrocarSenhaDrawerProps) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAtual('');
    setNova('');
    setConfirma('');
    setError(null);
  }, [open]);

  const novaErro = nova ? passwordError(nova) : null;
  const diferente = confirma.length > 0 && confirma !== nova;

  const salvar = async () => {
    if (!atual || !nova || !confirma) {
      setError('Preencha os três campos.');
      return;
    }
    if (novaErro) {
      setError(novaErro);
      return;
    }
    if (diferente) {
      setError('A confirmação não é igual à nova senha.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(
        `${PERFIL_URL}/senha`,
        { senha_atual: atual, nova_senha: nova },
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      onDone();
    } catch (err) {
      setError(erroDaApi(err, 'Não foi possível trocar a senha agora. Tente de novo.').message);
      setSaving(false);
    }
  };

  return (
    <CrudDrawer
      open={open}
      onClose={onClose}
      title="Trocar senha"
      subtitle="Depois da troca, você entra de novo com a nova senha em todos os aparelhos."
      icon={<KeyRound />}
      onSave={salvar}
      saveLabel="Trocar senha"
      saving={saving}
      isDirty={Boolean(atual || nova || confirma)}
      error={error}
      className={cn(fraunces.variable, 'medium-terra')}
    >
      <PasswordField
        label="Senha atual"
        value={atual}
        onChange={(e) => setAtual(e.target.value)}
        autoComplete="current-password"
        required
      />
      <div className="flex flex-col gap-2">
        <PasswordField
          label="Nova senha"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          autoComplete="new-password"
          required
          error={novaErro || undefined}
        />
        <PasswordRules value={nova} />
      </div>
      <PasswordField
        label="Confirmar a nova senha"
        value={confirma}
        onChange={(e) => setConfirma(e.target.value)}
        autoComplete="new-password"
        required
        error={diferente ? 'As senhas não são iguais.' : undefined}
      />
    </CrudDrawer>
  );
}

export default TrocarSenhaDrawer;
