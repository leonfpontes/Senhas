/**
 * /descadastro/[token]?tipo=… — desligar avisos por e-mail da Área do Médium sem entrar (AM-15).
 *
 * O link vem no rodapé de todo lembrete: `tipo` = um tipo (`mensalidade`, `escalas`,
 * `confirmacao`, `faltas`, `avisos`) ou `todos`. A página consulta o que está ligado
 * (`POST /api/v1/public/avisos-email/consultar`) e só desliga no toque em "Desligar"
 * (`POST .../desligar`) — o leitor de link do provedor de e-mail, que abre a página sozinho, não
 * muda nada. Link que não vale mais → mensagem do servidor. Ligar de novo é pelo Perfil da Área.
 *
 * Identidade das telas de conta (`AuthShell`), como a confirmação de e-mail.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { BellOff, CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient, type ApiRequestConfig } from '@/services/api_client';
import { erroDaApi } from '@/components/medium/perfil/perfil';
import {
  AVISO_EMAIL_TEXTO,
  TIPOS_AVISO_EMAIL,
  type PreferenciasEmail,
  type TipoAvisoEmail,
} from '@/constants/avisosEmail';

// Rota pública: 4xx aqui é regra de negócio, nunca "sessão expirada".
const PUBLICO: ApiRequestConfig = { skipAutoLogout: true };
const API = '/api/v1/public/avisos-email';

interface Estado {
  terreiro_nome?: string | null;
  preferencias: PreferenciasEmail;
}

type Tipo = TipoAvisoEmail | 'todos';

function tipoDaUrl(valor: unknown): Tipo {
  const v = typeof valor === 'string' ? valor : '';
  return (TIPOS_AVISO_EMAIL as readonly string[]).includes(v) ? (v as TipoAvisoEmail) : 'todos';
}

function descricao(tipo: Tipo): string {
  return tipo === 'todos'
    ? 'todos os e-mails da Área do Médium'
    : `os e-mails de “${AVISO_EMAIL_TEXTO[tipo].titulo}”`;
}

export default function DescadastroPage() {
  const router = useRouter();
  const token = router.isReady ? (router.query.token as string | undefined) : undefined;
  const tipo = tipoDaUrl(router.query.tipo);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setCarregando(true);
    apiClient
      .post<Estado>(`${API}/consultar`, { token }, PUBLICO)
      .then((res) => setEstado(res.data))
      .catch((err) => setErro(erroDaApi(err, 'Não foi possível abrir este link agora.').message))
      .finally(() => setCarregando(false));
  }, [token]);

  const desligar = async () => {
    if (!token) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await apiClient.post<Estado>(`${API}/desligar`, { token, tipo }, PUBLICO);
      setEstado(res.data);
      setFeito(true);
    } catch (err) {
      setErro(erroDaApi(err, 'Não foi possível desligar agora. Tente de novo em instantes.').message);
    } finally {
      setEnviando(false);
    }
  };

  if (!router.isReady || (token && carregando && !erro)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-areia-50 px-4">
        <Skeleton className="h-72 w-full max-w-md" />
      </main>
    );
  }

  const casa = estado?.terreiro_nome ? ` de ${estado.terreiro_nome}` : '';
  const jaDesligado =
    estado !== null &&
    (tipo === 'todos' ? TIPOS_AVISO_EMAIL.every((t) => !estado.preferencias[t]) : !estado.preferencias[tipo]);

  return (
    <AuthShell
      headTitle="Avisos por e-mail — GiraHub"
      title={feito || jaDesligado ? 'Pronto!' : 'Avisos por e-mail'}
      subtitle={estado && !feito && !jaDesligado ? `Desligar ${descricao(tipo)}${casa}?` : undefined}
    >
      <div className="flex flex-col gap-6">
        {erro && (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        {estado && (feito || jaDesligado) && (
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertDescription className="block">
              Você não recebe mais {descricao(tipo)}
              {casa}. Para ligar de novo, entre na Área e abra Perfil → Avisos por e-mail.
            </AlertDescription>
          </Alert>
        )}
        {estado && !feito && !jaDesligado && (
          <>
            <Button
              type="button"
              size="touch"
              className="w-full font-bold"
              onClick={() => void desligar()}
              disabled={enviando}
              data-testid="descadastro-desligar"
            >
              {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <BellOff aria-hidden />}
              {enviando ? 'Desligando…' : 'Desligar'}
            </Button>
            <p className="text-sm text-tinta-suave">
              Os avisos continuam na Área do Médium; só o e-mail deixa de chegar.
            </p>
          </>
        )}
        <Button asChild variant="ghost" size="touch" className="w-full text-tinta-suave hover:bg-areia-100 hover:text-tinta">
          <Link href="/login">Entrar na Área</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
