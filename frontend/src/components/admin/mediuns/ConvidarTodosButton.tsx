/**
 * "Convidar todos com e-mail (N)" — convite em lote para a Área do Médium (AM-03).
 *
 * Conta os médiuns ativos com e-mail, sem acesso e sem convite em aberto; confirma
 * (ConfirmDialog) e chama `POST /api/v1/admin/mediuns/convite/lote`, que convida por e-mail.
 * Some quando não há ninguém para convidar. Quem renderiza já checou
 * `can('area_medium') && canGroup('mediuns', 'edit')`.
 */
import React, { useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { type MediumAcesso, convidavelEmLote, detalheErro } from './acessoArea';

interface LoteResposta {
  convidados: number;
  sem_email: number;
  ja_convidados: number;
}

export function ConvidarTodosButton({ mediuns, onDone }: { mediuns: MediumAcesso[]; onDone: () => void }) {
  const { showSuccess, showError } = useSnackbar();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const alvos = useMemo(() => mediuns.filter(convidavelEmLote), [mediuns]);

  if (alvos.length === 0) return null;

  const enviar = async () => {
    setEnviando(true);
    try {
      const res = await apiClient.post<LoteResposta>('/api/v1/admin/mediuns/convite/lote');
      const n = res.data?.convidados ?? 0;
      showSuccess(n === 1 ? '1 convite enviado por e-mail.' : `${n} convites enviados por e-mail.`);
      setAberto(false);
      onDone();
    } catch (err) {
      showError(detalheErro(err, 'Não foi possível enviar os convites.'));
    } finally {
      setEnviando(false);
    }
  };

  const nomes = alvos.map((m) => m.nome);
  const lista = nomes.length > 8 ? `${nomes.slice(0, 8).join(', ')} e mais ${nomes.length - 8}` : nomes.join(', ');

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)}>
        <Send aria-hidden />
        Convidar todos com e-mail ({alvos.length})
      </Button>
      <ConfirmDialog
        open={aberto}
        title={alvos.length === 1 ? 'Convidar 1 médium por e-mail?' : `Convidar ${alvos.length} médiuns por e-mail?`}
        message={
          <div className="flex flex-col gap-2">
            <p>{lista}.</p>
            <p>Cada um recebe um link que vale 7 dias. Quem não tem e-mail no cadastro fica de fora.</p>
          </div>
        }
        confirmText="Enviar convites"
        loading={enviando}
        onConfirm={enviar}
        onCancel={() => setAberto(false)}
      />
    </>
  );
}

export default ConvidarTodosButton;
