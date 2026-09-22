import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Opmaint PTW database...");

  const defaultPasswordHash = await bcrypt.hash("password123", 10);

  // ---------------------------------------------------------------
  // 1. USERS
  // ---------------------------------------------------------------
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

  // Second area owner for Plant 2 / utilities
  const areaOwnerUtils = await prisma.user.upsert({
    where: { email: "ao.utils@opmaint.local" },
    update: { isActive: true },
    create: {
      email: "ao.utils@opmaint.local",
      name: "Arjun Nair (Utilities Area Owner)",
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

  // ---------------------------------------------------------------
  // 2. PLANTS  (2 plants)
  // ---------------------------------------------------------------
  const plantPune = await prisma.plant.upsert({
    where: { code: "PUNE-PLANT-01" },
    update: {},
    create: {
      code: "PUNE-PLANT-01",
      name: "Pune Automotive Manufacturing Facility",
      timezone: "Asia/Kolkata",
    },
  });

  const plantChennai = await prisma.plant.upsert({
    where: { code: "CHN-PLANT-01" },
    update: {},
    create: {
      code: "CHN-PLANT-01",
      name: "Chennai Component Assembly Plant",
      timezone: "Asia/Kolkata",
    },
  });

  // ---------------------------------------------------------------
  // 3. AREAS  (5 areas: 3 in Pune, 2 in Chennai)
  // ---------------------------------------------------------------
  const pressArea = await prisma.area.upsert({
    where: { plantId_code: { plantId: plantPune.id, code: "PRESS_SHOP" } },
    update: { ownerId: areaOwnerPress.id },
    create: {
      plantId: plantPune.id,
      code: "PRESS_SHOP",
      name: "Heavy Stamping & Press Shop",
      ownerId: areaOwnerPress.id,
    },
  });

  const paintArea = await prisma.area.upsert({
    where: { plantId_code: { plantId: plantPune.id, code: "PAINT_SHOP" } },
    update: { ownerId: areaOwnerPaint.id },
    create: {
      plantId: plantPune.id,
      code: "PAINT_SHOP",
      name: "Automated Robotic Paint Facility",
      ownerId: areaOwnerPaint.id,
    },
  });

  const utilityAreaPune = await prisma.area.upsert({
    where: { plantId_code: { plantId: plantPune.id, code: "UTILITY_YARD" } },
    update: { ownerId: areaOwnerUtils.id },
    create: {
      plantId: plantPune.id,
      code: "UTILITY_YARD",
      name: "Central Utility & Boiler House",
      ownerId: areaOwnerUtils.id,
    },
  });

  const assemblyAreaChn = await prisma.area.upsert({
    where: { plantId_code: { plantId: plantChennai.id, code: "ASSEMBLY_LINE" } },
    update: { ownerId: areaOwnerPress.id },
    create: {
      plantId: plantChennai.id,
      code: "ASSEMBLY_LINE",
      name: "Final Assembly Line",
      ownerId: areaOwnerPress.id,
    },
  });

  const warehouseAreaChn = await prisma.area.upsert({
    where: { plantId_code: { plantId: plantChennai.id, code: "WAREHOUSE" } },
    update: { ownerId: areaOwnerPaint.id },
    create: {
      plantId: plantChennai.id,
      code: "WAREHOUSE",
      name: "Finished Goods Warehouse",
      ownerId: areaOwnerPaint.id,
    },
  });

  // ---------------------------------------------------------------
  // 4. EQUIPMENT  (6 items across areas)
  // ---------------------------------------------------------------
  const pressEquipment1 = await prisma.equipment.upsert({
    where: { tagNumber: "EQ-PRS-4001" },
    update: { areaId: pressArea.id },
    create: {
      tagNumber: "EQ-PRS-4001",
      name: "4000-Ton Hydraulic Transfer Press #1",
      areaId: pressArea.id,
      criticality: "CRITICAL",
    },
  });

  const pressEquipment2 = await prisma.equipment.upsert({
    where: { tagNumber: "EQ-PRS-2500" },
    update: { areaId: pressArea.id },
    create: {
      tagNumber: "EQ-PRS-2500",
      name: "2500-Ton Progressive Die Press #2",
      areaId: pressArea.id,
      criticality: "HIGH",
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

  const boilerEquipment = await prisma.equipment.upsert({
    where: { tagNumber: "EQ-UTL-BOIL1" },
    update: { areaId: utilityAreaPune.id },
    create: {
      tagNumber: "EQ-UTL-BOIL1",
      name: "High-Pressure Steam Boiler Unit 1",
      areaId: utilityAreaPune.id,
      criticality: "CRITICAL",
    },
  });

  const assemblyRobotChn = await prisma.equipment.upsert({
    where: { tagNumber: "EQ-ASM-ROB01" },
    update: { areaId: assemblyAreaChn.id },
    create: {
      tagNumber: "EQ-ASM-ROB01",
      name: "Welding Robot Arm — Station A",
      areaId: assemblyAreaChn.id,
      criticality: "HIGH",
    },
  });

  const conveyorChn = await prisma.equipment.upsert({
    where: { tagNumber: "EQ-WH-CONV01" },
    update: { areaId: warehouseAreaChn.id },
    create: {
      tagNumber: "EQ-WH-CONV01",
      name: "Automated Pallet Conveyor System",
      areaId: warehouseAreaChn.id,
      criticality: "MEDIUM",
    },
  });

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log("✅ Seed completed successfully!");
  console.log(
    `Users: Admin (${admin.email}), AO Press (${areaOwnerPress.email}), AO Paint (${areaOwnerPaint.email}), AO Utils (${areaOwnerUtils.email}), Safety (${safetyOfficer.email}), Requester (${requester.email}), Inactive (${deactivatedUser.email})`
  );
  console.log(
    `Plants: ${plantPune.name} [${plantPune.code}], ${plantChennai.name} [${plantChennai.code}]`
  );
  console.log(
    `Areas (5): ${[pressArea, paintArea, utilityAreaPune, assemblyAreaChn, warehouseAreaChn].map((a) => a.code).join(", ")}`
  );
  console.log(
    `Equipment (6): ${[pressEquipment1, pressEquipment2, paintEquipment, boilerEquipment, assemblyRobotChn, conveyorChn].map((e) => e.tagNumber).join(", ")}`
  );
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
