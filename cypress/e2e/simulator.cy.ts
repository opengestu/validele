describe('Dev simulator E2E', () => {
  beforeEach(() => {
    // ensure a clean state
    cy.clearLocalStorage();
    cy.visit('/auth');
  });

  it('simulates Buyer and redirects to /buyer with sms_auth_session', () => {
    cy.get('input[placeholder="+2217xxxxxxxx"]').type('777693020');
    cy.contains('Numéro de test détecté').should('be.visible');
    cy.contains('Simuler Client').click();

    cy.location('pathname').should('include', '/buyer');
    cy.window().then((win: any) => {
      const s = win.localStorage.getItem('sms_auth_session');
      expect(s).to.exist;
      const parsed = JSON.parse(s || '{}');
      expect(parsed.role).to.equal('buyer');
    });
  });

  it('buyer can search PD-DEV-1 and see demo product (dev shortcut)', () => {
    // Simulate buyer session first
    cy.get('input[placeholder="+2217xxxxxxxx"]').type('777693020');
    cy.contains('Numéro de test détecté').should('be.visible');
    cy.contains('Simuler Client').click();
    cy.location('pathname').should('include', '/buyer');

    // Perform product search for the dev product
    cy.get('input[placeholder="Code produit..."]').type('PD-DEV-1');
    cy.contains('Rechercher').click();

    // Modal with demo product should be visible
    cy.contains('Produit démo — Maïs').should('be.visible');
    cy.contains('Produit trouvé (dev)').should('be.visible');
    cy.get('button').contains('Payer avec').should('exist');
  });

  it('vendor can add a dev product and buyer can find it', () => {
    // Simulate vendor session
    cy.get('input[placeholder="+2217xxxxxxxx"]').type('777693020');
    cy.contains('Numéro de test détecté').should('be.visible');
    cy.contains('Simuler Vendeur').click();
    cy.location('pathname').should('include', '/vendor');

    // Open add product modal
    cy.contains('Ajouter').click();
    cy.get('input[placeholder="Ex: iPhone 13"]').type('Produit E2E Dev');
    cy.get('input[placeholder="Ex: 500000"]').type('1500');
    cy.get('textarea[placeholder="Décrivez votre produit..."]').type('Produit ajouté en E2E');
    cy.get('input[placeholder="Ex: PD-DEV-1"]').type('PD-E2E-1');
    cy.contains('Ajouter').filter(':visible').click();

    // Product should appear in vendor list
    cy.contains('Produit E2E Dev').should('be.visible');
    cy.contains('PD-E2E-1').should('be.visible');

    // Switch to buyer session (keep localStorage dev_products preserved)
    cy.window().then((win) => {
      win.localStorage.setItem('sms_auth_session', JSON.stringify({ profileId: 'dev-buyer-777693020', role: 'buyer', phone: '+221777693020' }));
    });

    cy.visit('/buyer');
    cy.get('input[placeholder="Code produit..."]').type('PD-E2E-1');
    cy.contains('Rechercher').click();

    cy.contains('Produit E2E Dev').should('be.visible');
    cy.contains('Produit trouvé (dev)').should('be.visible');
  });

  it('simulates Vendor and sets auth_token + redirects to /vendor', () => {
    cy.get('input[placeholder="+2217xxxxxxxx"]').type('777693020');
    cy.contains('Numéro de test détecté').should('be.visible');
    cy.contains('Simuler Vendeur').click();

    cy.location('pathname').should('include', '/vendor');
    cy.window().then((win) => {
      const s = win.localStorage.getItem('sms_auth_session');
      expect(s).to.exist;
      const parsed = JSON.parse(s || '{}');
      expect(parsed.role).to.equal('vendor');
      expect(win.localStorage.getItem('auth_token')).to.equal('dev-token-vendor');
    });
  });

  it('simulates Delivery and redirects to /delivery', () => {
    cy.get('input[placeholder="+2217xxxxxxxx"]').type('777693020');
    cy.contains('Numéro de test détecté').should('be.visible');
    cy.contains('Simuler Livreur').click();

    cy.location('pathname').should('include', '/delivery');
    cy.window().then((win) => {
      const s = win.localStorage.getItem('sms_auth_session');
      expect(s).to.exist;
      const parsed = JSON.parse(s || '{}');
      expect(parsed.role).to.equal('delivery');
    });
  });
});