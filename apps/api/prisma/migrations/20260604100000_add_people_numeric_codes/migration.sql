CREATE SEQUENCE IF NOT EXISTS supervisors_code_seq;
CREATE SEQUENCE IF NOT EXISTS promoters_code_seq;

ALTER TABLE "supervisors" ADD COLUMN "code" INTEGER;
ALTER TABLE "promoters" ADD COLUMN "code" INTEGER;

WITH ordered_supervisors AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY "created_at", "id")::integer AS "next_code"
  FROM "supervisors"
)
UPDATE "supervisors"
SET "code" = ordered_supervisors."next_code"
FROM ordered_supervisors
WHERE "supervisors"."id" = ordered_supervisors."id";

WITH ordered_promoters AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY "created_at", "id")::integer AS "next_code"
  FROM "promoters"
)
UPDATE "promoters"
SET "code" = ordered_promoters."next_code"
FROM ordered_promoters
WHERE "promoters"."id" = ordered_promoters."id";

SELECT setval('supervisors_code_seq', COALESCE((SELECT MAX("code") FROM "supervisors"), 0) + 1, false);
SELECT setval('promoters_code_seq', COALESCE((SELECT MAX("code") FROM "promoters"), 0) + 1, false);

ALTER TABLE "supervisors" ALTER COLUMN "code" SET DEFAULT nextval('supervisors_code_seq');
ALTER TABLE "promoters" ALTER COLUMN "code" SET DEFAULT nextval('promoters_code_seq');

ALTER TABLE "supervisors" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "promoters" ALTER COLUMN "code" SET NOT NULL;

ALTER SEQUENCE supervisors_code_seq OWNED BY "supervisors"."code";
ALTER SEQUENCE promoters_code_seq OWNED BY "promoters"."code";

CREATE UNIQUE INDEX "supervisors_code_key" ON "supervisors"("code");
CREATE UNIQUE INDEX "promoters_code_key" ON "promoters"("code");
