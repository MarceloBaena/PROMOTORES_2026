-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED');

-- AlterTable
ALTER TABLE "Promoter" ADD COLUMN     "defaultJourneyEndTime" TEXT,
ADD COLUMN     "defaultJourneyStartTime" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "employeeCode" TEXT,
ADD COLUMN     "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "hireDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "region" TEXT;

-- CreateIndex
CREATE INDEX "User_companyId_role_employmentStatus_idx" ON "User"("companyId", "role", "employmentStatus");

-- CreateIndex
CREATE INDEX "User_companyId_region_employmentStatus_idx" ON "User"("companyId", "region", "employmentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_cpf_key" ON "User"("companyId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_employeeCode_key" ON "User"("companyId", "employeeCode");
