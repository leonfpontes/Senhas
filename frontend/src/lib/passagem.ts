/**
 * Passagem entre as páginas de marketing (`/`, `/planos`) e as telas de conta (login, cadastro,
 * esqueci/redefinir senha, reativar) — o mesmo desenho da entrada do ATRAIR:
 *
 * - **avançar** (marketing → conta): a marca do GiraHub "voa" entre as páginas
 *   (`view-transition-name: marca-girahub`) e, na tela de conta, o escuro da landing recua até o
 *   painel da marca, com o fio dourado acompanhando a borda, e o formulário surge (globals.css,
 *   `.passagem*`);
 * - **voltar** (conta → marketing, pela marca, "Voltar ao site" ou o voltar do navegador): o
 *   escuro avança sobre o formulário e só então a landing entra, com a marca voando de volta;
 * - **lado** (conta ↔ conta, ex.: login ⇄ cadastro): só a marca e o formulário surgindo.
 * - **abrir-documento / fechar-documento** (marketing ⇄ Termos, Privacidade, Cookies): o cabeçalho
 *   fica parado, a página sai deslizando e o documento entra pelo lado oposto (eixo compartilhado);
 *   na volta, o movimento inverte. Documento → conta e conta → documento valem como marketing.
 * - **folhear-frente / folhear-tras** (documento ⇄ documento): o mesmo deslize, no sentido da
 *   ordem das abas (Termos → Privacidade → Cookies), e a aba ativa escorrega até a nova.
 *
 * Usa a View Transitions API em volta da navegação do router do Next (mesmo documento). Sem a API
 * a troca é direta (as animações de CSS ainda rodam); com `prefers-reduced-motion` nada anima.
 * O navegador pode cancelar a transição (aba em segundo plano, outra em curso): as promessas são
 * tratadas para o cancelamento não virar erro — a troca acontece do mesmo jeito.
 */

export type Passagem =
  | 'avancar'
  | 'voltar'
  | 'lado'
  | 'abrir-documento'
  | 'fechar-documento'
  | 'folhear-frente'
  | 'folhear-tras';

export const ROTAS_DE_MARKETING = ['/', '/planos'] as const;
/** Documentos legais, na ordem das abas (define o sentido do folhear). */
export const ROTAS_DE_DOCUMENTO = ['/termos', '/privacidade', '/cookies'] as const;
export const ROTAS_DE_CONTA = ['/login', '/cadastro', '/forgot-password', '/reset-password', '/reactivate-account'] as const;

/** Quanto dura a saída (o escuro cobrindo a tela) antes da troca — o mesmo tempo do CSS. */
export const DURACAO_DA_SAIDA_MS = 650;

/** Teto para segurar a transição esperando a página nova (o navegador desiste por volta de 4 s). */
const ESPERA_MAXIMA_MS = 3000;

const ehMarketing = (p: string) => (ROTAS_DE_MARKETING as readonly string[]).includes(p);
const indiceDoDocumento = (p: string) => (ROTAS_DE_DOCUMENTO as readonly string[]).indexOf(p);
const ehDocumento = (p: string) => indiceDoDocumento(p) >= 0;
const ehConta = (p: string) => (ROTAS_DE_CONTA as readonly string[]).includes(p);

/** Caminho (sem busca nem âncora) de uma URL relativa ou absoluta. */
export function caminhoDe(url: string): string {
  try {
    return new URL(url, 'http://girahub.local').pathname.replace(/(.)\/+$/, '$1');
  } catch {
    return url.split(/[?#]/)[0] || '/';
  }
}

/** Qual passagem vale entre dois caminhos; `null` = navegação comum (fora deste trecho do site). */
export function passagemEntre(de: string, para: string): Passagem | null {
  const a = caminhoDe(de);
  const b = caminhoDe(para);
  if (a === b) return null;
  if (ehDocumento(a) && ehDocumento(b)) return indiceDoDocumento(b) > indiceDoDocumento(a) ? 'folhear-frente' : 'folhear-tras';
  if (ehMarketing(a) && ehDocumento(b)) return 'abrir-documento';
  if (ehDocumento(a) && ehMarketing(b)) return 'fechar-documento';
  // Para as telas de conta, os documentos são parte do marketing (mesmo cabeçalho escuro).
  if ((ehMarketing(a) || ehDocumento(a)) && ehConta(b)) return 'avancar';
  if (ehConta(a) && (ehMarketing(b) || ehDocumento(b))) return 'voltar';
  if (ehConta(a) && ehConta(b)) return 'lado';
  return null;
}

export function movimentoReduzido(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

type Transicao = { ready?: Promise<unknown>; finished?: Promise<unknown>; updateCallbackDone?: Promise<unknown> };
type DocumentoComTransicao = Document & { startViewTransition?: (trocar: () => Promise<unknown> | void) => Transicao };

/** A View Transitions API existe e a pessoa não pediu menos movimento. */
export function suportaTransicao(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document as DocumentoComTransicao).startViewTransition === 'function' && !movimentoReduzido();
}

let ultima: Passagem | null = null;

/** Como a tela atual foi alcançada (lido pelo AuthShell ao montar: sem recuo vindo de outra tela de conta). */
export function ultimaPassagem(): Passagem | null {
  return ultima;
}

/** Só para testes. */
export function _reiniciarPassagem(): void {
  ultima = null;
}

const comLimite = (p: Promise<unknown>) =>
  new Promise<void>((resolve) => {
    const limite = setTimeout(resolve, ESPERA_MAXIMA_MS);
    void p
      .catch(() => undefined)
      .then(() => {
        clearTimeout(limite);
        resolve();
      });
  });

/**
 * Faz a troca dentro de uma transição de visualização quando dá; senão, direto.
 * `trocar` deve resolver quando a página nova já estiver na tela (ex.: `router.push`).
 */
export async function comPassagem(passagem: Passagem, trocar: () => Promise<unknown>): Promise<void> {
  ultima = passagem;
  const html = typeof document !== 'undefined' ? document.documentElement : null;
  if (!html || !suportaTransicao()) {
    await comLimite(trocar());
    if (html) delete html.dataset.passagemSaindo;
    return;
  }
  html.dataset.passagem = passagem;
  const transicao = (document as DocumentoComTransicao).startViewTransition!(async () => {
    await comLimite(trocar());
    delete html.dataset.passagemSaindo;
  });
  for (const p of [transicao?.ready, transicao?.updateCallbackDone]) p?.catch(() => {});
  try {
    await (transicao?.finished ?? Promise.resolve());
  } catch {
    /* transição cancelada: a troca já aconteceu */
  } finally {
    delete html.dataset.passagem;
    delete html.dataset.passagemSaindo;
  }
}

/** Há uma tela de conta montada (com o escuro para avançar na saída)? */
function temMolduraDeConta(): boolean {
  return typeof document !== 'undefined' && Boolean(document.querySelector('[data-passagem-moldura]'));
}

/**
 * Navega com a passagem. Na volta para o marketing, o escuro avança primeiro (650 ms) e só
 * então a página troca — a ida ao contrário. Com menos movimento, nada disso: troca direta.
 */
export function navegarComPassagem(push: (href: string) => Promise<unknown>, href: string, passagem: Passagem): Promise<void> {
  if (passagem === 'voltar' && temMolduraDeConta() && !movimentoReduzido()) {
    document.documentElement.dataset.passagemSaindo = '1';
    return new Promise((resolve) => {
      // Uma folga depois da animação: a troca só começa com a tela toda escura.
      setTimeout(() => {
        void comPassagem(passagem, () => push(href)).then(resolve);
      }, DURACAO_DA_SAIDA_MS + 100);
    });
  }
  return comPassagem(passagem, () => push(href));
}
