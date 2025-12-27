import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import SetPasswordPage from '../set-password/page';
import {
  isLoggedIn,
  mustChangePasswordRequired,
  persistSession,
  updateMe,
} from '../../lib/api';
import { rememberLoginRedirect } from '../../lib/loginRedirect';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>(
    '../../lib/api'
  );
  return {
    ...actual,
    isLoggedIn: vi.fn(),
    mustChangePasswordRequired: vi.fn(),
    persistSession: vi.fn(),
    updateMe: vi.fn(),
  };
});

vi.mock('../../lib/loginRedirect', () => ({
  rememberLoginRedirect: vi.fn(),
}));

const replaceMock = vi.fn();

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>(
    'next/navigation'
  );
  return {
    ...actual,
    useRouter: () => ({
      replace: replaceMock,
      push: replaceMock,
    }),
  };
});

const mockedIsLoggedIn = vi.mocked(isLoggedIn);
const mockedMustChange = vi.mocked(mustChangePasswordRequired);
const mockedPersistSession = vi.mocked(persistSession);
const mockedUpdateMe = vi.mocked(updateMe);
const mockedRememberRedirect = vi.mocked(rememberLoginRedirect);

function renderPage() {
  return render(<SetPasswordPage />);
}

describe('SetPasswordPage', () => {
  beforeEach(() => {
    mockedIsLoggedIn.mockReset();
    mockedMustChange.mockReset();
    mockedPersistSession.mockReset();
    mockedUpdateMe.mockReset();
    mockedRememberRedirect.mockReset();
    replaceMock.mockReset();
  });

  it('redirects unauthenticated users to login', async () => {
    mockedIsLoggedIn.mockReturnValue(false);
    mockedMustChange.mockReturnValue(false);

    renderPage();

    await waitFor(() => {
      expect(mockedRememberRedirect).toHaveBeenCalledWith('/set-password');
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
  });

  it('sends users without the flag back home', async () => {
    mockedIsLoggedIn.mockReturnValue(true);
    mockedMustChange.mockReturnValue(false);

    renderPage();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });

  it('lets flagged users set a new password', async () => {
    mockedIsLoggedIn.mockReturnValue(true);
    mockedMustChange.mockReturnValue(true);
    mockedUpdateMe.mockResolvedValue({
      mustChangePassword: false,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Set a new password/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'CorrectHorse!1' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'CorrectHorse!1' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));

    await waitFor(() => {
      expect(mockedUpdateMe).toHaveBeenCalledWith({ password: 'CorrectHorse!1' });
      expect(mockedPersistSession).toHaveBeenCalledWith();
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });
});
