import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DateField } from '@/components/fields/DateField';
import { DateTimeField } from '@/components/fields/DateTimeField';
import {
  brToIsoDate,
  isoToBrDate,
  joinIsoDateTime,
  maskBrDate,
  splitIsoDateTime,
} from '@/lib/dateIso';

function Harness({ initial = null as string | null, onChange }: { initial?: string | null; onChange?: jest.Mock }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <DateField
      label="Data"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('DateField', () => {
  it('exibe o valor ISO em dd/mm/aaaa', () => {
    render(<DateField label="Data" value="2026-10-05" onChange={() => {}} />);
    expect((screen.getByLabelText('Data') as HTMLInputElement).value).toBe('05/10/2026');
  });

  it('digitar a data completa dispara onChange em ISO (com máscara automática)', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Data') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0510' } });
    expect(input.value).toBe('05/10');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '05102026' } });
    expect(input.value).toBe('05/10/2026');
    expect(onChange).toHaveBeenCalledWith('2026-10-05');
  });

  it('data inválida não dispara onChange e volta ao último valor válido no blur', () => {
    const onChange = jest.fn();
    render(<Harness initial="2026-10-05" onChange={onChange} />);
    const input = screen.getByLabelText('Data') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '31/02/2026' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input.value).toBe('05/10/2026');
  });

  it('limpar o campo dispara onChange(null)', () => {
    const onChange = jest.fn();
    render(<Harness initial="2026-10-05" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('o botão abre o calendário em pt-BR e selecionar um dia atualiza o valor', async () => {
    const onChange = jest.fn();
    render(<Harness initial="2026-10-05" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendário' }));
    const grid = await screen.findByRole('grid');
    // Cabeçalho do mês em português
    expect(grid).toHaveAccessibleName(/outubro 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /20 de outubro de 2026/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('2026-10-20'));
    expect((screen.getByLabelText('Data') as HTMLInputElement).value).toBe('20/10/2026');
  });

  it('respeita min/max desabilitando dias no calendário', async () => {
    render(<DateField label="Data" value="2026-10-05" onChange={() => {}} min="2026-10-03" max="2026-10-10" />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendário' }));
    await screen.findByRole('grid');
    expect(screen.getByRole('button', { name: /\b1 de outubro de 2026/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /\b5 de outubro de 2026/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /15 de outubro de 2026/i })).toBeDisabled();
  });

  it('exibe erro e marca aria-invalid', () => {
    render(<DateField label="Data" value={null} onChange={() => {}} error="Informe a data" required />);
    expect(screen.getByLabelText(/Data/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Informe a data')).toBeInTheDocument();
  });
});

describe('DateTimeField', () => {
  it('separa data e hora e devolve ISO local "YYYY-MM-DDTHH:mm"', () => {
    const onChange = jest.fn();
    render(<DateTimeField label="Início" value="2026-10-05T19:30" onChange={onChange} />);
    expect((screen.getByLabelText('Início') as HTMLInputElement).value).toBe('05/10/2026');
    const time = screen.getByLabelText('Hora') as HTMLInputElement;
    expect(time.value).toBe('19:30');

    fireEvent.change(time, { target: { value: '20:00' } });
    expect(onChange).toHaveBeenCalledWith('2026-10-05T20:00');

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '06/10/2026' } });
    expect(onChange).toHaveBeenCalledWith('2026-10-06T19:30');
  });

  it('sem hora assume 00:00; limpar a data devolve null', () => {
    const onChange = jest.fn();
    render(<DateTimeField label="Início" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '06/10/2026' } });
    expect(onChange).toHaveBeenCalledWith('2026-10-06T00:00');
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('dateIso helpers', () => {
  it('converte entre ISO e pt-BR', () => {
    expect(isoToBrDate('2026-01-31')).toBe('31/01/2026');
    expect(isoToBrDate('2026-01-31T10:00:00Z')).toBe('31/01/2026');
    expect(isoToBrDate(null)).toBe('');
    expect(brToIsoDate('31/01/2026')).toBe('2026-01-31');
    expect(brToIsoDate('31/02/2026')).toBeNull();
    expect(brToIsoDate('31/01/26')).toBeNull();
  });
  it('mascara a digitação', () => {
    expect(maskBrDate('3')).toBe('3');
    expect(maskBrDate('3101')).toBe('31/01');
    expect(maskBrDate('31012026999')).toBe('31/01/2026');
  });
  it('separa e junta data/hora', () => {
    expect(splitIsoDateTime('2026-10-05T19:30:00')).toEqual({ date: '2026-10-05', time: '19:30' });
    expect(splitIsoDateTime('2026-10-05')).toEqual({ date: '2026-10-05', time: '' });
    expect(splitIsoDateTime(null)).toEqual({ date: null, time: '' });
    expect(joinIsoDateTime('2026-10-05', '19:30')).toBe('2026-10-05T19:30');
    expect(joinIsoDateTime('2026-10-05', '')).toBe('2026-10-05T00:00');
    expect(joinIsoDateTime(null, '19:30')).toBeNull();
  });
});
