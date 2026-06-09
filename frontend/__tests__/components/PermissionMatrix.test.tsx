import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PermissionMatrix from '../../src/components/PermissionMatrix';
import { GroupPermission } from '../../src/services/permissionGroupsService';

// Mock matchMedia for useMediaQuery support in Jest
beforeAll(() => {
  window.matchMedia = window.matchMedia || function() {
    return {
      matches: false,
      addListener: function() {},
      removeListener: function() {},
      dispatchEvent: function() { return false; }
    };
  };
});

describe('PermissionMatrix Component', () => {
  const mockPermissions: GroupPermission[] = [
    {
      feature: 'giras',
      can_view: true,
      can_insert: false,
      can_edit: false,
      can_delete: false,
    },
  ];

  it('renders correctly on desktop layout', () => {
    const handleChange = jest.fn();
    render(<PermissionMatrix value={mockPermissions} onChange={handleChange} />);
    
    // Check headers
    expect(screen.getByText('Funcionalidade')).toBeInTheDocument();
    expect(screen.getByText('Visualizar')).toBeInTheDocument();
    expect(screen.getByText('Inserir')).toBeInTheDocument();
    expect(screen.getByText('Editar')).toBeInTheDocument();
    expect(screen.getByText('Deletar')).toBeInTheDocument();

    // Check specific feature label
    expect(screen.getByText('Giras')).toBeInTheDocument();
  });

  it('calls onChange when checkbox is clicked', () => {
    const handleChange = jest.fn();
    render(<PermissionMatrix value={mockPermissions} onChange={handleChange} />);

    const checkboxes = screen.getAllByRole('checkbox');
    // Find and click a checkbox (excluding header and select-all ones, checkboxes[1] corresponds to first feature can_view)
    fireEvent.click(checkboxes[2]);

    expect(handleChange).toHaveBeenCalled();
  });
});
