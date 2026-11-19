/**
 * Laboratório: cada beta do catálogo (backend/src/services/laboratorio.py) tem nota da versão completa,
 * que não repete a descrição curta; a nota abre explicando o que faz, como usar, quem vê e o que
 * acontece ao desligar; beta que pede plano avisa quando o plano não tem.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BETA_RELEASE_NOTES } from '@/constants/releaseNotes';
import { LaboratorioSection } from '@/components/admin/LaboratorioSection';
import { apiClient } from '@/services/api_client';

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), put: jest.fn() },
  extractApiErrorMessage: (_e: unknown, f: string) => f,
}));
jest.mock('@/contexts/SnackbarContext', () => ({ useSnackbar: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }));
const refresh = jest.fn();
jest.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ refresh }) }));

const catalogo = fs.readFileSync(path.join(__dirname, '../../../../backend/src/services/laboratorio.py'), 'utf8');
const chavesDoCatalogo = [...catalogo.matchAll(/Beta\(\s*"(beta_[a-z_]+)"/g)].map((m) => m[1]).concat(
  catalogo.includes('Beta(BETA_AREA_MEDIUM') ? ['beta_area_medium'] : [],
);

describe('BETA_RELEASE_NOTES', () => {
  it('uma nota por beta do catálogo, nada a mais', () => {
    expect(chavesDoCatalogo.length).toBeGreaterThan(10);
    expect(new Set(BETA_RELEASE_NOTES.map((n) => n.chave))).toEqual(new Set(chavesDoCatalogo));
  });

  it('cada nota explica de verdade, sem repetir o resumo', () => {
    BETA_RELEASE_NOTES.forEach((n) => {
      expect(n.oQueFaz.length).toBeGreaterThan(60);
      expect(n.oQueFaz).not.toBe(n.text);
      expect(n.comoUsar.length).toBeGreaterThan(0);
      expect(n.quemVe.length).toBeGreaterThan(10);
      expect(n.aoDesligar.length).toBeGreaterThan(20);
    });
  });
});

describe('LaboratorioSection', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        beta_tester: true,
        betas: [
          { chave: 'beta_area_medium', nome: 'Área do Médium', descricao: 'Curta.', grupo: 'Para a corrente', nota: '', ligada: false, plano: 'area_medium', no_plano: false },
          { chave: 'beta_repetir_gira', nome: 'Repetir a gira', descricao: 'Curta também.', grupo: 'Para a gira', nota: '', ligada: false, plano: null, no_plano: true },
        ],
      },
    });
  });

  it('a nota da versão abre com o passo a passo e o plano que falta aparece', async () => {
    render(<LaboratorioSection canEdit tenantName="Casa" />);
    await screen.findByText('Área do Médium');
    expect(screen.getByText(/Precisa do plano Basic ou superior/)).toBeInTheDocument();
    expect(screen.getAllByText(/Precisa do plano/)).toHaveLength(1);

    fireEvent.click(screen.getAllByRole('button', { name: 'Nota da versão' })[0]);
    const nota = BETA_RELEASE_NOTES.find((n) => n.chave === 'beta_area_medium')!;
    expect(screen.getByText('O que faz')).toBeInTheDocument();
    expect(screen.getByText(nota.oQueFaz)).toBeInTheDocument();
    expect(screen.getByText(nota.comoUsar[0])).toBeInTheDocument();
    expect(screen.getByText('Ao desligar')).toBeInTheDocument();
  });

  it('ligar recarrega a assinatura (aba Área do Médium aparece na hora)', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({ data: { betas: [] } });
    render(<LaboratorioSection canEdit tenantName="Casa" />);
    await screen.findByText('Repetir a gira');
    fireEvent.click(screen.getByRole('switch', { name: 'Repetir a gira' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
