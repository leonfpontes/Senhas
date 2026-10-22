import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DurationField, durationRangeError } from '../../components/fields/DurationField';
import { formatDuration, formatHHMM, maskDuration, parseDuration } from '../../lib/duration';

describe('lib/duration', () => {
  it('mascara como cronômetro (dois últimos dígitos = minutos)', () => {
    expect(maskDuration('4')).toBe('4');
    expect(maskDuration('45')).toBe('45');
    expect(maskDuration('130')).toBe('1:30');
    expect(maskDuration('0130')).toBe('01:30');
    expect(maskDuration('1:30')).toBe('1:30');
    expect(maskDuration('01:305')).toBe('13:05');
    expect(maskDuration('99959')).toBe('999:59');
    expect(maskDuration('999599')).toBe('999:59');
    expect(maskDuration('ab')).toBe('');
  });

  it('converte texto em minutos, normalizando minutos ≥ 60', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('01:30')).toBe(90);
    expect(parseDuration('00:90')).toBe(90);
    expect(parseDuration('02:15')).toBe(135);
  });

  it('formata em hh:mm e em texto legível', () => {
    expect(formatHHMM(90)).toBe('01:30');
    expect(formatHHMM(45)).toBe('00:45');
    expect(formatHHMM(6000)).toBe('100:00');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(90)).toBe('1h30');
    expect(formatDuration(65)).toBe('1h05');
  });

  it('durationRangeError respeita mínimo e máximo', () => {
    expect(durationRangeError(null, 5, 60)).toBe('');
    expect(durationRangeError(3, 5, 60)).toBe('Mínimo de 5 min');
    expect(durationRangeError(90, 5, 60)).toBe('Máximo de 1h');
    expect(durationRangeError(30, 5, 60)).toBe('');
  });
});

function Controlled({ initial = null, ...props }: { initial?: number | null; min?: number; max?: number }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <DurationField label="Prazo" value={value} onChange={setValue} {...props} />
      <output data-testid="valor">{value === null ? 'vazio' : value}</output>
    </>
  );
}

describe('DurationField', () => {
  it('mostra o valor inicial em hh:mm e o tempo legível', () => {
    render(<Controlled initial={90} />);
    expect((screen.getByLabelText('Prazo') as HTMLInputElement).value).toBe('01:30');
    expect(screen.getByText('1h30')).toBeInTheDocument();
  });

  it('aceita tempo quebrado digitado e devolve minutos', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Prazo') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0045' } });
    expect(input.value).toBe('00:45');
    expect(screen.getByTestId('valor')).toHaveTextContent('45');
    fireEvent.change(input, { target: { value: '215' } });
    expect(input.value).toBe('2:15');
    expect(screen.getByTestId('valor')).toHaveTextContent('135');
  });

  it('normaliza minutos ≥ 60 ao sair do campo', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Prazo') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0090' } });
    fireEvent.blur(input);
    expect(input.value).toBe('01:30');
    expect(screen.getByTestId('valor')).toHaveTextContent('90');
  });

  it('limpar o campo devolve null', () => {
    render(<Controlled initial={30} />);
    const input = screen.getByLabelText('Prazo') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('valor')).toHaveTextContent('vazio');
  });

  it('marca inválido fora dos limites', () => {
    render(<Controlled min={5} max={120} />);
    const input = screen.getByLabelText('Prazo') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Mínimo de 5 min')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '0300' } });
    expect(screen.getByText('Máximo de 2h')).toBeInTheDocument();
  });
});
