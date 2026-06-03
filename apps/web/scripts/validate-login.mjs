import { withApiRuntime } from '../../../scripts/with-api-runtime.mjs';

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3333/api';

const requestJson = async (path, init = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message ?? `Falha HTTP ${response.status}`);
  }

  return payload;
};

const summary = await withApiRuntime(apiBaseUrl, async () => {
  const session = await requestJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'supervisor@formula.local',
      password: 'Supervisor@123',
    }),
  });

  if (!['ADMIN', 'SUPERVISOR'].includes(session.user.role)) {
    throw new Error('Perfil invalido para o painel web');
  }

  const me = await requestJson('/auth/me', {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  const dashboard = await requestJson('/supervisor/dashboard', {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  await requestJson('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({
      refreshToken: session.refreshToken,
    }),
  });

  return {
    channel: 'web',
    user: me.email,
    role: me.role,
    plannedVisits: dashboard.plannedVisits,
    pendingVisits: dashboard.pendingVisits,
  };
});

console.log(JSON.stringify(summary, null, 2));
