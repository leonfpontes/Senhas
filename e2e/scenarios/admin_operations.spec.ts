/**
 * E2E: Admin CRUD Operations
 * 
 * Tests admin panel operations:
 * - Gira CRUD (create, read, update, delete)
 * - Ticket management (view, bulk actions)
 * - Config management (branding, features)
 * - Audit trail viewing
 * - Analytics dashboard
 */

describe('Admin CRUD Operations', () => {
  const TENANT_ID = 'test-tenant-001';
  const ADMIN_EMAIL = `admin@${TENANT_ID}.local`;
  const ADMIN_PASSWORD = 'SecurePassword123!';

  before(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();

    // Login first
    cy.visit('/admin/login');
    cy.get('[data-testid=email-input]').type(ADMIN_EMAIL);
    cy.get('[data-testid=password-input]').type(ADMIN_PASSWORD);
    cy.get('[data-testid=login-button]').click();
    cy.url().should('include', '/admin');
  });

  describe('Gira Management', () => {
    let createdGiraId: string;

    it('should navigate to giras page', () => {
      cy.visit('/admin/giras');
      cy.url().should('include', '/admin/giras');
    });

    it('should show giras table', () => {
      cy.visit('/admin/giras');
      // Table should be present
      cy.get('table').should('exist');
    });

    it('should open create gira dialog', () => {
      cy.visit('/admin/giras');
      cy.contains(/Criar|Nova|Add/i).click();
      // Dialog should appear
      cy.get('[role=dialog]').should('be.visible');
    });

    it('should create a new gira', () => {
      cy.visit('/admin/giras');
      cy.contains(/Criar|Nova|Add/i).click();

      cy.get('[data-testid=gira-name]').type('Gira E2E Test');
      cy.get('[data-testid=gira-location]').type('Test Location');
      cy.get('[data-testid=gira-submit]').click();

      // Should show success or new gira in table
      cy.contains('Gira E2E Test').should('exist');
    });

    it('should delete a gira', () => {
      cy.visit('/admin/giras');
      // Find and delete
      cy.get('[data-testid=delete-gira]').first().click();
      cy.get('[data-testid=confirm-delete]').click();
    });
  });

  describe('Ticket Management', () => {
    it('should navigate to tickets page', () => {
      cy.visit('/admin/tickets');
      cy.url().should('include', '/admin/tickets');
    });

    it('should show tickets table', () => {
      cy.visit('/admin/tickets');
      cy.get('table').should('exist');
    });

    it('should support pagination', () => {
      cy.visit('/admin/tickets');
      // Pagination component should exist if there are multiple pages
      cy.get('nav[aria-label*=pagination], .MuiPagination-root').should('exist');
    });

    it('should support filtering by status', () => {
      cy.visit('/admin/tickets');
      // Look for filter controls
      cy.get('select, [role=combobox]').should('exist');
    });
  });

  describe('Dashboard', () => {
    it('should display KPIs', () => {
      cy.visit('/admin/dashboard');
      // Dashboard should show statistics
      cy.get('[class*=card], [class*=Card], .MuiCard-root').should('have.length.at.least', 1);
    });

    it('should load analytics data', () => {
      cy.visit('/admin/dashboard');
      // Wait for loading to complete
      cy.get('[role=progressbar]').should('not.exist');
    });
  });

  describe('Audit Trail', () => {
    it('should display audit logs', () => {
      cy.visit('/admin/audit');
      cy.get('table').should('exist');
    });

    it('should support action filtering', () => {
      cy.visit('/admin/audit');
      cy.get('select, [role=combobox]').first().should('exist');
    });
  });

  describe('Config', () => {
    it('should display tenant configuration', () => {
      cy.visit('/admin/config');
      // Should show form fields
      cy.get('input, [role=textbox]').should('have.length.at.least', 1);
    });

    it('should show feature toggles', () => {
      cy.visit('/admin/config');
      cy.get('[role=checkbox], input[type=checkbox]').should('have.length.at.least', 1);
    });
  });

  describe('Analytics', () => {
    it('should display charts', () => {
      cy.visit('/admin/analytics');
      // Charts or chart containers should be present
      cy.get('svg, [class*=chart], [class*=Chart]').should('exist');
    });

    it('should support period selection', () => {
      cy.visit('/admin/analytics');
      cy.get('select, [role=combobox]').should('exist');
    });
  });
});
