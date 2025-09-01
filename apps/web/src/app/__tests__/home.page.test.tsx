import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePageClient from '../home-page-client';

describe('HomePageClient error messages', () => {
  it('shows sports error message', () => {
    render(
      <HomePageClient
        sports={[]}
        matches={[]}
        sportError={true}
        matchError={false}
      />
    );
    expect(
      screen.getByText(/Unable to load sports\. Check connection\./i)
    ).toBeInTheDocument();
  });

  it('shows matches error message', () => {
    render(
      <HomePageClient
        sports={[]}
        matches={[]}
        sportError={false}
        matchError={true}
      />
    );
    expect(
      screen.getByText(/Unable to load matches\. Check connection\./i)
    ).toBeInTheDocument();
  });
});
