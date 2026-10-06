/**
 * Estados padrão da jornada pública: carregando (Skeleton + aria-live) e aviso
 * (erro / não encontrado / expirado / sucesso) com ações empilhadas de 48px.
 */
import React from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export interface PublicLoadingProps {
  /** Texto anunciado para leitores de tela e exibido sob o esqueleto. */
  label: string;
  className?: string;
}

export function PublicLoading({ label, className }: PublicLoadingProps) {
  return (
    <Card className={cn('py-5', className)}>
      <CardContent role="status" aria-live="polite" className="flex flex-col gap-3 px-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-16 w-1/2 self-center" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-12 w-full" />
        <p className="pt-1 text-center text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export type PublicNoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface PublicNoticeProps {
  tone?: PublicNoticeTone;
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Botões/links de ação; cada um ocupa a largura toda (use `size="touch"`). */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

const TONE_ICON: Record<PublicNoticeTone, React.ReactNode> = {
  info: <Info />,
  success: <CircleCheck />,
  warning: <TriangleAlert />,
  error: <CircleAlert />,
};

const TONE_CLASS: Record<PublicNoticeTone, string> = {
  info: 'bg-info/10 text-info-strong',
  success: 'bg-success/10 text-success-strong',
  warning: 'bg-warning/10 text-warning-strong',
  error: 'bg-destructive/10 text-destructive-strong',
};

export function PublicNotice({ tone = 'info', icon, title, description, actions, children, className }: PublicNoticeProps) {
  const isAlert = tone === 'error' || tone === 'warning';
  return (
    <Card className={cn('py-6', className)}>
      <CardContent
        role={isAlert ? 'alert' : 'status'}
        className="flex flex-col items-center gap-3 px-5 text-center"
      >
        <span
          aria-hidden
          className={cn('flex size-14 items-center justify-center rounded-full [&_svg]:size-7', TONE_CLASS[tone])}
        >
          {icon ?? TONE_ICON[tone]}
        </span>
        <h2 className="text-xl font-bold leading-tight text-foreground">{title}</h2>
        {description && <div className="text-base text-muted-foreground">{description}</div>}
        {children}
        {actions && <div className="mt-2 flex w-full flex-col gap-2">{actions}</div>}
      </CardContent>
    </Card>
  );
}
