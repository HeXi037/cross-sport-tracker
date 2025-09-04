/// <reference types="cypress" />

describe('Padel scoring', () => {
  it('records padel match', () => {
    cy.intercept('GET', '**/v0/players', {
      statusCode: 200,
      body: {
        players: [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
          { id: '3', name: 'Cara' },
          { id: '4', name: 'Dan' },
        ],
      },
    }).as('players');

    cy.intercept('POST', '**/v0/matches', {
      statusCode: 200,
      body: { id: 'm1' },
    }).as('match');

    cy.intercept('POST', '**/v0/matches/m1/sets', (req) => {
      expect(req.body).to.deep.equal({ sets: [{ A: 6, B: 4 }] });
      req.reply({ statusCode: 200, body: {} });
    }).as('sets');

    cy.visit('/record/padel');
    cy.wait('@players');

    cy.get('#padel-a1').select('1');
    cy.get('#padel-a2').select('2');
    cy.get('#padel-b1').select('3');
    cy.get('#padel-b2').select('4');
    cy.get('#set-0-a').type('6');
    cy.get('#set-0-b').type('4');
    cy.contains('button', 'Save').click();

    cy.wait('@match');
    cy.wait('@sets');
  });
});

