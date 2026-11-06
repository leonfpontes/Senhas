/**
 * CadastroShell — a moldura do cadastro na Jornada 1 v2 (quadros 04, 05, 18, 19 e 20): uma pergunta
 * por tela à esquerda, sobre o areia, com a marca e "Já tem conta? Entrar" no alto; à direita (a partir
 * do tablet), o painel areia com a prévia do que o terreiro vai ver — o celular com a página do
 * consulente (atualiza enquanto digita) ou a trilha que o painel abre (último passo).
 * Sempre claro, tema terra (sem a cor da casa). No celular, só a coluna da pergunta.
 */
import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { GiraHubLogo } from '@/components/landing/GiraHubLogo';
import { fraunces, MARKETING_RESET } from '@/components/landing/fonts';

export interface CadastroShellProps {
  /** O painel da direita (prévia do celular ou a trilha). */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

export function CadastroShell({ aside, children }: CadastroShellProps) {
  return (
    // Ação em verde folha (o padrão sem cor de casa, ADR 0011): a classe auth-terra põe o barro no
    // --primary, e o estilo inline vence. Campos no tamanho do desenho (gaveta-v2).
    <div
      style={{ ['--primary' as string]: 'var(--color-folha-700)', ['--ring' as string]: 'var(--color-folha-700)', ['--primary-text' as string]: 'var(--color-folha-700)' }}
      className={cn(
        fraunces.variable,
        'auth-terra gaveta-v2 flex min-h-dvh flex-col bg-areia-50 text-tinta md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
        MARKETING_RESET,
      )}
    >
      <a
        href="#conteudo-conta"
        className="sr-only z-50 rounded-md bg-ouro-300 px-3 py-2 font-bold text-cafe-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o formulário
      </a>
      <div className="flex min-h-dvh flex-col px-5 pt-6 pb-10 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            aria-label="GiraHub — página inicial"
            className="marca-girahub rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <GiraHubLogo className="text-tinta" />
          </Link>
          <p className="text-sm text-tinta-suave">
            Já tem conta?{' '}
            <Link href="/login" className="font-semibold text-tinta underline underline-offset-4">
              Entrar
            </Link>
          </p>
        </header>
        <main id="conteudo-conta" className="flex w-full max-w-[34rem] flex-1 flex-col justify-center py-10">
          {children}
        </main>
        <nav aria-label="Links legais" className="text-xs text-tinta-suave">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            <li>
              <Link href="/" className="underline-offset-4 hover:text-tinta hover:underline">
                Voltar ao site
              </Link>
            </li>
            <li>
              <Link href="/privacidade" className="underline-offset-4 hover:text-tinta hover:underline">
                Privacidade
              </Link>
            </li>
            <li>
              <Link href="/termos" className="underline-offset-4 hover:text-tinta hover:underline">
                Termos de uso
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      {aside && (
        <aside aria-label="Prévia" className="hidden items-center justify-center bg-areia-100 px-10 py-14 md:flex">
          {aside}
        </aside>
      )}
    </div>
  );
}

/** As iniciais da casa no avatar da prévia ("Terreiro Filhos de Fé" → "FF"). */
export function iniciaisDaCasa(nome: string): string {
  const partes = nome
    .split(/\s+/)
    .filter((p) => p && !/^(de|da|do|das|dos|e|terreiro|tenda|casa|centro|templo|ilê|ylê)$/i.test(p));
  return (partes.length ? partes : nome.split(/\s+/)).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || 'G';
}

/** O celular com a página do consulente, como ela fica com o nome digitado. */
export function PreviaDoCelular({ nome, slug, legenda }: { nome: string; slug: string; legenda: string }) {
  const casa = nome.trim() || 'Sua casa';
  return (
    <figure className="flex flex-col items-center gap-5">
      <div aria-hidden className="w-[300px] rounded-[2.5rem] border-[6px] border-cafe-950 bg-white p-4 shadow-xl shadow-cafe-900/10">
        <p className="text-[0.625rem] font-semibold text-tinta">9:41</p>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-folha-700 text-xs font-bold text-white">
            {iniciaisDaCasa(casa)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-tinta">{casa}</span>
            <span className="block truncate text-[0.6875rem] text-tinta-suave">girahub.com.br/{slug || 'sua-casa'}</span>
          </span>
        </div>
        <div className="relative my-3 border-t border-dashed border-areia-300" />
        <p className="text-[0.6875rem] text-tinta-suave">Próxima gira</p>
        <p className="font-display text-xl leading-tight text-tinta">Sua primeira gira</p>
        <p className="text-[0.75rem] font-semibold text-tinta">Você cria logo depois do cadastro</p>
        <p className="mt-3 text-[0.6875rem] font-semibold text-tinta">Seu nome</p>
        <div className="mt-1 h-8 rounded-md border border-areia-300" />
        <p className="mt-2.5 text-[0.6875rem] font-semibold text-tinta">Seu WhatsApp</p>
        <div className="mt-1 h-8 rounded-md border border-areia-300" />
        <div className="mt-24 flex h-10 items-center justify-center rounded-md bg-folha-700 text-[0.75rem] font-bold text-white">
          Pegar a senha
        </div>
      </div>
      <figcaption className="max-w-[18rem] text-center text-sm text-tinta-suave">{legenda}</figcaption>
    </figure>
  );
}

/** A trilha que o painel abre, pela resposta do passo 4 (os mesmos passos do Início). */
export function PreviaDaTrilha({ titulo, passos }: { titulo: string; passos: { titulo: string; detalhe: string }[] }) {
  return (
    <div className="w-full max-w-[26rem]">
      <p className="text-sm text-tinta-suave">Com essa resposta, o painel abre assim:</p>
      <p className="mt-2 font-display text-[1.625rem] leading-tight text-tinta">{titulo}</p>
      <ol className="mt-4 border-b border-areia-200">
        {passos.map((p, i) => (
          <li key={p.titulo} className="flex items-start gap-3 border-t border-areia-200 py-3">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                i === 0 ? 'bg-folha-700 text-white' : 'border border-areia-300 text-tinta-suave',
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-tinta', i === 0 ? 'font-display text-lg' : 'text-sm font-semibold')}>{p.titulo}</span>
              <span className="block text-xs text-tinta-suave">{p.detalhe}</span>
            </span>
            <span className={cn('text-xs font-semibold', i === 0 ? 'text-barro-700' : 'text-tinta-suave')}>
              {i === 0 ? 'agora' : 'depois'}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-tinta-suave">Dá para trocar a trilha depois, no Início. As outras partes da casa continuam no menu.</p>
    </div>
  );
}

export default CadastroShell;
