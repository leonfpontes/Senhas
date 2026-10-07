import React from 'react';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/landing/Reveal';

/** Rótulo + título serifado + texto de apoio, padrão das seções de marketing. */
export function SectionHeading({
  eyebrow,
  title,
  children,
  id,
  align = 'center',
  tone = 'light',
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
  align?: 'center' | 'left';
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <Reveal className={cn(align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-xl', className)}>
      <p
        className={cn(
          'mb-3 text-xs font-bold tracking-[0.2em] uppercase',
          tone === 'light' ? 'text-barro-700' : 'text-ouro-300',
        )}
      >
        {eyebrow}
      </p>
      <h2
        id={id}
        className={cn(
          'font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl',
          tone === 'light' ? 'text-tinta' : 'text-white',
        )}
      >
        {title}
      </h2>
      {children && (
        <p className={cn('mt-4 text-lg', tone === 'light' ? 'text-tinta-suave' : 'text-areia-200')}>{children}</p>
      )}
    </Reveal>
  );
}

export default SectionHeading;
