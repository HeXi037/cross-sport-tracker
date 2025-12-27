import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '../login/page';
import {
  apiFetch,
  currentUsername,
  persistSession,
  type ApiError,
} from '../../lib/api';
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

const makeApiError = (
  code: string,
  parsedMessage: string,
  status?: number
): ApiError => {
  const err = new Error(parsedMessage) as ApiError;
  err.code = code;
  err.parsedMessage = parsedMessage;
  if (status !== undefined) {
    err.status = status;
  }
  return err;
};

describe('LoginPage signup feedback', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedCurrentUsername.mockReset();
    mockedPersistSession.mockReset();
    pushMock.mockReset();
    mockedCurrentUsername.mockReturnValue(null);
    document.cookie = 'cst-login-redirect=; path=/; max-age=0';
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: '',
    });
    window.history.replaceState(null, '', '/login');
  });

  it('shows a success message when signup succeeds', async () => {
    mockedApiFetch.mockImplementation((path) => {
      if (path.startsWith('/v0/auth/signup/username-availability')) {
        return Promise.resolve(makeResponse({ available: true }));
      }
      if (path === '/v0/auth/signup') {
        return Promise.resolve(makeResponse({ access_token: 'token', refresh_token: 'refresh' }));
      }
      return Promise.reject(new Error(`Unexpected apiFetch call to ${path}`));
    });

    renderWithToast(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /create an account/i }));

    const signupForm = screen.getByTestId('signup-form');
    const signupUsername = within(signupForm).getByLabelText('Username');
    const signupPassword = within(signupForm).getByLabelText('Password');
    const confirmPassword = within(signupForm).getByLabelText('Confirm Password');

    fireEvent.change(signupUsername, { target: { value: 'NewUser' } });
    fireEvent.change(signupPassword, { target: { value: 'Str0ng!Pass!' } });
    fireEvent.change(confirmPassword, { target: { value: 'Str0ng!Pass!' } });

    fireEvent.click(within(signupForm).getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/v0/auth/signup',
        expect.objectContaining({ method: 'POST' })
      );
    });

    expect(mockedPersistSession).toHaveBeenCalledWith();
    expect(pushMock).toHaveBeenCalledWith('/profile');

    const toast = await screen.findByTestId('toast');
    expect(toast).toHaveTextContent(/Account created successfully!/i);
  });

  it('redirects to the stored page after login', async () => {
    mockedApiFetch.mockResolvedValueOnce(makeResponse({}));

    document.cookie = 'cst-login-redirect=%2Fprofile';

    renderWithToast(<LoginPage />);

    const [loginUsername] = screen.getAllByLabelText('Username');
    const [loginPassword] = screen.getAllByLabelText('Password');

    fireEvent.change(loginUsername, { target: { value: 'User' } });
    fireEvent.change(loginPassword, { target: { value: 'CorrectHorse!1' } });

    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/v0/auth/login',
        expect.objectContaining({ method: 'POST' })
      );
    });

    expect(mockedPersistSession).toHaveBeenCalledWith();
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/profile');
    });
  });

  it('sends users with temp passwords to the reset screen', async () => {
    mockedApiFetch.mockResolvedValueOnce(
      makeResponse({
        mustChangePassword: true,
      })
    );

    renderWithToast(<LoginPage />);

    const [loginUsername] = screen.getAllByLabelText('Username');
    const [loginPassword] = screen.getAllByLabelText('Password');

    fireEvent.change(loginUsername, { target: { value: 'User' } });
    fireEvent.change(loginPassword, { target: { value: 'CorrectHorse!1' } });

    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/v0/auth/login',
        expect.objectContaining({ method: 'POST' })
      );
    });

    expect(mockedPersistSession).toHaveBeenCalledWith();
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/set-password');
    });
  });

  it('surfaces signup failure reasons from the server', async () => {
    mockedApiFetch.mockImplementation((path) => {
      if (path.startsWith('/v0/auth/signup/username-availability')) {
        return Promise.resolve(makeResponse({ available: true }));
      }
      if (path === '/v0/auth/signup') {
        return Promise.resolve(
          makeResponse(
            { detail: 'username exists' },
            { ok: false, status: 400 }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected apiFetch call to ${path}`));
    });

    renderWithToast(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /create an account/i }));

    const signupForm = screen.getByTestId('signup-form');
    const signupUsername = within(signupForm).getByLabelText('Username');
    const signupPassword = within(signupForm).getByLabelText('Password');
    const confirmPassword = within(signupForm).getByLabelText('Confirm Password');

    fireEvent.change(signupUsername, { target: { value: 'Existing' } });
    fireEvent.change(signupPassword, { target: { value: 'Str0ng!Pass!' } });
    fireEvent.change(confirmPassword, { target: { value: 'Str0ng!Pass!' } });

    fireEvent.click(within(signupForm).getByRole('button', { name: /sign up/i }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(/Username already taken\./i)
    ).toBeInTheDocument();
    expect(mockedPersistSession).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('alerts when a username is already taken before submitting', async () => {
    mockedApiFetch.mockResolvedValueOnce(makeResponse({ available: false }));

    renderWithToast(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /create an account/i }));

    const signupForm = screen.getByTestId('signup-form');
    const signupUsername = within(signupForm).getByLabelText('Username');

    fireEvent.change(signupUsername, { target: { value: 'ExistingUser' } });
    fireEvent.blur(signupUsername);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/v0/auth/signup/username-availability?username=ExistingUser',
        expect.objectContaining({ signal: expect.any(Object) })
      );
    });

    expect(
      await within(signupForm).findByText(/Username already taken\./i)
    ).toBeInTheDocument();
  });

  it('shows username format guidance when validation fails', async () => {
    renderWithToast(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /create an account/i }));

    const signupForm = screen.getByTestId('signup-form');
    const signupUsername = within(signupForm).getByLabelText('Username');
    const signupPassword = within(signupForm).getByLabelText('Password');
    const confirmPassword = within(signupForm).getByLabelText('Confirm Password');

    fireEvent.change(signupUsername, { target: { value: 'Invalid Name' } });
    fireEvent.change(signupPassword, { target: { value: 'Str0ng!Pass!' } });
    fireEvent.change(confirmPassword, { target: { value: 'Str0ng!Pass!' } });

    fireEvent.click(within(signupForm).getByRole('button', { name: /sign up/i }));

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

  it('maps login error codes to friendly messages', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockedApiFetch.mockRejectedValueOnce(
      makeApiError('auth_invalid_credentials', 'invalid credentials', 401)
    );

    renderWithToast(<LoginPage />);

    const [loginUsername] = screen.getAllByLabelText('Username');
    const [loginPassword] = screen.getAllByLabelText('Password');

    fireEvent.change(loginUsername, {
      target: { value: 'User' },
    });
    fireEvent.change(loginPassword, {
      target: { value: 'wrong' },
    });

    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(/Login failed\. Please check your username and password\./i)
    ).toBeInTheDocument();

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Unhandled login error code')
    );

    consoleErrorSpy.mockRestore();
  });
});
