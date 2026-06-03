'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type UserRole } from '@promotor/types';
import { useForm } from 'react-hook-form';
import type { LoginInput } from '@promotor/types';
import { login } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { FormField } from './ui/form-field';

interface LoginFormProps {
  onAuthenticated: (role: UserRole) => void;
}

export const LoginForm = ({ onAuthenticated }: LoginFormProps) => {
  const setSession = useAuthStore((state) => state.setSession);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const session = await login(values);
      setSession(session);
      onAuthenticated(session.user.role);
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Falha ao autenticar',
      });
    }
  });

  return (
    <form className="auth-form login-auth-form" onSubmit={onSubmit}>
      <FormField label="E-mail" error={errors.email?.message}>
        <input
          className="input"
          type="email"
          placeholder="usuario@formula.local"
          autoComplete="email"
          {...register('email')}
        />
      </FormField>

      <FormField label="Senha" error={errors.password?.message}>
        <input
          className="input"
          type="password"
          placeholder="Digite sua senha"
          autoComplete="current-password"
          {...register('password')}
        />
      </FormField>

      {errors.root ? <span className="error-text">{errors.root.message}</span> : null}

      <button className="button button-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Entrando no sistema...' : 'Entrar no sistema'}
      </button>

      <a
        className="login-help-link"
        href="mailto:suporte@formula.local?subject=Recuperacao%20de%20senha"
      >
        Esqueci minha senha
      </a>
    </form>
  );
};
