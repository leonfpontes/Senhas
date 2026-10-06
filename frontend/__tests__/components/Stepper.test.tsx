import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Stepper } from '@/components/Stepper';

const steps = [{ label: 'Dados' }, { label: 'Endereço', optional: true }, { label: 'Confirmação' }];

describe('Stepper', () => {
  it('renderiza as etapas como lista ordenada com a atual marcada por aria-current', () => {
    render(<Stepper steps={steps} active={1} />);
    const list = screen.getByRole('list', { name: 'Etapas' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('data-status', 'complete');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).toHaveAttribute('data-status', 'current');
    expect(items[2]).toHaveAttribute('data-status', 'upcoming');
    expect(items[2]).not.toHaveAttribute('aria-current');
  });

  it('anuncia o estado de cada etapa e o rótulo "(opcional)"', () => {
    render(<Stepper steps={steps} active={1} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/concluída/);
    expect(items[1]).toHaveTextContent(/etapa atual/);
    expect(items[1]).toHaveTextContent('(opcional)');
    expect(items[2]).toHaveTextContent(/pendente/);
  });

  it('mostra o número da etapa pendente/atual e o check na concluída', () => {
    render(<Stepper steps={steps} active={2} />);
    const items = screen.getAllByRole('listitem');
    expect(items[2]).toHaveTextContent('3');
    expect(items[0].querySelector('svg')).not.toBeNull();
  });

  it('com onStepClick, só as etapas concluídas viram botões', () => {
    const onStepClick = jest.fn();
    render(<Stepper steps={steps} active={2} onStepClick={onStepClick} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it('sem onStepClick não há botões', () => {
    render(<Stepper steps={steps} active={2} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('orientação vertical', () => {
    render(<Stepper steps={steps} active={0} orientation="vertical" />);
    expect(screen.getByRole('list', { name: 'Etapas' }).className).toMatch(/flex-col/);
  });
});
