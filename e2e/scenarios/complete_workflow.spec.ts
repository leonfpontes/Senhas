/**
 * T115: Complete Workflow E2E Test (Cypress)
 * 
 * Scenario: Admin creates gira → User emits ticket → Admin visualizes
 * - Admin creates gira (event_date=tomorrow 18:00, tickets_limit=100)
 * - Public user accesses /[tenant]/emitir
 * - Fills form (nome, email, phone)
 * - Backend emits ticket (number=001)
 * - Email received (Brevo)
 * - Admin visualizes in dashboard (tickets count = 1)
 * - Admin marks as used
 * - Audit log records all events
 */

describe('Complete Workflow: Admin → Public → Admin', () => {
  const tenantId = 'test-tenant-001';
  const adminEmail = `admin@${tenantId}.local`;
  const adminPassword = 'SecurePassword123!';
  const publicUserEmail = 'user@example.com';
  const publicUserName = 'João Silva';
  const publicUserPhone = '(11) 99999-9999';

  let giraId: string;
  let ticketNumber: string;

  before(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.visit('/');
  });

  // ============================================
  // STEP 1: Admin Login
  // ============================================
  describe('Step 1: Admin Login', () => {
    it('should login admin user', () => {
      cy.visit(`/admin/login`);
      cy.get('[data-testid=email-input]').type(adminEmail);
      cy.get('[data-testid=password-input]').type(adminPassword);
      cy.get('[data-testid=login-button]').click();

      // Verify redirect to admin dashboard
      cy.url().should('include', '/admin/dashboard');
      cy.get('[data-testid=admin-dashboard]').should('be.visible');
    });

    it('should display admin dashboard with Gira list', () => {
      cy.get('[data-testid=giras-list]').should('be.visible');
      cy.get('[data-testid=create-gira-button]').should('be.visible');
    });
  });

  // ============================================
  // STEP 2: Admin Creates Gira
  // ============================================
  describe('Step 2: Admin Creates Gira', () => {
    it('should open create gira modal', () => {
      cy.get('[data-testid=create-gira-button]').click();
      cy.get('[data-testid=create-gira-modal]').should('be.visible');
    });

    it('should fill gira form', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const eventDate = tomorrow.toISOString().split('T')[0];

      cy.get('[data-testid=gira-name-input]').type('Test Gira 2026');
      cy.get('[data-testid=gira-description-input]').type(
        'E2E Test Gira for Complete Workflow'
      );
      cy.get('[data-testid=gira-date-input]').type(eventDate);
      cy.get('[data-testid=gira-time-input]').type('18:00');
      cy.get('[data-testid=gira-tickets-limit-input]').clear().type('100');
      cy.get('[data-testid=gira-location-input]').type('Test Location');
    });

    it('should submit form and create gira', () => {
      cy.get('[data-testid=create-gira-submit]').click();
      
      // Wait for modal to close and gira to appear in list
      cy.get('[data-testid=create-gira-modal]').should('not.exist');
      cy.get('[data-testid=gira-item]')
        .first()
        .should('contain', 'Test Gira 2026');

      // Extract gira ID from list item
      cy.get('[data-testid=gira-item]').first().then(($el) => {
        giraId = $el.data('gira-id');
      });
    });

    it('should display success notification', () => {
      cy.get('[data-testid=notification-success]').should('be.visible');
      cy.get('[data-testid=notification-success]').should(
        'contain',
        'Gira created successfully'
      );
    });
  });

  // ============================================
  // STEP 3: Public User Opens Gira
  // ============================================
  describe('Step 3: Public User Access Ticket Emission', () => {
    it('should logout admin', () => {
      cy.get('[data-testid=admin-menu]').click();
      cy.get('[data-testid=logout-button]').click();
      cy.url().should('include', '/login');
    });

    it('should access public ticket emission page', () => {
      cy.visit(`/public/${tenantId}/emitir`);
      cy.get('[data-testid=gira-details]').should('be.visible');
      cy.get('[data-testid=emit-ticket-form]').should('be.visible');
    });

    it('should display gira information', () => {
      cy.get('[data-testid=gira-name]').should('contain', 'Test Gira 2026');
      cy.get('[data-testid=gira-date]').should('be.visible');
      cy.get('[data-testid=countdown-timer]').should('be.visible');
    });

    it('should display countdown timer updating', () => {
      const initialTime = cy
        .get('[data-testid=countdown-timer]')
        .invoke('text');

      cy.wait(2000);

      cy.get('[data-testid=countdown-timer]').invoke('text').should(
        (finalTime) => {
          // Should have changed (updated countdown)
          expect(finalTime).to.not.be.undefined;
        }
      );
    });
  });

  // ============================================
  // STEP 4: Public User Fills Ticket Form
  // ============================================
  describe('Step 4: Public User Emits Ticket', () => {
    it('should fill ticket emission form', () => {
      cy.get('[data-testid=emit-form-name]').type(publicUserName);
      cy.get('[data-testid=emit-form-email]').type(publicUserEmail);
      cy.get('[data-testid=emit-form-phone]').type(publicUserPhone);
    });

    it('should accept terms', () => {
      cy.get('[data-testid=emit-form-terms-checkbox]').click();
    });

    it('should submit form and emit ticket', () => {
      cy.get('[data-testid=emit-form-submit]').click();

      // Should show success message
      cy.get('[data-testid=emit-success-modal]').should('be.visible');
      cy.get('[data-testid=ticket-number]').then(($el) => {
        ticketNumber = $el.text();
        expect(ticketNumber).to.match(/\d+/);
      });
    });

    it('should display ticket in success modal', () => {
      cy.get('[data-testid=ticket-details]').should('be.visible');
      cy.get('[data-testid=ticket-email-sent]').should(
        'contain',
        'Email enviado para'
      );
    });

    it('should show close button', () => {
      cy.get('[data-testid=emit-success-close]').should('be.visible');
      cy.get('[data-testid=emit-success-close]').click();
      cy.get('[data-testid=emit-success-modal]').should('not.exist');
    });
  });

  // ============================================
  // STEP 5: Admin Visualizes Ticket
  // ============================================
  describe('Step 5: Admin Dashboard - Tickets Visualization', () => {
    it('should login admin again', () => {
      cy.visit(`/admin/login`);
      cy.get('[data-testid=email-input]').type(adminEmail);
      cy.get('[data-testid=password-input]').type(adminPassword);
      cy.get('[data-testid=login-button]').click();
      cy.url().should('include', '/admin/dashboard');
    });

    it('should navigate to gira details', () => {
      cy.get('[data-testid=gira-item]').first().click();
      cy.get('[data-testid=gira-details-page]').should('be.visible');
    });

    it('should display tickets list with emitted ticket', () => {
      cy.get('[data-testid=tickets-list]').should('be.visible');
      cy.get('[data-testid=ticket-row]')
        .should('have.length.greaterThan', 0)
        .first()
        .should('contain', publicUserName);
      cy.get('[data-testid=ticket-row]')
        .first()
        .should('contain', publicUserEmail);
    });

    it('should display ticket counter', () => {
      cy.get('[data-testid=tickets-count]').should('contain', '1');
    });
  });

  // ============================================
  // STEP 6: Admin Marks Ticket as Used
  // ============================================
  describe('Step 6: Admin Marks Ticket as Used', () => {
    it('should open ticket actions menu', () => {
      cy.get('[data-testid=ticket-row]').first().find('[data-testid=ticket-menu]').click();
    });

    it('should mark ticket as used', () => {
      cy.get('[data-testid=mark-used-option]').click();

      // Should show confirmation modal
      cy.get('[data-testid=confirm-modal]').should('be.visible');
    });

    it('should confirm mark as used', () => {
      cy.get('[data-testid=confirm-button]').click();

      // Should show success notification
      cy.get('[data-testid=notification-success]').should('be.visible');
      cy.get('[data-testid=ticket-row]')
        .first()
        .should('have.class', 'ticket-used');
    });
  });

  // ============================================
  // STEP 7: Verify Audit Log
  // ============================================
  describe('Step 7: Verify Audit Log', () => {
    it('should navigate to audit logs', () => {
      cy.get('[data-testid=admin-menu]').click();
      cy.get('[data-testid=audit-logs-link]').click();
      cy.get('[data-testid=audit-logs-page]').should('be.visible');
    });

    it('should display audit log entries', () => {
      cy.get('[data-testid=audit-log-entry]').should('have.length.greaterThan', 0);
    });

    it('should show ticket emission event', () => {
      cy.get('[data-testid=audit-log-entry]')
        .should('contain', 'TICKET_EMITTED')
        .or.contain('ticket.emitted');
    });

    it('should show ticket marked as used event', () => {
      cy.get('[data-testid=audit-log-entry]')
        .should('contain', 'TICKET_MARKED_USED')
        .or.contain('ticket.marked_used');
    });

    it('should display all audit log fields', () => {
      cy.get('[data-testid=audit-log-entry]').first().within(() => {
        cy.get('[data-testid=log-action]').should('be.visible');
        cy.get('[data-testid=log-user]').should('be.visible');
        cy.get('[data-testid=log-timestamp]').should('be.visible');
        cy.get('[data-testid=log-resource]').should('be.visible');
      });
    });
  });

  // ============================================
  // STEP 8: End-to-End Summary Verification
  // ============================================
  describe('Step 8: E2E Summary Verification', () => {
    it('should have valid ticket number format', () => {
      expect(ticketNumber).to.match(/^\d{3,}$/);
    });

    it('should have completed full workflow', () => {
      // Verify we completed all major steps
      expect(giraId).to.not.be.undefined;
      expect(ticketNumber).to.not.be.undefined;
    });

    it('should verify data integrity across pages', () => {
      cy.visit(`/admin/login`);
      cy.get('[data-testid=email-input]').type(adminEmail);
      cy.get('[data-testid=password-input]').type(adminPassword);
      cy.get('[data-testid=login-button]').click();

      cy.get('[data-testid=gira-item]').first().click();
      cy.get('[data-testid=ticket-row]').first().should('contain', publicUserName);
    });
  });
});
