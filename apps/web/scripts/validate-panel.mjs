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

  const authHeaders = {
    Authorization: `Bearer ${session.accessToken}`,
  };

  const [
    dashboard,
    map,
    team,
    visits,
    alerts,
    evidences,
    customers,
    routePlans,
    promoters,
    reports,
  ] = await Promise.all([
    requestJson('/supervisor/dashboard', { headers: authHeaders }),
    requestJson('/supervisor/map', { headers: authHeaders }),
    requestJson('/supervisor/team', { headers: authHeaders }),
    requestJson('/supervisor/visits', { headers: authHeaders }),
    requestJson('/supervisor/alerts', { headers: authHeaders }),
    requestJson('/supervisor/evidences', { headers: authHeaders }),
    requestJson('/customers?pageSize=5', { headers: authHeaders }),
    requestJson('/route-plans?pageSize=5', { headers: authHeaders }),
    requestJson('/promoters?pageSize=5', { headers: authHeaders }),
    requestJson('/supervisor/reports', { headers: authHeaders }),
  ]);

  if (customers.items[0]) {
    await requestJson(`/customers/${customers.items[0].id}`, { headers: authHeaders });
  }

  if (routePlans.items[0]) {
    await requestJson(`/route-plans/${routePlans.items[0].id}`, { headers: authHeaders });
  }

  await requestJson('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({
      refreshToken: session.refreshToken,
    }),
  });

  return {
    channel: 'web-panel',
    dashboard: {
      plannedVisits: dashboard.plannedVisits,
      completedVisits: dashboard.completedVisits,
      openAlerts: dashboard.openAlerts,
    },
    mapPromoters: map.promoters.length,
    teamRows: team.items.length,
    visitsRows: visits.items.length,
    alertsRows: alerts.items.length,
    evidenceRows: evidences.items.length,
    customersRows: customers.items.length,
    routePlanRows: routePlans.items.length,
    promotersRows: promoters.items.length,
    reportPlanned: reports.summary.planned,
  };
});

console.log(JSON.stringify(summary, null, 2));
