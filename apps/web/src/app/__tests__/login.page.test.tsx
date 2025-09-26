import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '../login/page';
import { apiFetch, currentUsername, persistSession } from '../../lib/api';
import ToastProvider from '../../components/ToastProvider';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>(
    '../../lib/api'
  );
  return {
    ...actual,
    apiFetch: vi.fn(),
    currentUsername: vi.fn(),
    persistSession: vi.fn(),
    logout: vi.fn(),
  };
});

const pushMock = vi.fn();

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>(
    'next/navigation'
  );
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
    }),
  };
});

const mockedApiFetch = vi.mocked(apiFetch);
const mockedCurrentUsername = vi.mocked(currentUsername);
const mockedPersistSession = vi.mocked(persistSession);

const renderWithToast = (ui: JSX.Element) => render(<ToastProvider>{ui}</ToastProvider>);

const makeResponse = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {}
): Response => {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 400);
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    clone() {
      return makeResponse(body, { ok, status });
    },
  } as Response;
};

describe('LoginPage signup feedback', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedCurrentUsername.mockReset();
    mockedPersistSession.mockReset();
    pushMock.mockReset();
    mockedCurrentUsername.mockReturnValue(null);
  });

  it('shows a success message when signup succeeds', async () => {
    mockedApiFetch.mockResolvedValueOnce(
      makeResponse({ access_token: 'token', refresh_token: 'refresh' })
    );

    renderWithToast(<LoginPage />);

    const [, signupUsername] = screen.getAllByLabelText('Username');
    const signupPassword = screen.getAllByLabelText('Password')[1];
    const confirmPassword = screen.getByLabelText('Confirm Password');

    fireEvent.change(signupUsername, { target: { value: 'NewUser' } });
    fireEvent.change(signupPassword, { target: { value: 'Str0ng!Pass!' } });
    fireEvent.change(confirmPassword, { target: { value: 'Str0ng!Pass!' } });

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/v0/auth/signup',
        expect.objectContaining({ method: 'POST' })
      );
    });

    expect(mockedPersistSession).toHaveBeenCalledWith({
      access_token: 'token',
      refresh_token: 'refresh',
    });
    expect(pushMock).toHaveBeenCalledWith('/');

    const toast = await screen.findByTestId('toast');
    expect(toast).toHaveTextContent(/Account created successfully!/i);
  });

  it('surfaces signup failure reasons from the server', async () => {
    mockedApiFetch.mockResolvedValueOnce(
      makeResponse(
        { detail: 'username exists' },
        { ok: false, status: 400 }
      )
    );

    renderWithToast(<LoginPage />);

    const [, signupUsername] = screen.getAllByLabelText('Username');
    const signupPassword = screen.getAllByLabelText('Password')[1];
    const confirmPassword = screen.getByLabelText('Confirm Password');

    fireEvent.change(signupUsername, { target: { value: 'Existing' } });
    fireEvent.change(signupPassword, { target: { value: 'Str0ng!Pass!' } });
    fireEvent.change(confirmPassword, { target: { value: 'Str0ng!Pass!' } });

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(/Username already taken\./i)
    ).toBeInTheDocument();
    expect(mockedPersistSession).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows username format guidance when validation fails', async () => {
    renderWithToast(<LoginPage />);

    const [, signupUsername] = screen.getAllByLabelText('Username');
    const signupPassword = screen.getAllByLabelText('Password')[1];
    const confirmPassword = screen.getByLabelText('Confirm Password');

    fireEvent.change(signupUsername, { target: { value: 'Invalid Name' } });
    fireEvent.change(signupPassword, { target: { value: 'Str0ng!Pass!' } });
    fireEvent.change(confirmPassword, { target: { value: 'Str0ng!Pass!' } });

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(
        /Usernames can include letters, numbers, underscores, hyphens, and periods\./i,
      ),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText(/You can also use a valid email address\./i),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
