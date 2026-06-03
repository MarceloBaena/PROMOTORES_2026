-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'TEAM';

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'TEAM_MEMBER';

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "region" TEXT,
    "supervisorUserId" TEXT,
    "status" "TeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "promoterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_companyId_code_key" ON "Team"("companyId", "code");
CREATE INDEX "Team_companyId_name_idx" ON "Team"("companyId", "name");
CREATE INDEX "Team_companyId_region_status_idx" ON "Team"("companyId", "region", "status");
CREATE INDEX "Team_companyId_supervisorUserId_status_idx" ON "Team"("companyId", "supervisorUserId", "status");
CREATE UNIQUE INDEX "TeamMember_promoterId_key" ON "TeamMember"("promoterId");
CREATE UNIQUE INDEX "TeamMember_teamId_promoterId_key" ON "TeamMember"("teamId", "promoterId");
CREATE INDEX "TeamMember_teamId_createdAt_idx" ON "TeamMember"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "Team"
ADD CONSTRAINT "Team_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Team"
ADD CONSTRAINT "Team_supervisorUserId_fkey"
FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamMember"
ADD CONSTRAINT "TeamMember_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMember"
ADD CONSTRAINT "TeamMember_promoterId_fkey"
FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
