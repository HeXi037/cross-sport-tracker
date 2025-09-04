/// <reference types="cypress" />

describe('Authentication', () => {
  it('user can log in', () => {
    cy.intercept('POST', '**/v0/auth/login', (req) => {
      expect(req.body).to.deep.equal({ username: 'alice', password: 'secret' });
      req.reply({ statusCode: 200, body: { access_token: 't' } });
    }).as('login');

    cy.visit('/login');
    cy.get('input[placeholder="Username"]').first().type('alice');
    cy.get('input[placeholder="Password"]').first().type('secret');
    cy.contains('button', 'Login').click();

    cy.wait('@login');
    cy.location('pathname').should('eq', '/');
  });

  it('failed signup shows error', () => {
    cy.intercept('POST', '**/v0/auth/signup', {
      statusCode: 400,
      body: {},
    }).as('signup');

    cy.visit('/login');
    cy.get('input[placeholder="Username"]').eq(1).type('bob');
    cy.get('input[placeholder="Password"]').eq(1).type('pass');
    cy.contains('button', 'Sign Up').click();

    cy.wait('@signup');
    cy.get('[role="alert"]').should('contain.text', 'Signup failed');
  });
});

