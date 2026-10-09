/**
 * "Colegas de escala" no Perfil da Área (AM-27, D-07): o opt-in "Mostrar meu primeiro nome para os
 * colegas de escala" — padrão desligado. Com ele, o médium aparece (só o primeiro nome) na lista de
 * quem pode ir no lugar quando um colega pede troca. Sem ele, ninguém vê o nome dele.
 *
 * - `GET /api/v1/medium/preferencias` → `mostrar_nome_colegas` e `colegas_disponivel` (a casa tem
 *   troca de escala no plano). Sem troca na casa → a seção some.
 * - Muda na hora (`PUT /api/v1/medium/preferencias/colegas`); deu errado → volta e avisa.
 * - Impersonando (`somenteLeitura`), mostra "Ligado"/"Desligado" sem o botão.
 */
import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { apiClient } from '@/services/api_client';
import { PREFERENCIAS_URL } from '@/constants/avisosEmail';
import { erroDaApi } from './perfil';

interface Resposta {
  mostrar_nome_colegas: boolean;
  colegas_disponivel: boolean;
}

export const COLEGAS_URL = `${PREFERENCIAS_URL}/colegas`;

export function ColegasDeEscala({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    apiClient
      .get<Resposta>(PREFERENCIAS_URL)
      .then((res) => {
        if (vivo && res.data && typeof res.data.colegas_disponivel === 'boolean') setDados(res.data);
      })
      .catch(() => {
        /* sem a seção: o resto do Perfil continua */
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!dados?.colegas_disponivel) return null;
  const ligado = dados.mostrar_nome_colegas;

  const mudar = async (valor: boolean) => {
    const antes = dados;
    setErro(null);
    setSalvando(true);
    setDados({ ...dados, mostrar_nome_colegas: valor });
    try {
      const res = await apiClient.put<Resposta>(COLEGAS_URL, { mostrar_nome: valor });
      setDados(res.data);
    } catch (err) {
      setDados(antes);
      setErro(erroDaApi(err, 'Não foi possível mudar agora. Tente de novo.').message);
    } finally {
      setSalvando(false);
    }
  };

  const id = 'mostrar-nome-colegas';
  return (
    <section className="flex flex-col gap-2" data-testid="perfil-colegas-escala" aria-label="Colegas de escala">
      <h2 className="flex items-center gap-2 px-1 text-base font-semibold">
        <Users className="size-4 text-muted-foreground" aria-hidden />
        Colegas de escala
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
        <div className="flex min-h-16 items-center gap-3 px-4 py-3">
          <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
            <strong className="text-base leading-snug font-semibold">Mostrar meu primeiro nome para os colegas de escala</strong>
            <span className="text-sm text-muted-foreground">
              Assim um colega que precisa trocar a escala pode pedir para você ir no lugar dele.
            </span>
          </label>
          {somenteLeitura ? (
            <span className="shrink-0 text-sm text-muted-foreground" data-testid={`${id}-estado`}>
              {ligado ? 'Ligado' : 'Desligado'}
            </span>
          ) : (
            <Switch
              id={id}
              data-testid={id}
              checked={ligado}
              disabled={salvando}
              onCheckedChange={(v) => void mudar(v)}
              aria-label={`Mostrar meu primeiro nome para os colegas de escala: ${ligado ? 'ligado' : 'desligado'}`}
            />
          )}
        </div>
        {erro && (
          <p className="border-t border-border bg-destructive/10 px-4 py-3 text-sm text-destructive-strong" role="alert">
            {erro}
          </p>
        )}
        <p className="border-t border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Só o primeiro nome aparece, e só para quem pode trocar a escala com você. Telefone e outros dados nunca.
        </p>
      </div>
    </section>
  );
}
