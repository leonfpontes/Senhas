/**
 * "Trocar e-mail de acesso" (AM-13): novo e-mail + senha atual. `POST /api/v1/medium/perfil/email`
 * manda um link (24 h, uso único) para o endereço NOVO; o e-mail de login só muda depois que a
 * pessoa confirma. E-mail já usado por outra conta da casa → 409 com a mensagem do servidor.
 */
import React, { useEffect, useState } from 'react';
import { AtSign } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { PasswordField, TextField } from '@/components/fields';
import { fraunces } from '@/components/landing/fonts';
import { apiClient, type ApiRequestConfig } from '@/services/api_client';
import { cn } from '@/lib/utils';
import { PERFIL_URL, erroDaApi } from './perfil';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface TrocarEmailResposta {
  message: string;
  email_pendente: string;
  email_pendente_expira_em: string;
}

export interface TrocarEmailDrawerProps {
  open: boolean;
  emailAtual: string;
  onClose: () => void;
  onSent: (resp: TrocarEmailResposta) => void;
}

export function TrocarEmailDrawer({ open, emailAtual, onClose, onSent }: TrocarEmailDrawerProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setSenha('');
    setError(null);
  }, [open]);

  const limpo = email.trim().toLowerCase();
  const emailErro = limpo && !EMAIL_RE.test(limpo) ? 'Digite um e-mail válido.' : undefined;

  const enviar = async () => {
    if (!limpo || !senha) {
      setError('Preencha o novo e-mail e a sua senha.');
      return;
    }
    if (emailErro) {
      setError(emailErro);
      return;
    }
    if (limpo === emailAtual.trim().toLowerCase()) {
      setError('Este já é o seu e-mail de acesso.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.post<TrocarEmailResposta>(
        `${PERFIL_URL}/email`,
        { novo_email: limpo, senha_atual: senha },
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      onSent(res.data);
    } catch (err) {
      setError(erroDaApi(err, 'Não foi possível pedir a troca agora. Tente de novo.').message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrudDrawer
      open={open}
      onClose={onClose}
      title="Trocar e-mail de acesso"
      subtitle="Vamos mandar um link para o novo e-mail. Ele só passa a valer depois que você confirmar."
      icon={<AtSign />}
      onSave={enviar}
      saveLabel="Enviar link"
      saving={saving}
      isDirty={Boolean(email || senha)}
      error={error}
      className={cn(fraunces.variable, 'medium-terra')}
    >
      <p className="text-sm text-muted-foreground">
        E-mail de acesso agora: <strong className="text-foreground">{emailAtual}</strong>
      </p>
      <TextField
        label="Novo e-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={emailErro}
        required
        maxLength={255}
      />
      <PasswordField
        label="Sua senha atual"
        helperText="Para confirmar que é você."
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        autoComplete="current-password"
        required
      />
    </CrudDrawer>
  );
}

export default TrocarEmailDrawer;
