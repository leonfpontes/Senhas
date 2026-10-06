/**
 * Novidades da versão: versão atual aberta, anteriores fechadas, "Não mostrar novamente" por
 * versão e abertura automática uma vez por login.
 */
import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import {
  ReleaseNotesDialog,
  clearReleaseNotesSession,
  releaseNotesDismissedKey,
  releaseNotesShownKey,
  useReleaseNotesAutoOpen,
} from '@/components/admin/ReleaseNotesDialog';
import { RELEASE_NOTES, formatReleaseDate } from '@/constants/releaseNotes';
import { APP_VERSION } from '@/lib/version';

const mockTour = { isOpen: false };
jest.mock('@reactour/tour', () => ({ useTour: () => mockTour }));

describe('RELEASE_NOTES', () => {
  it('a primeira entrada é a versão atual do package.json', () => {
    expect(RELEASE_NOTES[0].version).toBe(APP_VERSION);
  });

  it('versões únicas, da mais nova para a mais antiga, todas com destaques', () => {
    const versions = RELEASE_NOTES.map((n) => n.version);
    expect(new Set(versions).size).toBe(versions.length);
    const num = (v: string) => v.split('.').reduce((acc, p) => acc * 1000 + Number(p), 0);
    expect([...versions].sort((a, b) => num(b) - num(a))).toEqual(versions);
    RELEASE_NOTES.forEach((n) => expect(n.highlights.length).toBeGreaterThan(0));
    expect(versions.at(-1)).toBe('1.0.0');
  });

  it('formata data completa e mês', () => {
    expect(formatReleaseDate('2026-10-06')).toBe('6 de outubro de 2026');
    expect(formatReleaseDate('2026-04')).toBe('abril de 2026');
  });
});

describe('ReleaseNotesDialog', () => {
  beforeEach(() => localStorage.clear());

  it('mostra a versão atual aberta e as anteriores fechadas', () => {
    render(<ReleaseNotesDialog open onOpenChange={jest.fn()} userId="u1" />);
    expect(screen.getByRole('heading', { name: /Novidades do GiraHub/ })).toBeInTheDocument();
    const current = screen.getByRole('button', { name: new RegExp(`Versão ${APP_VERSION.replace(/\./g, '\\.')}`) });
    expect(current).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(RELEASE_NOTES[0].highlights[0])).toBeInTheDocument();
    const previous = screen.getByRole('button', { name: /Versão 1\.0\.0/ });
    expect(previous).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(RELEASE_NOTES.at(-1)!.highlights[0])).not.toBeInTheDocument();

    fireEvent.click(previous);
    expect(screen.getByText(RELEASE_NOTES.at(-1)!.highlights[0])).toBeInTheDocument();
  });

  it('"Não mostrar novamente" grava a versão atual ao fechar; desmarcar apaga', () => {
    const onOpenChange = jest.fn();
    const { rerender } = render(<ReleaseNotesDialog open onOpenChange={onOpenChange} userId="u1" />);
    fireEvent.click(screen.getByLabelText('Não mostrar novamente'));
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(releaseNotesDismissedKey('u1'))).toBe(APP_VERSION);

    rerender(<ReleaseNotesDialog open={false} onOpenChange={onOpenChange} userId="u1" />);
    rerender(<ReleaseNotesDialog open onOpenChange={onOpenChange} userId="u1" />);
    expect(screen.getByLabelText('Não mostrar novamente')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Não mostrar novamente'));
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(localStorage.getItem(releaseNotesDismissedKey('u1'))).toBeNull();
  });
});

describe('useReleaseNotesAutoOpen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    mockTour.isOpen = false;
  });
  afterEach(() => jest.useRealTimers());

  const run = (userId = 'u1', enabled = true) => {
    const hook = renderHook(() => useReleaseNotesAutoOpen(userId, enabled));
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    return hook;
  };

  it('abre uma vez por login', () => {
    expect(run().result.current[0]).toBe(true);
    expect(sessionStorage.getItem(releaseNotesShownKey('u1'))).toBe(APP_VERSION);
    expect(run().result.current[0]).toBe(false); // mesma sessão (outra tela)
    clearReleaseNotesSession('u1'); // logout
    expect(run().result.current[0]).toBe(true);
  });

  it('não abre se a versão atual foi dispensada, mas volta numa versão nova', () => {
    localStorage.setItem(releaseNotesDismissedKey('u1'), APP_VERSION);
    expect(run().result.current[0]).toBe(false);
    localStorage.setItem(releaseNotesDismissedKey('u1'), '0.0.1');
    expect(run().result.current[0]).toBe(true);
  });

  it('não abre por cima do tour de boas-vindas nem na impersonação', () => {
    mockTour.isOpen = true;
    expect(run().result.current[0]).toBe(false);
    mockTour.isOpen = false;
    expect(run('u1', false).result.current[0]).toBe(false);
  });
});
