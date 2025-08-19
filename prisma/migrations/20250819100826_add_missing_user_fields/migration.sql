-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user',
ALTER COLUMN "provider" SET DEFAULT 'local',
ALTER COLUMN "providerId" DROP NOT NULL;
