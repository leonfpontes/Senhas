/**
 * Tests for /admin/users page
 * Focus: ConfirmDialog delete flow, PageHeader, table rendering, loading/error states
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), pathname: '/admin/users',
    query: {}, asPath: '/admin/users',
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

jest.mock('@/services/api_client', () => ({
  apiClient: {
    get:    jest.fn(),
    post:   jest.fn().mockResolvedValue({ data: {} }),
    put:    jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

// Strip the layout so we only test the page content (avoids provider chain complexity)
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: { max_users: 10, plan: 'pro', status: 'active' },
    can: () => true,
    canCreateUser: (count: number) => count < 10,
    loading: false,
  }),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, permissions: null, loading: false, refresh: jest.fn() }),
}));

// CrudDrawer and PasswordField use @mui/material/useTheme subpath not found in the test container.
jest.mock('@/components/CrudDrawer', () => ({
  __esModule: true,
  default: ({ children, open, title }: any) =>
    open ? <div data-testid="crud-drawer" aria-label={title}>{children}</div> : null,
}));

jest.mock('@/components/PasswordField', () => ({
  __esModule: true,
  default: (props: any) => <input type="password" placeholder={props.label} />,
}));

const theme = createTheme();
function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

const MOCK_USERS = [
  { id: 'u1', email: 'alice@test.com', username: 'alice', role: 'admin',    is_active: true,  created_at: '2024-01-01T00:00:00Z' },
  { id: 'u2', email: 'bob@test.com',   username: 'bob',   role: 'operator', is_active: false, created_at: '2024-01-02T00:00:00Z' },
];

describe('Admin Users Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: { items: MOCK_USERS, total: 2, page: 1, pages: 1 } });
  });

  it('renders without crashing', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    const { container } = wrap(<AdminUsers />);
    expect(container).toBeTruthy();
  });

  it('shows loading spinner initially', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockReturnValue(new Promise(() => {})); // never resolves
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    expect(document.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
  });

  it('renders users after load', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => {
      expect(screen.getByText('alice@test.com')).toBeInTheDocument();
      expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    });
  });

  it('renders role chips with formatted labels', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    // Role chips display 'Admin' (capitalized) and 'Operador' (translated)
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Operador')).toBeInTheDocument();
  });

  it('opens ConfirmDialog when delete button is clicked', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));

    // Delete buttons are error-colored IconButtons without tooltip
    const deleteButtons = document.querySelectorAll('.MuiIconButton-colorError');
    act(() => { fireEvent.click(deleteButtons[0]); });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('calls DELETE API and closes dialog on confirm', async () => {
    const { apiClient } = require('@/services/api_client');
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));

    const deleteButtons = document.querySelectorAll('.MuiIconButton-colorError');
    act(() => { fireEvent.click(deleteButtons[0]); });

    await waitFor(() => screen.getByRole('dialog'));
    await act(async () => { fireEvent.click(screen.getByText('Excluir')); });

    expect(apiClient.delete).toHaveBeenCalledWith(expect.stringContaining('/users/'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes dialog without deleting on cancel', async () => {
    const { apiClient } = require('@/services/api_client');
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));

    const deleteButtons = document.querySelectorAll('.MuiIconButton-colorError');
    act(() => { fireEvent.click(deleteButtons[0]); });

    await waitFor(() => screen.getByRole('dialog'));
    await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });

    expect(apiClient.delete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows PageHeader with title', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    // PageHeader renders an h5
    const h5 = document.querySelector('h5');
    expect(h5).not.toBeNull();
  });
});
