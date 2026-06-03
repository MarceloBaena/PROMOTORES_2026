import { withApiRuntime } from '../../../scripts/with-api-runtime.mjs';

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3333/api';
const email = process.env.MOBILE_VALIDATE_EMAIL ?? 'promotor.centro@formula.local';
const password = process.env.MOBILE_VALIDATE_PASSWORD ?? 'Promotor@123';

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
      email,
      password,
    }),
  });

  if (session.user.role !== 'PROMOTER') {
    throw new Error('Perfil invalido para o app mobile operacional');
  }

  const me = await requestJson('/auth/me', {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  const routeBundle = await requestJson('/operations/route/today', {
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
    channel: 'mobile',
    user: me.email,
    role: me.role,
    routeStops: routeBundle.route?.stops?.length ?? 0,
    checklistItems: routeBundle.checklistTemplate?.length ?? 0,
  };
});

console.log(JSON.stringify(summary, null, 2));
