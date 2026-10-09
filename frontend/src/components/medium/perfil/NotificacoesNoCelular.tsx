/**
 * "Notificações no celular" no Perfil da Área (AM-16) — Web Push.
 *
 * Mesmo desenho de "Avisos por e-mail" (`AvisosPorEmail.tsx`): uma linha por tipo com um `Switch`,
 * muda na hora e volta se der erro. Em cima, uma linha a mais, "Receber notificações neste celular":
 * a permissão do navegador é por aparelho, então é ela que liga (pede a permissão só no toque) ou
 * desliga ESTE celular. E-mail e celular são independentes — o lembrete chega pelos canais ligados.
 *
 * - `GET /api/v1/medium/push` → `{disponivel, chave_publica, aparelhos, preferencias, disponiveis}`.
 *   Sem as chaves no servidor (`disponivel: false`) ou sem tipo disponível, a seção some.
 * - iPhone fora da tela inicial: explica (iOS 16.4+, só com a Área instalada) e abre o passo guiado
 *   de instalação. Navegador sem suporte ou permissão bloqueada: explica como liberar, sem erro cru.
 * - Ao abrir com o aparelho já inscrito, reenvia a inscrição (idempotente: renova as chaves).
 * - Os tipos aparecem quando há aparelho ligado (este ou outro). "Mandar um teste" neste celular.
 * - Impersonando (`somenteLeitura`): só "Ligado"/"Desligado" e quantos aparelhos, sem botões.
 * - `desligarCelularAoSair()`: no "Sair" da Área, desfaz a inscrição deste aparelho (outra pessoa
 *   que entrar no mesmo celular não recebe os avisos de quem saiu).
 */
import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient } from '@/services/api_client';
import {
  AVISO_CELULAR_TEXTO,
  PUSH_INSCRICAO_URL,
  PUSH_URL,
  TIPOS_AVISO_EMAIL,
  type PreferenciasEmail,
  type TipoAvisoEmail,
} from '@/constants/avisosEmail';
import {
  PushNegado,
  corpoDaInscricao,
  desinscrever,
  inscricaoAtual,
  inscrever,
  permissaoAtual,
  suportePush,
  type SuportePush,
} from '@/lib/webPush';
import { erroDaApi } from './perfil';

export interface PushEstado {
  disponivel: boolean;
  chave_publica: string | null;
  aparelhos: number;
  preferencias: PreferenciasEmail;
  disponiveis: TipoAvisoEmail[];
}

function valida(data: unknown): data is PushEstado {
  const d = data as PushEstado | undefined;
  return Boolean(d && typeof d.disponivel === 'boolean' && d.preferencias && Array.isArray(d.disponiveis));
}

const MSG_NEGADO =
  'Você não permitiu as notificações. Para ligar depois, libere nas configurações do navegador (Notificações → Permitir para este site).';

/** No "Sair" da Área: tira este aparelho da lista (no servidor e no navegador). Nunca lança. */
export async function desligarCelularAoSair(limiteMs = 2000): Promise<void> {
  const trabalho = (async () => {
    const sub = await inscricaoAtual();
    if (!sub) return;
    try {
      await apiClient.delete(PUSH_INSCRICAO_URL, { data: { endpoint: sub.endpoint } });
    } catch {
      /* sai mesmo assim */
    }
    await desinscrever(sub);
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, limiteMs);
  });
  try {
    await Promise.race([trabalho, limite]);
  } finally {
    clearTimeout(timer);
  }
}

export function NotificacoesNoCelular({
  somenteLeitura = false,
  onInstalar,
}: {
  somenteLeitura?: boolean;
  onInstalar?: () => void;
}) {
  const { showSuccess } = useSnackbar();
  const [estado, setEstado] = useState<PushEstado | null>(null);
  const [suporte, setSuporte] = useState<SuportePush>('sem-suporte');
  const [permissao, setPermissao] = useState<NotificationPermission | 'indisponivel'>('indisponivel');
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [ocupado, setOcupado] = useState<null | 'aparelho' | 'teste' | TipoAvisoEmail>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let dados: PushEstado | null = null;
      try {
        const res = await apiClient.get<PushEstado>(PUSH_URL);
        if (valida(res.data)) dados = res.data;
      } catch {
        /* sem a seção: o resto do Perfil continua */
      }
      if (!vivo || !dados || !dados.disponivel) return;
      setEstado(dados);
      setSuporte(suportePush());
      setPermissao(permissaoAtual());
      const atual = await inscricaoAtual();
      if (!vivo || !atual) return;
      setSub(atual);
      if (somenteLeitura) return;
      try {
        const res = await apiClient.post<PushEstado>(PUSH_INSCRICAO_URL, corpoDaInscricao(atual));
        if (vivo && valida(res.data)) setEstado(res.data);
      } catch {
        /* fica como estava; tocar em desligar/ligar resolve */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [somenteLeitura]);

  if (!estado || !estado.disponivel) return null;
  const tipos = TIPOS_AVISO_EMAIL.filter((t) => estado.disponiveis.includes(t));
  if (tipos.length === 0) return null;

  const ligar = async () => {
    if (!estado.chave_publica) return;
    setErro(null);
    setOcupado('aparelho');
    let nova: PushSubscription | null = null;
    try {
      nova = await inscrever(estado.chave_publica);
      const res = await apiClient.post<PushEstado>(PUSH_INSCRICAO_URL, corpoDaInscricao(nova));
      setSub(nova);
      if (valida(res.data)) setEstado(res.data);
      showSuccess('Pronto! As notificações chegam neste celular.');
    } catch (err) {
      setPermissao(permissaoAtual());
      if (err instanceof PushNegado) {
        setErro(MSG_NEGADO);
      } else {
        if (nova) await desinscrever(nova);
        setErro(erroDaApi(err, 'Não foi possível ligar as notificações agora. Tente de novo.').message);
      }
    } finally {
      setOcupado(null);
    }
  };

  const desligar = async () => {
    if (!sub) return;
    setErro(null);
    setOcupado('aparelho');
    try {
      await apiClient.delete(PUSH_INSCRICAO_URL, { data: { endpoint: sub.endpoint } });
      await desinscrever(sub);
      setSub(null);
      setEstado({ ...estado, aparelhos: Math.max(0, estado.aparelhos - 1) });
    } catch (err) {
      setErro(erroDaApi(err, 'Não foi possível desligar agora. Tente de novo.').message);
    } finally {
      setOcupado(null);
    }
  };

  const mudarTipo = async (tipo: TipoAvisoEmail, ligado: boolean) => {
    const antes = estado;
    setErro(null);
    setOcupado(tipo);
    setEstado({ ...estado, preferencias: { ...estado.preferencias, [tipo]: ligado } });
    try {
      const res = await apiClient.put<PushEstado>(`${PUSH_URL}/preferencias`, { [tipo]: ligado });
      if (valida(res.data)) setEstado(res.data);
    } catch (err) {
      setEstado(antes);
      setErro(erroDaApi(err, 'Não foi possível mudar agora. Tente de novo.').message);
    } finally {
      setOcupado(null);
    }
  };

  const testar = async () => {
    setErro(null);
    setOcupado('teste');
    try {
      const res = await apiClient.post<{ enviadas: number }>(`${PUSH_URL}/teste`);
      if ((res.data?.enviadas ?? 0) > 0) showSuccess('Enviamos uma notificação de teste. Ela chega em alguns segundos.');
      else setErro('O celular não aceitou a notificação. Desligue e ligue de novo.');
    } catch (err) {
      setErro(erroDaApi(err, 'Não foi possível mandar o teste agora.').message);
    } finally {
      setOcupado(null);
    }
  };

  const mostrarTipos = Boolean(sub) || estado.aparelhos > 0;
  const bloqueado = permissao === 'denied' && !sub;

  let aparelho: React.ReactNode;
  if (somenteLeitura) {
    aparelho = (
      <div className="flex min-h-16 items-center gap-3 px-4 py-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <strong className="text-base leading-snug font-semibold">Aparelhos com notificação</strong>
          <span className="text-sm text-muted-foreground">Ligadas pelo próprio médium no celular</span>
        </span>
        <span className="shrink-0 text-sm text-muted-foreground" data-testid="push-aparelhos">
          {estado.aparelhos}
        </span>
      </div>
    );
  } else if (suporte === 'iphone-sem-instalar') {
    aparelho = (
      <div className="flex flex-col gap-3 px-4 py-3" data-testid="push-iphone">
        <span className="flex flex-col">
          <strong className="text-base leading-snug font-semibold">Receber notificações no iPhone</strong>
          <span className="text-sm text-muted-foreground">
            No iPhone, as notificações só chegam com a Área na tela inicial (iOS 16.4 ou mais novo). Depois de
            adicionar, abra a Área pelo ícone e volte aqui.
          </span>
        </span>
        {onInstalar && (
          <Button type="button" variant="outline" size="touch" className="w-full font-semibold" onClick={onInstalar}>
            <Smartphone aria-hidden />
            Pôr a Área na tela inicial
          </Button>
        )}
      </div>
    );
  } else if (suporte === 'sem-suporte') {
    aparelho = (
      <p className="px-4 py-3 text-sm text-muted-foreground" data-testid="push-sem-suporte">
        Este navegador não recebe notificações. No Android, abra a Área no Chrome; no iPhone, pela tela inicial.
      </p>
    );
  } else if (bloqueado) {
    aparelho = (
      <div className="flex items-start gap-3 px-4 py-3" data-testid="push-bloqueado" role="status">
        <BellOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex flex-col">
          <strong className="text-base leading-snug font-semibold">Notificações bloqueadas neste celular</strong>
          <span className="text-sm text-muted-foreground">
            Para receber, abra as configurações do navegador, procure Notificações e permita para este site. Depois
            volte aqui.
          </span>
        </span>
      </div>
    );
  } else {
    aparelho = (
      <div className="flex min-h-16 items-center gap-3 px-4 py-3">
        <label htmlFor="push-aparelho" className="flex min-w-0 flex-1 flex-col">
          <strong className="text-base leading-snug font-semibold">Receber notificações neste celular</strong>
          <span className="text-sm text-muted-foreground">
            {sub ? 'Ligado neste celular' : 'Toque para ligar. O celular vai pedir sua permissão.'}
          </span>
        </label>
        <Switch
          id="push-aparelho"
          data-testid="push-aparelho"
          checked={Boolean(sub)}
          disabled={ocupado !== null}
          onCheckedChange={(v) => void (v ? ligar() : desligar())}
          aria-label={`Receber notificações neste celular: ${sub ? 'ligado' : 'desligado'}`}
        />
      </div>
    );
  }

  return (
    <section
      className="flex flex-col gap-2"
      data-testid="perfil-notificacoes-celular"
      aria-label="Notificações no celular"
    >
      <div className="flex items-center gap-2 px-1">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Bell className="size-4 text-muted-foreground" aria-hidden />
          Notificações no celular
        </h2>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
        <div className="border-b border-border">{aparelho}</div>
        {mostrarTipos && (
          <ul aria-label="O que chega no celular">
            {tipos.map((tipo) => {
              const texto = AVISO_CELULAR_TEXTO[tipo];
              const ligado = Boolean(estado.preferencias[tipo]);
              const id = `push-tipo-${tipo}`;
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
                        disabled={ocupado !== null}
                        onCheckedChange={(v) => void mudarTipo(tipo, v)}
                        aria-label={`${texto.titulo} no celular: ${ligado ? 'ligado' : 'desligado'}`}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {sub && !somenteLeitura && (
          <div className="border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado !== null}
              onClick={() => void testar()}
              data-testid="push-teste"
            >
              Mandar uma notificação de teste
            </Button>
          </div>
        )}
        {erro && (
          <p className="border-t border-border bg-destructive/10 px-4 py-3 text-sm text-destructive-strong" role="alert">
            {erro}
          </p>
        )}
        <p className="border-t border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          A notificação mostra só o tipo do lembrete e o dia, nada de detalhes da casa na tela bloqueada.
        </p>
      </div>
    </section>
  );
}
