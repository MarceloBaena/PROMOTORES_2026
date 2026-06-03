import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { LoginForm } from './login-form';

const loginMock = vi.fn();
const setSessionMock = vi.fn();

vi.mock('@/lib/api', () => ({
  login: (...args: unknown[]) => loginMock(...args),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: (selector: (state: { setSession: typeof setSessionMock }) => unknown) =>
    selector({
      setSession: setSessionMock,
    }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra validacoes essenciais antes de autenticar', async () => {
    const { container } = render(<LoginForm onAuthenticated={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('usuario@formula.local'), {
      target: { value: 'email-invalido' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
      target: { value: '123' },
    });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(await screen.findByText('Informe um email valido')).toBeDefined();
    expect(await screen.findByText('A senha deve ter pelo menos 8 caracteres')).toBeDefined();
  });

  it('persiste a sessao e chama o callback quando o login e valido', async () => {
    const onAuthenticated = vi.fn();

    loginMock.mockResolvedValue({
      user: {
        id: 'supervisor-1',
        email: 'supervisor@formula.local',
        name: 'Supervisor',
        role: 'SUPERVISOR',
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    render(<LoginForm onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByPlaceholderText('usuario@formula.local'), {
      target: { value: 'supervisor@formula.local' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
      target: { value: 'Supervisor@123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar no sistema' }));

    await waitFor(() => {
      expect(setSessionMock).toHaveBeenCalledWith({
        user: expect.objectContaining({
          role: 'SUPERVISOR',
        }),
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(onAuthenticated).toHaveBeenCalledWith('SUPERVISOR');
    });
  });

  it('aceita o perfil de promotor no portal web', async () => {
    const onAuthenticated = vi.fn();

    loginMock.mockResolvedValue({
      user: {
        id: 'promoter-1',
        email: 'promotor.centro@formula.local',
        name: 'Promotor Centro',
        role: 'PROMOTER',
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    render(<LoginForm onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByPlaceholderText('usuario@formula.local'), {
      target: { value: 'promotor.centro@formula.local' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
      target: { value: 'Promotor@123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar no sistema' }));

    await waitFor(() => {
      expect(setSessionMock).toHaveBeenCalledWith({
        user: expect.objectContaining({
          role: 'PROMOTER',
        }),
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(onAuthenticated).toHaveBeenCalledWith('PROMOTER');
    });
  });
});
