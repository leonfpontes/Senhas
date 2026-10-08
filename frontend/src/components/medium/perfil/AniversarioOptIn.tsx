/**
 * "Mostrar meu aniversário para a corrente" no Perfil da Área (AM-20).
 *
 * Opt-in, desligado por padrão: ligado, o primeiro nome e o dia/mês (nunca o ano) aparecem em
 * "Aniversariantes da semana" no Início dos médiuns da casa. Sem data de nascimento, o botão fica
 * travado e o texto explica que basta preenchê-la em "Meus dados" (o médium edita, AM-13).
 * `PUT /api/v1/medium/perfil/aniversario` muda na hora; deu errado → volta e avisa.
 * Impersonando (`somenteLeitura`), mostra Ligado/Desligado sem o botão (§6.9).
 */
import React, { useState } from 'react';
import { Cake } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { apiClient } from '@/services/api_client';
import { PERFIL_URL, erroDaApi, type MediumPerfil } from './perfil';

export const ANIVERSARIO_URL = `${PERFIL_URL}/aniversario`;

export function AniversarioOptIn({
  perfil,
  somenteLeitura = false,
  onChange,
}: {
  perfil: MediumPerfil;
  somenteLeitura?: boolean;
  onChange: (p: MediumPerfil) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ligado = Boolean(perfil.mostrar_aniversario);
  const semData = !perfil.data_nascimento;

  const mudar = async (mostrar: boolean) => {
    setErro(null);
    setSalvando(true);
    onChange({ ...perfil, mostrar_aniversario: mostrar });
    try {
      const res = await apiClient.put<MediumPerfil>(ANIVERSARIO_URL, { mostrar });
      if (res.data && res.data.casa) onChange(res.data);
    } catch (err) {
      onChange({ ...perfil, mostrar_aniversario: ligado });
      setErro(erroDaApi(err, 'Não foi possível mudar agora. Tente de novo.').message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="flex flex-col gap-2" data-testid="perfil-aniversario" aria-label="Aniversário">
      <h2 className="flex items-center gap-2 px-1 font-display text-xl font-bold">
        <Cake className="size-4 text-muted-foreground" aria-hidden />
        Aniversário
      </h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
        <div className="flex min-h-16 items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="perfil-aniversario-switch" className="text-base font-bold">
              Mostrar meu aniversário para a corrente
            </label>
            <p className="text-sm text-muted-foreground" id="perfil-aniversario-ajuda">
              {semData && !ligado
                ? 'Para mostrar, preencha a sua data de nascimento em Meus dados.'
                : 'Aparecem só o seu primeiro nome, o dia e o mês — nunca o ano.'}
            </p>
          </div>
          {somenteLeitura ? (
            <span className="text-sm font-semibold text-muted-foreground">{ligado ? 'Ligado' : 'Desligado'}</span>
          ) : (
            <Switch
              id="perfil-aniversario-switch"
              checked={ligado}
              disabled={salvando || (semData && !ligado)}
              onCheckedChange={(v) => void mudar(v)}
              aria-describedby="perfil-aniversario-ajuda"
              data-testid="perfil-aniversario-switch"
            />
          )}
        </div>
        {erro && (
          <p className="border-t border-border px-4 py-2 text-sm text-destructive-strong" role="alert">
            {erro}
          </p>
        )}
      </div>
    </section>
  );
}

export default AniversarioOptIn;
