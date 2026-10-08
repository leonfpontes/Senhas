/**
 * AM-23 — "Seu grupo: G2" no Perfil da Área: só nome e cor dos próprios grupos (D-07).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MeusGrupos } from '@/components/medium/MeusGrupos';

describe('MeusGrupos', () => {
  it('um grupo: "Seu grupo:" com a etiqueta na cor do grupo', () => {
    render(<MeusGrupos grupos={[{ id: 'g2', nome: 'G2', cor: 'petroleo' }]} />);
    expect(screen.getByTestId('meus-grupos')).toHaveTextContent('Seu grupo:G2');
    expect(screen.getByTestId('grupo-chip')).toHaveStyle({ backgroundColor: '#0f766e' });
  });

  it('vários: "Seus grupos:"', () => {
    render(
      <MeusGrupos
        grupos={[
          { id: 'g2', nome: 'G2', cor: 'petroleo' },
          { id: 'g5', nome: 'Ogãs', cor: 'violeta' },
        ]}
      />,
    );
    expect(screen.getByTestId('meus-grupos')).toHaveTextContent('Seus grupos:G2Ogãs');
  });

  it('sem grupo não mostra nada', () => {
    const { container } = render(<MeusGrupos grupos={[]} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<MeusGrupos />);
    expect(c2).toBeEmptyDOMElement();
  });
});
