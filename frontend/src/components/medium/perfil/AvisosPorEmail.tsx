/**
 * "Avisos por e-mail" no Perfil da Área (AM-15): um liga/desliga por tipo de lembrete.
 *
 * - `GET /api/v1/medium/preferencias` → `{preferencias, disponiveis}`; só os tipos de
 *   `disponiveis` aparecem (módulo da casa, plano, isenção). Nada disponível → a seção some.
 * - Tocar na linha muda na hora (`PUT` só com o tipo mudado); deu errado → volta e avisa.
 * - Impersonando (`somenteLeitura`), mostra "Ligado"/"Desligado" sem os botões (§6.9).
 */
import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { apiClient } from '@/services/api_client';
import {
  AVISO_EMAIL_TEXTO,
  PREFERENCIAS_URL,
  TIPOS_AVISO_EMAIL,
  type PreferenciasEmail,
  type TipoAvisoEmail,
} from '@/constants/avisosEmail';
import { erroDaApi } from './perfil';

interface Resposta {
  preferencias: PreferenciasEmail;
  disponiveis: TipoAvisoEmail[];
}

function valida(data: unknown): data is Resposta {
  const d = data as Resposta | undefined;
  return Boolean(d && d.preferencias && Array.isArray(d.disponiveis));
}

export function AvisosPorEmail({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [salvando, setSalvando] = useState<TipoAvisoEmail | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    apiClient
      .get<Resposta>(PREFERENCIAS_URL)
      .then((res) => {
        if (vivo && valida(res.data)) setDados(res.data);
      })
      .catch(() => {
        /* sem a seção: o resto do Perfil continua */
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!dados) return null;
  const tipos = TIPOS_AVISO_EMAIL.filter((t) => dados.disponiveis.includes(t));
  if (tipos.length === 0) return null;

  const mudar = async (tipo: TipoAvisoEmail, ligado: boolean) => {
    const antes = dados;
    setErro(null);
    setSalvando(tipo);
    setDados({ ...dados, preferencias: { ...dados.preferencias, [tipo]: ligado } });
    try {
      const res = await apiClient.put<Resposta>(PREFERENCIAS_URL, { [tipo]: ligado });
      if (valida(res.data)) setDados(res.data);
    } catch (err) {
      setDados(antes);
      setErro(erroDaApi(err, 'Não foi possível mudar agora. Tente de novo.').message);
    } finally {
      setSalvando(null);
    }
  };

  return (
    <section className="flex flex-col gap-2" data-testid="perfil-avisos-email" aria-label="Avisos por e-mail">
      <div className="flex items-center gap-2 px-1">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Mail className="size-4 text-muted-foreground" aria-hidden />
          Avisos por e-mail
        </h2>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
        <ul>
          {tipos.map((tipo) => {
            const texto = AVISO_EMAIL_TEXTO[tipo];
            const ligado = Boolean(dados.preferencias[tipo]);
            const id = `aviso-email-${tipo}`;
            return (
              <li key={tipo} className="border-b border-border last:border-b-0">
                <div className="flex min-h-16 items-center gap-3 px-4 py-3">
                  <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
                    <strong className="text-base leading-snug font-semibold">{texto.titulo}</strong>
                    <span className="text-sm text-muted-foreground">{texto.descricao}</span>
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
                      disabled={salvando !== null}
                      onCheckedChange={(v) => void mudar(tipo, v)}
                      aria-label={`${texto.titulo}: ${ligado ? 'ligado' : 'desligado'}`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {erro && (
          <p className="border-t border-border bg-destructive/10 px-4 py-3 text-sm text-destructive-strong" role="alert">
            {erro}
          </p>
        )}
        <p className="border-t border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Os e-mails não mostram detalhes da casa no assunto. Todo e-mail tem um link para desligar.
        </p>
      </div>
    </section>
  );
}
