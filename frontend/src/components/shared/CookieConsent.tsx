/**
 * Banner de cookies + painel de preferências (LGPD) — montado uma vez no `_app.tsx`.
 *
 * - Aparece enquanto não houver escolha registrada (lib/consent.ts), em qualquer página onde
 *   uma tag opcional poderia rodar — landing, sites dos terreiros, emissão de senha e painel.
 *   Fica de fora só a Porta em modo quiosque (TV), onde ninguém interage com a tela.
 * - "Recusar opcionais" tem o mesmo peso visual de "Aceitar todos" (guia de cookies da ANPD:
 *   recusar tem de ser tão fácil quanto aceitar). Nada opcional vem marcado de fábrica.
 * - "Personalizar" abre o painel com as três categorias, o que cada uma coleta e a lista de
 *   cookies (constants/cookies.ts — a mesma tabela da página /cookies).
 * - O painel reabre a qualquer momento pelo rodapé ("Preferências de cookies") e por /cookies
 *   (`abrirPreferenciasDeCookies()`).
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fraunces } from '@/components/landing/fonts';
import { CATEGORIAS_DE_COOKIES, type CategoriaInfo } from '@/constants/cookies';
import {
  EVENTO_ABRIR_PREFERENCIAS,
  aceitarTudo,
  recusarOpcionais,
  salvarConsentimento,
  type CategoriaOpcional,
} from '@/lib/consent';
import { useConsentimento } from '@/hooks/useConsentimento';

/** Rotas sem banner: telas de exibição, sem ninguém para responder. */
export const ROTAS_SEM_BANNER = ['/admin/porta/kiosk'];

// Recusar e aceitar com o mesmo peso (design ético, ADR 0010).
const BOTAO_IGUAL = 'border-tinta/30 bg-white font-semibold text-tinta hover:bg-areia-100 hover:text-tinta';

function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
}

function CategoriaCard({
  cat,
  ligado,
  onChange,
}: {
  cat: CategoriaInfo;
  ligado: boolean;
  onChange?: (v: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const idTitulo = `cookies-cat-${cat.id}`;
  return (
    <section aria-labelledby={idTitulo} className="rounded-2xl border border-areia-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id={idTitulo} className="font-display text-lg font-bold text-tinta">
            {cat.titulo}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-tinta-suave">{cat.resumo}</p>
        </div>
        {cat.obrigatoria ? (
          <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-folha-600/10 px-2.5 py-1 text-xs font-semibold text-folha-700">
            <ShieldCheck className="size-3.5" aria-hidden /> Sempre ativo
          </span>
        ) : (
          <Switch
            checked={ligado}
            onCheckedChange={onChange}
            aria-labelledby={idTitulo}
            className="mt-1.5 shrink-0 data-[state=checked]:bg-folha-600"
          />
        )}
      </div>
      <p className="mt-2 text-xs text-tinta-suave">
        <span className="font-semibold text-tinta">Base legal:</span> {cat.baseLegal}
      </p>
      <Collapsible open={aberto} onOpenChange={setAberto}>
        <CollapsibleTrigger className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md text-sm font-semibold text-barro-700 outline-none hover:text-barro-600 focus-visible:ring-[3px] focus-visible:ring-barro-600/40">
          {aberto ? 'Esconder' : 'Ver'} os {cat.itens.length} itens
          <ChevronDown className={cn('size-4 transition-transform', aberto && 'rotate-180')} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-2 flex flex-col gap-2">
            {cat.itens.map((item) => (
              <li key={item.nome} className="rounded-xl bg-areia-50 p-3 text-sm">
                <p className="font-mono text-[0.8rem] font-semibold break-words text-tinta">{item.nome}</p>
                <p className="mt-1 text-tinta-suave">{item.finalidade}</p>
                <p className="mt-1.5 text-xs text-tinta-suave">
                  {item.fornecedor} · {item.tipo} · {item.duracao}
                </p>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

export function CookieConsent() {
  const router = useRouter();
  const reduzido = useReducedMotion();
  const { consentimento, pronto } = useConsentimento();
  const [painel, setPainel] = useState(false);
  const [escolha, setEscolha] = useState<Record<CategoriaOpcional, boolean>>({ estatisticas: false, marketing: false });

  // Abrir o painel parte da escolha atual (ou de tudo desligado, se ainda não houve escolha).
  const abrirPainel = () => {
    setEscolha({ estatisticas: Boolean(consentimento?.estatisticas), marketing: Boolean(consentimento?.marketing) });
    setPainel(true);
  };

  useEffect(() => {
    const h = () => abrirPainel();
    window.addEventListener(EVENTO_ABRIR_PREFERENCIAS, h);
    return () => window.removeEventListener(EVENTO_ABRIR_PREFERENCIAS, h);
  });

  const semBanner = ROTAS_SEM_BANNER.includes(router.pathname);
  const mostrarBanner = pronto && !consentimento && !semBanner && !painel;

  const decidir = (acao: () => unknown) => {
    acao();
    setPainel(false);
  };

  return (
    <>
      <AnimatePresence>
        {mostrarBanner && (
          <motion.div
            key="banner-cookies"
            role="region"
            aria-label="Aviso de cookies"
            initial={reduzido ? { opacity: 0 } : { opacity: 0, y: 48 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: 0.5, ease: [0.22, 0.75, 0.12, 1], delay: reduzido ? 0 : 0.6 },
            }}
            exit={{ opacity: 0, y: reduzido ? 0 : 48, transition: { duration: 0.25, ease: 'easeIn' } }}
            className={cn(
              fraunces.variable,
              'fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:right-auto sm:px-6 sm:pb-6',
            )}
          >
            {/* J13 v2 · 04: cartão claro no canto; recusar e aceitar com o mesmo tamanho e a mesma cor. */}
            <div className="max-w-xl rounded-2xl border border-areia-200 bg-white p-5 text-tinta shadow-xl shadow-cafe-950/10 sm:p-6">
              <p className="font-display text-lg leading-snug font-bold">Sua privacidade, do seu jeito</p>
              <p className="mt-1.5 text-sm leading-relaxed text-tinta-suave">
                Usamos cookies necessários para o GiraHub funcionar. Com a sua permissão, usamos também cookies de
                estatísticas (para melhorar o site) e de marketing (para medir nossos anúncios). Você escolhe — e pode
                mudar quando quiser.{' '}
                <Link href="/cookies" className="font-semibold text-tinta underline underline-offset-2">
                  Política de Cookies
                </Link>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <Button variant="outline" className={cn(BOTAO_IGUAL, 'min-h-11')} onClick={() => decidir(recusarOpcionais)}>
                  Recusar opcionais
                </Button>
                <Button variant="outline" className={cn(BOTAO_IGUAL, 'min-h-11')} onClick={() => decidir(aceitarTudo)}>
                  Aceitar todos
                </Button>
                <Button
                  variant="link"
                  className="col-span-2 min-h-11 px-2 font-semibold text-tinta underline underline-offset-4 sm:col-span-1"
                  onClick={abrirPainel}
                >
                  Personalizar
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={painel} onOpenChange={setPainel}>
        <DialogContent
          className={cn(
            fraunces.variable,
            'auth-terra max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden rounded-3xl border-areia-200 bg-areia-50 p-0 text-tinta sm:max-w-2xl',
          )}
        >
          <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
            <DialogHeader className="border-b border-areia-200 bg-white px-6 pt-6 pb-5 text-left">
              <p className="text-xs font-bold text-barro-700">Privacidade</p>
              <DialogTitle className="font-display text-2xl font-bold text-tinta">Preferências de cookies</DialogTitle>
              <DialogDescription className="text-sm text-tinta-suave">
                Ligue só o que fizer sentido para você. Os necessários não podem ser desligados porque o sistema não
                funciona sem eles.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 overflow-y-auto px-4 py-5 sm:px-6">
              {CATEGORIAS_DE_COOKIES.map((cat) => (
                <CategoriaCard
                  key={cat.id}
                  cat={cat}
                  ligado={cat.id === 'necessarios' ? true : escolha[cat.id]}
                  onChange={
                    cat.id === 'necessarios' ? undefined : (v) => setEscolha((e) => ({ ...e, [cat.id]: v }))
                  }
                />
              ))}
              {consentimento?.em && (
                <p className="px-1 text-xs text-tinta-suave">Sua última escolha: {formatarData(consentimento.em)}.</p>
              )}
            </div>
            <DialogFooter className="gap-2 border-t border-areia-200 bg-white px-4 py-4 sm:px-6">
              <Button variant="outline" className="min-h-11" onClick={() => decidir(recusarOpcionais)}>
                Recusar opcionais
              </Button>
              <Button variant="outline" className="min-h-11" onClick={() => decidir(() => salvarConsentimento(escolha))}>
                Salvar escolhas
              </Button>
              <Button variant="outline" className="min-h-11" onClick={() => decidir(aceitarTudo)}>
                Aceitar todos
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CookieConsent;
