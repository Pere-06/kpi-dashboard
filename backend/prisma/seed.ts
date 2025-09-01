// backend/prisma/seed.ts
import "dotenv/config";
import { prisma } from "../src/prisma.js";

async function main() {
  const clerkUserId = process.env.SEED_CLERK_USER_ID;
  if (!clerkUserId) {
    throw new Error(
      'Set SEED_CLERK_USER_ID en backend/.env (por ejemplo: user_123...)'
    );
  }

  // 1) Usuario enlazado a Clerk
  const user = await prisma.user.upsert({
    where: { clerkUserId },
    update: {},
    create: { clerkUserId },
  });

  // 2) Organización (por ID si se da, si no por nombre)
  const seedOrgId = process.env.SEED_ORG_ID || undefined; // opcional UUID
  const seedOrgName = process.env.SEED_ORG_NAME || "MiKPI (dev org)";

  let org =
    (seedOrgId
      ? await prisma.organization.findUnique({ where: { id: seedOrgId } })
      : await prisma.organization.findFirst({ where: { name: seedOrgName } })) ||
    null;

  if (!org) {
    org = await prisma.organization.create({
      data: {
        ...(seedOrgId ? { id: seedOrgId } : {}),
        name: seedOrgName,
      },
    });
  }

  // 3) Membresía admin si no existe
  const existing = await prisma.membership.findFirst({
    where: { userId: user.id, orgId: org.id },
  });

  if (!existing) {
    await prisma.membership.create({
      data: { userId: user.id, orgId: org.id, role: "admin" },
    });
  }

  console.log("✅ Seed OK");
  console.log("  Clerk user:", clerkUserId);
  console.log("  Org name  :", org.name);
  console.log("  ORG_ID    :", org.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
