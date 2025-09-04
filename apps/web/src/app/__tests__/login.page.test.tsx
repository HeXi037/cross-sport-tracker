import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '../login/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('LoginPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows error on failed login', async () => {
    global.fetch =
      vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    render(<LoginPage />);
    const username = screen.getAllByPlaceholderText(/username/i)[0];
    const password = screen.getAllByPlaceholderText(/password/i)[0];
    fireEvent.change(username, { target: { value: 'user' } });
    fireEvent.change(password, { target: { value: 'pass' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/v0/auth/login', expect.any(Object));
    expect(await screen.findByRole('alert')).toHaveTextContent(/login failed/i);
  });

  it('shows error on failed signup', async () => {
    global.fetch =
      vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    render(<LoginPage />);
    const username = screen.getAllByPlaceholderText(/username/i)[1];
    const password = screen.getAllByPlaceholderText(/password/i)[1];
    fireEvent.change(username, { target: { value: 'new' } });
    fireEvent.change(password, { target: { value: 'pass' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/v0/auth/signup', expect.any(Object));
    expect(await screen.findByRole('alert')).toHaveTextContent(/signup failed/i);
  });
});
