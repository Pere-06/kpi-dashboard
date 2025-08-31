
// backend/prisma/seed.ts
import { prisma } from "../src/prisma";

async function main() {
  const clerkUserId = process.env.SEED_CLERK_USER_ID;
  if (!clerkUserId) {
    throw new Error('Set SEED_CLERK_USER_ID in backend/.env with your Clerk "User ID" (e.g. user_123...)');
  }

  // 1) Usuario (link a Clerk)
  const user = await prisma.user.upsert({
    where: { clerkUserId },
    update: {},
    create: { clerkUserId },
  });

  // 2) Organización (usa id/nombre de ENV si los pones)
  const seedOrgId = process.env.SEED_ORG_ID;          // opcional (UUID)
  const seedOrgName = process.env.SEED_ORG_NAME || "MiKPI (dev org)";

  let org = null as null | { id: string; name: string };

  if (seedOrgId) {
    org =
      (await prisma.organization.findUnique({ where: { id: seedOrgId } })) ??
      (await prisma.organization.create({ data: { id: seedOrgId, name: seedOrgName } }));
  } else {
    org =
      (await prisma.organization.findFirst({ where: { name: seedOrgName } })) ??
      (await prisma.organization.create({ data: { name: seedOrgName } }));
  }

  // 3) Membresía (admin) si no existe
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
