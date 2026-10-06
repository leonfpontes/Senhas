import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PermissionMatrix, {
  applyPreset,
  normalizePermissions,
  togglePermission,
} from '../../src/components/PermissionMatrix';
import { FEATURE_LABELS } from '../../src/constants/permissionFeatures';
import { GroupPermission } from '../../src/services/permissionGroupsService';

const TOTAL = Object.keys(FEATURE_LABELS).length;

describe('PermissionMatrix', () => {
  const mockPermissions: GroupPermission[] = [
    { feature: 'giras', can_view: true, can_insert: false, can_edit: false, can_delete: false },
  ];

  it('renders areas, plain-language actions and module labels', () => {
    render(<PermissionMatrix value={mockPermissions} onChange={jest.fn()} />);

    expect(screen.getByText('Operacional')).toBeInTheDocument();
    expect(screen.getAllByText('Ver').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Criar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Excluir').length).toBeGreaterThan(0);
    expect(screen.getByText('Giras')).toBeInTheDocument();
    expect(screen.getByText('Senhas')).toBeInTheDocument();
    // sem jargão
    expect(screen.queryByText(/feature|RBAC/i)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Giras: Ver' })).toBeChecked();
  });

  it('turning on Criar also turns on Ver', () => {
    const handleChange = jest.fn();
    render(<PermissionMatrix value={[]} onChange={handleChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Senhas: Criar' }));
    const next: GroupPermission[] = handleChange.mock.calls[0][0];
    expect(next).toHaveLength(TOTAL);
    expect(next.find((p) => p.feature === 'tickets')).toMatchObject({ can_view: true, can_insert: true });
  });

  it('turning off Ver clears the other actions', () => {
    const full: GroupPermission = { feature: 'giras', can_view: true, can_insert: true, can_edit: true, can_delete: true };
    expect(togglePermission(full, 'can_view', false)).toEqual({
      feature: 'giras',
      can_view: false,
      can_insert: false,
      can_edit: false,
      can_delete: false,
    });
  });

  it('area "Tudo" checks every action of that area only', () => {
    const handleChange = jest.fn();
    render(<PermissionMatrix value={[]} onChange={handleChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tudo em Financeiro' }));
    const next: GroupPermission[] = handleChange.mock.calls[0][0];
    expect(next.find((p) => p.feature === 'financeiro')).toMatchObject({ can_delete: true });
    expect(next.find((p) => p.feature === 'giras')).toMatchObject({ can_view: false });
  });

  it('presets', () => {
    const op = applyPreset([], 'operacional');
    expect(op.every((p) => p.can_view)).toBe(true);
    expect(op.find((p) => p.feature === 'tickets')?.can_insert).toBe(true);
    expect(op.find((p) => p.feature === 'financeiro')?.can_insert).toBe(false);
    expect(applyPreset(op, 'nenhum').some((p) => p.can_view)).toBe(false);

    const handleChange = jest.fn();
    render(<PermissionMatrix value={[]} onChange={handleChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tudo' }));
    expect((handleChange.mock.calls[0][0] as GroupPermission[]).every((p) => p.can_delete)).toBe(true);
  });

  it('normalizes missing modules and respects disabled', () => {
    expect(normalizePermissions(mockPermissions)).toHaveLength(TOTAL);
    const handleChange = jest.fn();
    render(<PermissionMatrix value={mockPermissions} onChange={handleChange} disabled />);
    expect(screen.getByRole('checkbox', { name: 'Giras: Editar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Só ver' })).toBeDisabled();
  });

  it('collapses an area', () => {
    render(<PermissionMatrix value={[]} onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Relatórios/ }));
    expect(screen.queryByText('Indicadores')).not.toBeInTheDocument();
  });
});
