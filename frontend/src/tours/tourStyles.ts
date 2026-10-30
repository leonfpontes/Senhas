/**
 * Estilos do balão dos tours (`@reactour/tour`), ligados aos tokens do tema.
 *
 * O reactour pinta o balão com fundo `#fff` fixo e `color: inherit`: no modo
 * escuro o texto herdava o claro do `body` sobre o fundo branco e ficava
 * ilegível (cliente novo viu o tour de boas-vindas assim). Fundo, texto,
 * setas, pontos e o "x" usam os tokens `--popover*`, `--primary*` e
 * `--muted-foreground`, que trocam com a classe `dark` e com a cor do terreiro.
 *
 * maxWidth usa min() para não transbordar em telas pequenas.
 */
import type React from 'react';

type Style = React.CSSProperties & Record<`--${string}`, string | number>;

export const tourStyles = {
  popover: (base: Style): Style => ({
    ...base,
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '20px 22px',
    maxWidth: 'min(400px, 90vw)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
    fontSize: '0.93rem',
    lineHeight: 1.55,
  }),
  badge: (base: Style): Style => ({
    ...base,
    fontFamily: 'inherit',
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
  }),
  arrow: (base: Style, state?: { disabled?: boolean }): Style => ({
    ...base,
    color: 'var(--popover-foreground)',
    opacity: state?.disabled ? 0.3 : 1,
  }),
  dot: (base: Style, state?: { current?: boolean }): Style => ({
    ...base,
    border: state?.current ? '0' : '1px solid var(--muted-foreground)',
    color: state?.current ? 'var(--primary)' : 'var(--muted-foreground)',
    background: state?.current ? 'var(--primary)' : 'none',
  }),
  close: (base: Style, state?: { disabled?: boolean }): Style => ({
    ...base,
    color: 'var(--muted-foreground)',
    '--rt-close-btn': 'var(--muted-foreground)',
    '--rt-close-btn-disabled': 'var(--popover-foreground)',
    opacity: state?.disabled ? 0.4 : 1,
  }),
};
