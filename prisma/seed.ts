import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Opmaint PTW database...");

  const defaultPasswordHash = await bcrypt.hash("password123", 10);

  // 1. Users
  const admin = await prisma.user.upsert({
    where: { email: "admin@opmaint.local" },
    update: { isActive: true },
    create: {
      email: "admin@opmaint.local",
      name: "Super Admin",
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  const areaOwnerPress = await prisma.user.upsert({
    where: { email: "ao.press@opmaint.local" },
    update: { isActive: true },
    create: {
      email: "ao.press@opmaint.local",
      name: "Vikram Mehta (Press Area Owner)",
      passwordHash: defaultPasswordHash,
      role: Role.AREA_OWNER,
      isActive: true,
    },
  });

  const areaOwnerPaint = await prisma.user.upsert({
    where: { email: "ao.paint@opmaint.local" },
    update: { isActive: true },
    create: {
      email: "ao.paint@opmaint.local",
      name: "Pooja Sharma (Paint Area Owner)",
      passwordHash: defaultPasswordHash,
      role: Role.AREA_OWNER,
      isActive: true,
    },
  });

  const safetyOfficer = await prisma.user.upsert({
    where: { email: "safety.officer@opmaint.local" },
    update: { isActive: true },
    create: {
      email: "safety.officer@opmaint.local",
      name: "Rajesh Kulkarni (Chief Safety Officer)",
      passwordHash: defaultPasswordHash,
      role: Role.SAFETY_OFFICER,
      isActive: true,
    },
  });

  const requester = await prisma.user.upsert({
    where: { email: "requester@opmaint.local" },
    update: { isActive: true },
    create: {
      email: "requester@opmaint.local",
      name: "Sunil Verma (Maintenance Lead / Requester)",
      passwordHash: defaultPasswordHash,
      role: Role.REQUESTER,
      isActive: true,
    },
  });

  const deactivatedUser = await prisma.user.upsert({
    where: { email: "deactivated@opmaint.local" },
    update: { isActive: false },
    create: {
      email: "deactivated@opmaint.local",
      name: "Former Contractor (Deactivated)",
      passwordHash: defaultPasswordHash,
      role: Role.REQUESTER,
      isActive: false,
    },
  });

  // 2. Plant
  const plant = await prisma.plant.upsert({
    where: { code: "PUNE-PLANT-01" },
    update: {},
    create: {
      code: "PUNE-PLANT-01",
      name: "Pune Automotive Manufacturing Facility",
      timezone: "Asia/Kolkata",
    },
  });

  // 3. Areas
  const pressArea = await prisma.area.upsert({
    where: {
      plantId_code: {
        plantId: plant.id,
        code: "PRESS_SHOP",
      },
    },
    update: { ownerId: areaOwnerPress.id },
    create: {
      plantId: plant.id,
      code: "PRESS_SHOP",
      name: "Heavy Stamping & Press Shop",
      ownerId: areaOwnerPress.id,
    },
  });

  const paintArea = await prisma.area.upsert({
    where: {
      plantId_code: {
        plantId: plant.id,
        code: "PAINT_SHOP",
      },
    },
    update: { ownerId: areaOwnerPaint.id },
    create: {
      plantId: plant.id,
      code: "PAINT_SHOP",
      name: "Automated Robotic Paint Facility",
      ownerId: areaOwnerPaint.id,
    },
  });

  // 4. Equipment
  const pressEquipment = await prisma.equipment.upsert({
    where: { tagNumber: "EQ-PRS-4001" },
    update: { areaId: pressArea.id },
    create: {
      tagNumber: "EQ-PRS-4001",
      name: "4000-Ton Hydraulic Transfer Press #1",
      areaId: pressArea.id,
      criticality: "CRITICAL",
    },
  });

  const paintEquipment = await prisma.equipment.upsert({
    where: { tagNumber: "EQ-PNT-BOOTH1" },
    update: { areaId: paintArea.id },
    create: {
      tagNumber: "EQ-PNT-BOOTH1",
      name: "Robotic Spray Coating Booth Alpha",
      areaId: paintArea.id,
      criticality: "HIGH",
    },
  });

  console.log("✅ Seed completed successfully!");
  console.log(`Users seeded: Admin (${admin.email}), AO Press (${areaOwnerPress.email}), AO Paint (${areaOwnerPaint.email}), Safety (${safetyOfficer.email}), Requester (${requester.email}), Inactive (${deactivatedUser.email})`);
  console.log(`Plant: ${plant.name}, Equipment: ${pressEquipment.tagNumber}, ${paintEquipment.tagNumber}`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
