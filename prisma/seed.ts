import { PrismaClient, Role, Prisma } from "@prisma/client";
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
  // 5. PERMITS (10 total: 8 DRAFT, 2 PENDING_APPROVAL, all 4 types)
  // ---------------------------------------------------------------
  // Check if permits are already seeded
  const existingPermitCount = await prisma.permit.count();
  if (existingPermitCount >= 10) {
    console.log(`Permits already seeded (${existingPermitCount} permits found), skipping permit creation.`);
  } else {
    const now = new Date();
    const oneHour = 60 * 60 * 1000;
    let permitSeq = 1;

  type PermitSeedData = {
    type: "HOT_WORK" | "CONFINED_SPACE_ENTRY" | "WORKING_AT_HEIGHT" | "ELECTRICAL_ISOLATION_LOTO";
    equipmentId: string;
    contractorTeam: string;
    workDescription: string;
    plannedStartTime: Date;
    plannedEndTime: Date;
    hazards: string[];
    ppeRequired: string[];
    precautionsChecklist: Record<string, boolean>;
    typeData: Record<string, unknown>;
    status?: "DRAFT" | "PENDING_APPROVAL";
  };

  const getSeedPermitConfig = (
    type: PermitSeedData["type"],
    idx: number,
    equipmentId: string,
    status: "DRAFT" | "PENDING_APPROVAL" = "DRAFT"
  ): PermitSeedData => {
    const plannedStartTime = new Date(now.getTime() + (idx + 1) * 2 * oneHour);
    const plannedEndTime = new Date(plannedStartTime.getTime() + 4 * oneHour);

    switch (type) {
      case "HOT_WORK":
        return {
          type,
          equipmentId,
          contractorTeam: "Industrial Welding Solutions Ltd",
          workDescription: `Steam pipeline flange fabrication & TIG welding task #${idx + 1}`,
          plannedStartTime,
          plannedEndTime,
          hazards: ["HOT_SURFACES", "SPARKS", "FLAMMABLE_VAPOURS"],
          ppeRequired: ["HELMET", "SAFETY_SHOES", "WELDING_GLOVES", "EYE_PROTECTION"],
          precautionsChecklist: {
            fire_watch: true,
            combustibles_cleared: true,
            floor_covered: true,
            gas_tested: true,
            ventilation_adequate: true,
          },
          typeData: {
            hotWorkType: "WELDING",
            fireWatchName: "Vikram Rathore",
            fireExtinguisherType: "CO2 4.5kg",
            combustiblesClearedRadiusMetres: 10,
            gasTestLelPercent: 0,
            gasTestO2Percent: 20.9,
            gasTestTime: new Date().toISOString(),
            gasTesterName: "S. Swaminathan",
          },
          status,
        };
      case "CONFINED_SPACE_ENTRY":
        return {
          type,
          equipmentId,
          contractorTeam: "Apex Vessel Inspection Services",
          workDescription: `Internal ultrasonic thickness measurement & descaling task #${idx + 1}`,
          plannedStartTime,
          plannedEndTime,
          hazards: ["OXYGEN_DEFICIENCY", "TOXIC_GAS", "CONFINED_SPACE"],
          ppeRequired: ["HELMET", "SAFETY_SHOES", "ESCAPE_BA", "MULTI_GAS_DETECTOR"],
          precautionsChecklist: {
            lines_isolated: true,
            atmospheric_tested: true,
            ventilation_active: true,
            standby_present: true,
            rescue_ready: true,
          },
          typeData: {
            spaceId: "TK-UTL-BOIL-DEAR-01",
            entryPoint: "Top Manway MW-01",
            standbyAttendantName: "Ramesh Pawar",
            rescuePlanDescription: "Tripod with retrieval winch and harness anchored outside manway",
            ventilationMethod: "FORCED_MECHANICAL",
            gasTestO2Percent: 20.9,
            gasTestLelPercent: 0,
            gasTestH2sPpm: 0,
            gasTestCoPpm: 0,
            gasTestTime: new Date().toISOString(),
            gasTesterName: "S. Swaminathan",
            communicationMethod: "Two-way intrinsically safe radio and life-line signals",
          },
          status,
        };
      case "WORKING_AT_HEIGHT":
        return {
          type,
          equipmentId,
          contractorTeam: "HighRise Industrial Riggers",
          workDescription: `Structural overhead crane rail alignment & inspection task #${idx + 1}`,
          plannedStartTime,
          plannedEndTime,
          hazards: ["FALL_FROM_HEIGHT", "FALLING_OBJECTS", "SUSPENSION_TRAUMA"],
          ppeRequired: ["HELMET", "SAFETY_SHOES", "FULL_BODY_HARNESS", "CHIN_STRAP"],
          precautionsChecklist: {
            harness_inspected: true,
            certified_anchor: true,
            barricade_warning: true,
            tools_tethered: true,
          },
          typeData: {
            heightMetres: 8.5,
            accessMethod: "MEWP",
            fallArrestEquipment: "Full body harness with twin shock-absorbing lanyards",
            anchorPointChecked: true,
            barricadingBelow: true,
            rescuePlanAtHeight: "MEWP manual descent valve and suspension trauma straps ready",
            weatherCheckConfirmed: true,
          },
          status,
        };
      case "ELECTRICAL_ISOLATION_LOTO":
        return {
          type,
          equipmentId,
          contractorTeam: "ElectraCare High Voltage Ltd",
          workDescription: `Motor feeder breaker servicing & primary contact overhaul task #${idx + 1}`,
          plannedStartTime,
          plannedEndTime,
          hazards: ["ELECTROCUTION", "ARC_FLASH", "STORED_ENERGY"],
          ppeRequired: ["HELMET", "SAFETY_SHOES", "ARC_FLASH_SHIELD", "INSULATED_GLOVES"],
          precautionsChecklist: {
            isolation_points_locked: true,
            tags_posted: true,
            zero_energy_test: true,
            stored_energy_dissipated: true,
          },
          typeData: {
            equipmentTag: "MCC-02-FEEDER-04",
            voltageLevel: "415V",
            isolationPointsList: ["MCC-02 Incomer 4B Breaker Racked Out"],
            lockNumbers: ["LOTO-RED-1042"],
            tagNumbers: ["TAG-ELEC-4091"],
            earthingApplied: true,
            testedDeadBy: "Dinesh Kumar (Certified Electrician)",
            testInstrumentUsed: "Fluke 87V Calibrated Multimeter (Cal Due: Nov 2026)",
            zeroEnergyVerified: true,
          },
          status,
        };
    }
  };

  async function createSeededPermit(config: PermitSeedData) {
    const currentSeq = permitSeq++;
    const permitNumber = `PTW-2026-${String(currentSeq).padStart(4, "0")}`;
    const expiresAt = config.plannedEndTime;

    // 1. Create permit with initial DRAFT_CREATED audit log
    const created = await prisma.permit.create({
      data: {
        permitSequence: currentSeq,
        permitNumber,
        status: config.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "DRAFT",
        type: config.type,
        requesterId: requester.id,
        contractorTeam: config.contractorTeam,
        workDescription: config.workDescription,
        equipmentId: config.equipmentId,
        plannedStartTime: config.plannedStartTime,
        plannedEndTime: config.plannedEndTime,
        expiresAt,
        hazards: config.hazards as Prisma.InputJsonValue,
        ppeRequired: config.ppeRequired as Prisma.InputJsonValue,
        precautionsChecklist: config.precautionsChecklist as Prisma.InputJsonValue,
        typeData: config.typeData as Prisma.InputJsonValue,
        auditLogs: {
          create: {
            actorId: requester.id,
            actorLabel: requester.name,
            actorRole: requester.role,
            action: "DRAFT_CREATED",
            fromValue: null,
            toValue: "DRAFT",
            comment: `Draft permit created by ${requester.name}`,
          },
        },
      },
    });

    // 2. If PENDING_APPROVAL, record SUBMIT audit log transactionally
    if (config.status === "PENDING_APPROVAL") {
      await prisma.auditLog.create({
        data: {
          permitId: created.id,
          actorId: requester.id,
          actorLabel: requester.name,
          actorRole: requester.role,
          action: "SUBMIT",
          fromValue: "DRAFT",
          toValue: "PENDING_APPROVAL",
          comment: "Permit submitted for approval",
        },
      });
    }

    return created;
  }

  // 8 DRAFT permits (2 of each assignment-required type)
  const draftSpecs: Array<{ type: PermitSeedData["type"]; equipmentId: string }> = [
    { type: "HOT_WORK", equipmentId: pressEquipment1.id },
    { type: "HOT_WORK", equipmentId: boilerEquipment.id },
    { type: "CONFINED_SPACE_ENTRY", equipmentId: boilerEquipment.id },
    { type: "CONFINED_SPACE_ENTRY", equipmentId: paintEquipment.id },
    { type: "WORKING_AT_HEIGHT", equipmentId: assemblyRobotChn.id },
    { type: "WORKING_AT_HEIGHT", equipmentId: conveyorChn.id },
    { type: "ELECTRICAL_ISOLATION_LOTO", equipmentId: pressEquipment2.id },
    { type: "ELECTRICAL_ISOLATION_LOTO", equipmentId: assemblyRobotChn.id },
  ];

  for (let i = 0; i < draftSpecs.length; i++) {
    await createSeededPermit(
      getSeedPermitConfig(draftSpecs[i].type, i, draftSpecs[i].equipmentId, "DRAFT")
    );
  }

  // 2 PENDING_APPROVAL permits (1 HOT_WORK, 1 WORKING_AT_HEIGHT)
  await createSeededPermit(
    getSeedPermitConfig("HOT_WORK", 8, pressEquipment2.id, "PENDING_APPROVAL")
  );
  await createSeededPermit(
    getSeedPermitConfig("WORKING_AT_HEIGHT", 9, conveyorChn.id, "PENDING_APPROVAL")
  );
  }


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
