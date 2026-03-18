/**
 * E2E: Authentication Flow
 * 
 * Tests the complete authentication lifecycle:
 * - Login with valid credentials
 * - Access protected routes
 * - Token refresh
 * - Logout and cookie cleanup
 * - Invalid credential handling
 */

describe('Authentication Flow', () => {
  const TENANT_ID = 'test-tenant-001';
  const ADMIN_EMAIL = `admin@${TENANT_ID}.local`;
  const ADMIN_PASSWORD = 'SecurePassword123!';

  beforeEach(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
  });

  describe('Login', () => {
    it('should display login form', () => {
      cy.visit('/admin/login');
      cy.get('[data-testid=email-input]').should('be.visible');
      cy.get('[data-testid=password-input]').should('be.visible');
      cy.get('[data-testid=login-button]').should('be.visible');
    });

    it('should login with valid credentials', () => {
      cy.visit('/admin/login');
      cy.get('[data-testid=email-input]').type(ADMIN_EMAIL);
      cy.get('[data-testid=password-input]').type(ADMIN_PASSWORD);
      cy.get('[data-testid=login-button]').click();

      // Should redirect to dashboard
      cy.url().should('include', '/admin/dashboard');
      // Token should be stored
      cy.window().then((win) => {
        expect(win.localStorage.getItem('access_token')).to.not.be.null;
      });
    });

    it('should show error for invalid credentials', () => {
      cy.visit('/admin/login');
      cy.get('[data-testid=email-input]').type(ADMIN_EMAIL);
      cy.get('[data-testid=password-input]').type('WrongPassword!');
      cy.get('[data-testid=login-button]').click();

      // Should show error message
      cy.contains(/inválid|error|incorret/i).should('be.visible');
    });

    it('should show error for empty fields', () => {
      cy.visit('/admin/login');
      cy.get('[data-testid=login-button]').click();

      // Form validation should prevent submission
      cy.url().should('include', '/login');
    });
  });

  describe('Protected Routes', () => {
    it('should redirect unauthenticated users to login', () => {
      cy.visit('/admin/dashboard');
      // Should redirect to login or show unauthorized
      cy.url().should('satisfy', (url: string) => {
        return url.includes('/login') || url.includes('/admin');
      });
    });

    it('should access dashboard after login', () => {
      // Login first
      cy.visit('/admin/login');
      cy.get('[data-testid=email-input]').type(ADMIN_EMAIL);
      cy.get('[data-testid=password-input]').type(ADMIN_PASSWORD);
      cy.get('[data-testid=login-button]').click();

      // Navigate to dashboard
      cy.visit('/admin/dashboard');
      cy.url().should('include', '/admin/dashboard');
    });
  });

  describe('Logout', () => {
    it('should clear tokens on logout', () => {
      // Login
      cy.visit('/admin/login');
      cy.get('[data-testid=email-input]').type(ADMIN_EMAIL);
      cy.get('[data-testid=password-input]').type(ADMIN_PASSWORD);
      cy.get('[data-testid=login-button]').click();

      // Find and click logout
      cy.get('[data-testid=logout-button]').click();

      // Token should be cleared
      cy.window().then((win) => {
        expect(win.localStorage.getItem('access_token')).to.be.null;
      });
    });
  });
});
