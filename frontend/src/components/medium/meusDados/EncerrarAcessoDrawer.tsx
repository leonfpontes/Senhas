/**
 * "Encerrar meu acesso" (AM-14): explica o que acontece e confirma com a senha atual.
 *
 * `POST /api/v1/medium/meus-dados/encerrar` com `skipAutoLogout`: senha errada volta 400
 * (`SENHA_INCORRETA`), nunca 401 — e mesmo assim o cliente não derruba a sessão por engano.
 * Conta só da Área → o servidor desativa a conta e apaga os cookies; quem também usa o painel
 * só perde a Área (`temPainel` muda o texto).
 */
import React, { useEffect, useState } from 'react';
import { DoorOpen } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { PasswordField } from '@/components/fields';
import { apiClient, type ApiRequestConfig } from '@/services/api_client';
import { erroDaApi } from '@/components/medium/perfil/perfil';
import { ENCERRAR_URL, type EncerrarResposta } from './meusDados';

export interface EncerrarAcessoDrawerProps {
  open: boolean;
  casa: string;
  temPainel: boolean;
  onClose: () => void;
  onDone: (resp: EncerrarResposta) => void;
}

export function encerrarItens(casa: string, temPainel: boolean): string[] {
  const nomeCasa = casa || 'a casa';
  return [
    'Você sai da Área do Médium e retira a autorização de uso dos seus dados na Área.',
    temPainel
      ? 'O seu acesso ao painel do terreiro continua como está.'
      : 'A sua conta da Área é desativada e você sai de todos os aparelhos.',
    `O seu cadastro continua com ${nomeCasa}: ele é da casa. Para pedir outra coisa sobre ele, fale com a direção.`,
    'A direção da casa recebe um aviso. Se mudar de ideia, peça um novo convite.',
  ];
}

export function EncerrarAcessoDrawer({ open, casa, temPainel, onClose, onDone }: EncerrarAcessoDrawerProps) {
  const [senha, setSenha] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSenha('');
    setError(null);
    setSaving(false);
  }, [open]);

  const encerrar = async () => {
    if (!senha) {
      setError('Digite a sua senha para confirmar.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.post<EncerrarResposta>(ENCERRAR_URL, { senha }, {
        skipAutoLogout: true,
      } as ApiRequestConfig);
      onDone(res.data);
    } catch (err) {
      setError(erroDaApi(err, 'Não foi possível encerrar agora. Tente de novo.').message);
      setSaving(false);
    }
  };

  return (
    <CrudDrawer
      open={open}
      onClose={onClose}
      title="Encerrar meu acesso"
      subtitle="Confira o que acontece e confirme com a sua senha."
      icon={<DoorOpen />}
      onSave={encerrar}
      saveLabel="Encerrar meu acesso"
      saving={saving}
      isDirty={Boolean(senha)}
      error={error}
      className="medium-terra"
    >
      <ul className="flex list-disc flex-col gap-2 pl-5 text-base" data-testid="encerrar-itens">
        {encerrarItens(casa, temPainel).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <PasswordField
        label="Sua senha"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        autoComplete="current-password"
        required
      />
    </CrudDrawer>
  );
}

export default EncerrarAcessoDrawer;
