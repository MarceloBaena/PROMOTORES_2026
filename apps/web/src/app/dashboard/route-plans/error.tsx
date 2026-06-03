'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/page-states';

interface RoutePlansErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RoutePlansError({ error, reset }: RoutePlansErrorProps) {
  useEffect(() => {
    console.error('route-plans-page-error', error);
  }, [error]);

  return (
    <ErrorState
      message="A tela de roteiros encontrou uma falha ao carregar. Tente novamente."
      retryLabel="Recarregar tela"
      onRetry={reset}
    />
  );
}
