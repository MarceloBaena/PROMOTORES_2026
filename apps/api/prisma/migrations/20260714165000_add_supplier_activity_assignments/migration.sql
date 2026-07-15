-- Fornecedores passam a concentrar as atividades operacionais executadas em cada cliente.
-- Mantemos a tabela de atividades existente e criamos um vinculo N:N com fornecedores.

CREATE TABLE "supplier_activity_assignments" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_activity_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_activity_assignments_supplier_id_activity_id_key"
    ON "supplier_activity_assignments"("supplier_id", "activity_id");

CREATE INDEX "supplier_activity_assignments_activity_id_idx"
    ON "supplier_activity_assignments"("activity_id");

ALTER TABLE "supplier_activity_assignments"
    ADD CONSTRAINT "supplier_activity_assignments_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_activity_assignments"
    ADD CONSTRAINT "supplier_activity_assignments_activity_id_fkey"
    FOREIGN KEY ("activity_id") REFERENCES "client_activity_types"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
