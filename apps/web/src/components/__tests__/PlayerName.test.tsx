import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PlayerName, { type PlayerInfo } from '../PlayerName';

const expectNextImageSrc = (img: HTMLElement, expectedPath: string) => {
  const src = img.getAttribute('src');
  expect(src).toBeTruthy();
  const resolved = new URL(src ?? '', 'http://localhost');
  if (resolved.pathname === '/_next/image') {
    const urlParam = resolved.searchParams.get('url');
    expect(urlParam ? decodeURIComponent(urlParam) : null).toBe(expectedPath);
    return;
  }
  expect(resolved.pathname + resolved.search).toBe(expectedPath);
};

describe('PlayerName', () => {
  const renderComponent = (player: PlayerInfo) => render(<PlayerName player={player} />);

  it('normalizes malformed photo URLs before rendering', () => {
    renderComponent({
      id: '1',
      name: 'Valid Avatar',
      photo_url: '/static/users/avatar.png undefined',
    });

    const img = screen.getByAltText('Valid Avatar avatar');
    expectNextImageSrc(img, '/api/static/users/avatar.png');
  });

  it('falls back to an initials placeholder when the URL is invalid', () => {
    renderComponent({
      id: '2',
      name: 'Placeholder Person',
      photo_url: 'undefined',
    });

    expect(
      screen.queryByAltText('Placeholder Person avatar'),
    ).not.toBeInTheDocument();
    const placeholder = screen.getByRole('img', {
      name: 'Placeholder Person avatar placeholder',
    });
    expect(placeholder).toHaveTextContent('PP');
  });
});
