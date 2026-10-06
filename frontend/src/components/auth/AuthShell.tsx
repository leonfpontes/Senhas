/**
 * AuthShell — moldura das telas de entrada (login, cadastro, esqueci/redefinir senha,
 * reativar conta): fundo, cartão centralizado, marca e título. Cada tela só entrega o
 * formulário e, se quiser, um rodapé.
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export interface AuthShellProps {
  /** `<title>` da aba. Omita quando a tela monta o próprio `<Head>` (ex.: cadastro, com SEO). */
  headTitle?: string;
  title: string;
  subtitle?: React.ReactNode;
  /** Largura do cartão: `xs` (448px) para login e afins, `sm` (640px) para o cadastro. */
  size?: 'xs' | 'sm';
  /** Bloco abaixo do formulário, separado por uma linha. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AuthShell({ headTitle, title, subtitle, size = 'xs', footer, children, className }: AuthShellProps) {
  return (
    <>
      {headTitle && (
        <Head>
          <title>{headTitle}</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 [:where(&)_a]:[color:inherit] [:where(&)_a]:[text-decoration:inherit]">
        <Card className={cn('w-full', size === 'xs' ? 'max-w-md' : 'max-w-xl', className)}>
          <CardContent className="px-6 py-8 sm:px-8">
            <div className="mb-6 text-center">
              <Link
                href="/"
                className="inline-block rounded-md text-3xl font-extrabold tracking-tight text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                GiraHub
              </Link>
              <h1 className="mt-2 text-lg font-semibold">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>

            {children}

            {footer && (
              <>
                <div className="my-6 h-px bg-border" role="separator" />
                {footer}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default AuthShell;
