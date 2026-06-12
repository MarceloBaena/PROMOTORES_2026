-- Backfill tenant/company data created before multi-company support.
-- The app mobile only downloads routes and clients for the promoter's company,
-- so legacy NULL company_id records must be reconciled before production use.

WITH default_company AS (
  SELECT id
  FROM companies
  WHERE status = 'ACTIVE'
  ORDER BY code ASC
  LIMIT 1
)
UPDATE promoters
SET company_id = (SELECT id FROM default_company)
WHERE company_id IS NULL
  AND EXISTS (SELECT 1 FROM default_company);

UPDATE users
SET company_id = promoters.company_id
FROM promoters
WHERE users.id = promoters.user_id
  AND users.company_id IS NULL
  AND promoters.company_id IS NOT NULL;

UPDATE users
SET company_id = supervisors.company_id
FROM supervisors
WHERE users.id = supervisors.user_id
  AND users.company_id IS NULL
  AND supervisors.company_id IS NOT NULL;

UPDATE clients
SET company_id = promoters.company_id
FROM promoters
WHERE clients.default_promoter_id = promoters.id
  AND clients.company_id IS NULL
  AND promoters.company_id IS NOT NULL;

UPDATE routes
SET company_id = promoters.company_id
FROM promoters
WHERE routes.promoter_id = promoters.id
  AND routes.company_id IS NULL
  AND promoters.company_id IS NOT NULL;

UPDATE routes
SET company_id = supervisors.company_id
FROM supervisors
WHERE routes.supervisor_id = supervisors.id
  AND routes.company_id IS NULL
  AND supervisors.company_id IS NOT NULL;

UPDATE clients
SET company_id = routes.company_id
FROM route_items
JOIN routes ON routes.id = route_items.route_id
WHERE clients.id = route_items.client_id
  AND clients.company_id IS NULL
  AND routes.company_id IS NOT NULL;

UPDATE visits
SET company_id = routes.company_id
FROM routes
WHERE visits.route_id = routes.id
  AND visits.company_id IS NULL
  AND routes.company_id IS NOT NULL;

UPDATE visits
SET company_id = promoters.company_id
FROM promoters
WHERE visits.promoter_id = promoters.id
  AND visits.company_id IS NULL
  AND promoters.company_id IS NOT NULL;

UPDATE visits
SET company_id = clients.company_id
FROM clients
WHERE visits.client_id = clients.id
  AND visits.company_id IS NULL
  AND clients.company_id IS NOT NULL;

UPDATE promoter_locations
SET company_id = promoters.company_id
FROM promoters
WHERE promoter_locations.promoter_id = promoters.id
  AND promoter_locations.company_id IS NULL
  AND promoters.company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS promoters_company_id_status_idx
  ON promoters(company_id, status);

CREATE INDEX IF NOT EXISTS clients_company_id_default_promoter_id_status_idx
  ON clients(company_id, default_promoter_id, status);

CREATE INDEX IF NOT EXISTS routes_company_id_promoter_id_status_scheduled_date_idx
  ON routes(company_id, promoter_id, status, scheduled_date);

CREATE INDEX IF NOT EXISTS route_items_route_id_client_id_idx
  ON route_items(route_id, client_id);
