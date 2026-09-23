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
    update: { name: "Rajesh Kumar (Plant Head / Admin)", isActive: true },
    create: {
      email: "admin@opmaint.local",
      name: "Rajesh Kumar (Plant Head / Admin)",
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  const areaOwnerPress = await prisma.user.upsert({
    where: { email: "ao.press@opmaint.local" },
    update: { name: "Vikram Mehta (Press Shop Owner)", isActive: true },
    create: {
      email: "ao.press@opmaint.local",
      name: "Vikram Mehta (Press Shop Owner)",
      passwordHash: defaultPasswordHash,
      role: Role.AREA_OWNER,
      isActive: true,
    },
  });

  const areaOwnerPaint = await prisma.user.upsert({
    where: { email: "ao.paint@opmaint.local" },
    update: { name: "Pooja Sharma (Paint Shop Owner)", isActive: true },
    create: {
      email: "ao.paint@opmaint.local",
      name: "Pooja Sharma (Paint Shop Owner)",
      passwordHash: defaultPasswordHash,
      role: Role.AREA_OWNER,
      isActive: true,
    },
  });

  const areaOwnerUtils = await prisma.user.upsert({
    where: { email: "ao.utils@opmaint.local" },
    update: { name: "Arjun Nair (Utilities Area Owner)", isActive: true },
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
    update: { name: "Priya Sharma (Chief Safety Officer)", isActive: true },
    create: {
      email: "safety.officer@opmaint.local",
      name: "Priya Sharma (Chief Safety Officer)",
      passwordHash: defaultPasswordHash,
      role: Role.SAFETY_OFFICER,
      isActive: true,
    },
  });

  const requester = await prisma.user.upsert({
    where: { email: "requester@opmaint.local" },
    update: { name: "Sunil Verma (Maintenance Lead / Requester)", isActive: true },
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
  // 5. PERMITS (Clean seed with 12 distinct lifecycle states)
  // ---------------------------------------------------------------
  const existingCount = await prisma.permit.count();
  if (existingCount > 0) {
    console.log(`Clearing ${existingCount} existing permits for clean seed...`);
    // PostgreSQL TRUNCATE bypasses row-level DELETE triggers on AuditLog
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "AuditLog", "Approval", "WorkLog", "EntryExitLog", "PermitExtension", "Permit" CASCADE`
    );
  }

  const now = new Date();
  const m = (minutes: number) => minutes * 60 * 1000;
  const h = (hours: number) => hours * 60 * 60 * 1000;

  // Reusable JSON payloads
  const hotWorkData = {
    hotWorkType: "WELDING",
    fireWatchName: "Vikram Rathore",
    fireExtinguisherType: "CO2 4.5kg",
    combustiblesClearedRadiusMetres: 10,
    gasTestLelPercent: 0,
    gasTestO2Percent: 20.9,
    gasTestTime: now.toISOString(),
    gasTesterName: "S. Swaminathan",
  };

  const confinedSpaceData = {
    spaceId: "TK-UTL-BOIL-DEAR-01",
    entryPoint: "Top Manway MW-01",
    standbyAttendantName: "Ramesh Pawar",
    rescuePlanDescription: "Tripod with retrieval winch and harness anchored outside manway",
    ventilationMethod: "FORCED_MECHANICAL",
    gasTestO2Percent: 20.9,
    gasTestLelPercent: 0,
    gasTestH2sPpm: 0,
    gasTestCoPpm: 0,
    gasTestTime: now.toISOString(),
    gasTesterName: "S. Swaminathan",
    communicationMethod: "Two-way intrinsically safe radio and life-line signals",
  };

  const workingAtHeightData = {
    heightMetres: 8.5,
    accessMethod: "MEWP",
    fallArrestEquipment: "Full body harness with twin shock-absorbing lanyards",
    anchorPointChecked: true,
    barricadingBelow: true,
    rescuePlanAtHeight: "MEWP manual descent valve and suspension trauma straps ready",
    weatherCheckConfirmed: true,
  };

  const lotoData = {
    equipmentTag: "MCC-02-FEEDER-04",
    voltageLevel: "415V",
    isolationPointsList: ["MCC-02 Incomer 4B Breaker Racked Out"],
    lockNumbers: ["LOTO-RED-1042"],
    tagNumbers: ["TAG-ELEC-4091"],
    earthingApplied: true,
    testedDeadBy: "Dinesh Kumar (Certified Electrician)",
    testInstrumentUsed: "Fluke 87V Calibrated Multimeter (Cal Due: Nov 2026)",
    zeroEnergyVerified: true,
  };

  const hotWorkHazards = ["HOT_SURFACES", "SPARKS", "FLAMMABLE_VAPOURS"];
  const csHazards = ["OXYGEN_DEFICIENCY", "TOXIC_GAS", "CONFINED_SPACE"];
  const heightHazards = ["FALL_FROM_HEIGHT", "FALLING_OBJECTS", "SUSPENSION_TRAUMA"];
  const lotoHazards = ["ELECTROCUTION", "ARC_FLASH", "STORED_ENERGY"];

  const ppeStandard = ["HELMET", "SAFETY_SHOES", "EYE_PROTECTION"];

  let seq = 1;

  // 1. DRAFT permit
  const p1 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "DRAFT",
      type: "HOT_WORK",
      requesterId: requester.id,
      contractorTeam: "Industrial Welding Solutions Ltd",
      workDescription: "Draft: Steam pipeline flange fabrication & TIG welding",
      equipmentId: pressEquipment1.id,
      plannedStartTime: new Date(now.getTime() + h(4)),
      plannedEndTime: new Date(now.getTime() + h(8)),
      expiresAt: new Date(now.getTime() + h(8)),
      hazards: hotWorkHazards,
      ppeRequired: [...ppeStandard, "WELDING_GLOVES"],
      precautionsChecklist: { fire_watch: true, combustibles_cleared: true, ventilation_adequate: true },
      typeData: hotWorkData,
      auditLogs: {
        create: {
          actorId: requester.id,
          actorLabel: requester.name,
          actorRole: requester.role,
          action: "DRAFT_CREATED",
          toValue: "DRAFT",
          comment: "Initial draft permit created by maintenance lead",
          createdAt: new Date(now.getTime() - h(1)),
        },
      },
    },
  });

  // 2. PENDING_APPROVAL permit
  const p2 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "PENDING_APPROVAL",
      type: "CONFINED_SPACE_ENTRY",
      requesterId: requester.id,
      contractorTeam: "Apex Vessel Inspection Services",
      workDescription: "Pending Approval: Internal ultrasonic thickness measurement & descaling",
      equipmentId: boilerEquipment.id,
      plannedStartTime: new Date(now.getTime() + h(2)),
      plannedEndTime: new Date(now.getTime() + h(6)),
      expiresAt: new Date(now.getTime() + h(6)),
      hazards: csHazards,
      ppeRequired: [...ppeStandard, "ESCAPE_BA", "MULTI_GAS_DETECTOR"],
      precautionsChecklist: { atmospheric_tested: true, ventilation_active: true, standby_present: true },
      typeData: confinedSpaceData,
      auditLogs: {
        createMany: {
          data: [
            {
              actorId: requester.id,
              actorLabel: requester.name,
              actorRole: requester.role,
              action: "DRAFT_CREATED",
              toValue: "DRAFT",
              comment: "Permit drafted",
              createdAt: new Date(now.getTime() - h(2)),
            },
            {
              actorId: requester.id,
              actorLabel: requester.name,
              actorRole: requester.role,
              action: "SUBMIT",
              fromValue: "DRAFT",
              toValue: "PENDING_APPROVAL",
              comment: "Submitted for approval to Area Owner & Safety Officer",
              createdAt: new Date(now.getTime() - h(1)),
            },
          ],
        },
      },
    },
  });

  // 3. APPROVED permit (both slots approved, ready to activate)
  const p3 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "APPROVED",
      type: "WORKING_AT_HEIGHT",
      requesterId: requester.id,
      contractorTeam: "HighRise Industrial Riggers",
      workDescription: "Approved: Structural overhead crane rail alignment & torque inspection",
      equipmentId: assemblyRobotChn.id,
      plannedStartTime: new Date(now.getTime() + h(1)),
      plannedEndTime: new Date(now.getTime() + h(5)),
      expiresAt: new Date(now.getTime() + h(5)),
      hazards: heightHazards,
      ppeRequired: [...ppeStandard, "FULL_BODY_HARNESS", "CHIN_STRAP"],
      precautionsChecklist: { harness_inspected: true, certified_anchor: true, barricade_warning: true },
      typeData: workingAtHeightData,
      approvals: {
        createMany: {
          data: [
            { round: 1, slot: "AREA_OWNER", approverId: areaOwnerPress.id, decision: "APPROVED", comment: "Press & assembly area boundary secured." },
            { round: 1, slot: "SAFETY_OFFICER", approverId: safetyOfficer.id, decision: "APPROVED", comment: "MEWP inspection certificate validated." },
          ],
        },
      },
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(3)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "SUBMIT", fromValue: "DRAFT", toValue: "PENDING_APPROVAL", createdAt: new Date(now.getTime() - h(2)) },
            { actorId: areaOwnerPress.id, actorLabel: areaOwnerPress.name, actorRole: areaOwnerPress.role, action: "APPROVE", comment: "Area Owner slot approved", createdAt: new Date(now.getTime() - m(90)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "APPROVE", fromValue: "PENDING_APPROVAL", toValue: "APPROVED", comment: "Safety Officer approved; all slots satisfied.", createdAt: new Date(now.getTime() - m(60)) },
          ],
        },
      },
    },
  });

  // 4. ACTIVE permit (standard operational)
  const p4 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "ACTIVE",
      type: "ELECTRICAL_ISOLATION_LOTO",
      requesterId: requester.id,
      contractorTeam: "ElectraCare High Voltage Ltd",
      workDescription: "Active: Motor feeder breaker servicing & primary contact overhaul",
      equipmentId: pressEquipment2.id,
      plannedStartTime: new Date(now.getTime() - h(2)),
      plannedEndTime: new Date(now.getTime() + h(6)),
      expiresAt: new Date(now.getTime() + h(6)),
      actualStartTime: new Date(now.getTime() - h(2)),
      activatedById: safetyOfficer.id,
      hazards: lotoHazards,
      ppeRequired: [...ppeStandard, "ARC_FLASH_SHIELD", "INSULATED_GLOVES"],
      precautionsChecklist: { isolation_points_locked: true, tags_posted: true, zero_energy_test: true },
      typeData: lotoData,
      approvals: {
        createMany: {
          data: [
            { round: 1, slot: "AREA_OWNER", approverId: areaOwnerPress.id, decision: "APPROVED" },
            { round: 1, slot: "SAFETY_OFFICER", approverId: safetyOfficer.id, decision: "APPROVED" },
          ],
        },
      },
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(4)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "SUBMIT", fromValue: "DRAFT", toValue: "PENDING_APPROVAL", createdAt: new Date(now.getTime() - h(3)) },
            { actorId: areaOwnerPress.id, actorLabel: areaOwnerPress.name, actorRole: areaOwnerPress.role, action: "APPROVE", createdAt: new Date(now.getTime() - h(2) - m(30)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "APPROVE", fromValue: "PENDING_APPROVAL", toValue: "APPROVED", createdAt: new Date(now.getTime() - h(2) - m(15)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "ACTIVATE", fromValue: "APPROVED", toValue: "ACTIVE", comment: "Zero-energy verified on-site by Safety Officer.", createdAt: new Date(now.getTime() - h(2)) },
          ],
        },
      },
    },
  });

  // 5. ACTIVE permit expiring within ~2 hours (expires in 75 minutes)
  const p5 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "ACTIVE",
      type: "HOT_WORK",
      requesterId: requester.id,
      contractorTeam: "Industrial Welding Solutions Ltd",
      workDescription: "Active (Expiring Soon): Frame crack repair on transfer press #1",
      equipmentId: pressEquipment1.id,
      plannedStartTime: new Date(now.getTime() - h(3)),
      plannedEndTime: new Date(now.getTime() + m(75)), // ~75 mins from now
      expiresAt: new Date(now.getTime() + m(75)),
      actualStartTime: new Date(now.getTime() - h(3)),
      activatedById: safetyOfficer.id,
      hazards: hotWorkHazards,
      ppeRequired: [...ppeStandard, "WELDING_GLOVES", "EYE_PROTECTION"],
      precautionsChecklist: { fire_watch: true, combustibles_cleared: true, floor_covered: true },
      typeData: hotWorkData,
      approvals: {
        createMany: {
          data: [
            { round: 1, slot: "AREA_OWNER", approverId: areaOwnerPress.id, decision: "APPROVED" },
            { round: 1, slot: "SAFETY_OFFICER", approverId: safetyOfficer.id, decision: "APPROVED" },
          ],
        },
      },
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(4)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "SUBMIT", fromValue: "DRAFT", toValue: "PENDING_APPROVAL", createdAt: new Date(now.getTime() - h(3) - m(30)) },
            { actorId: areaOwnerPress.id, actorLabel: areaOwnerPress.name, actorRole: areaOwnerPress.role, action: "APPROVE", createdAt: new Date(now.getTime() - h(3) - m(15)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "APPROVE", fromValue: "PENDING_APPROVAL", toValue: "APPROVED", createdAt: new Date(now.getTime() - h(3) - m(5)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "ACTIVATE", fromValue: "APPROVED", toValue: "ACTIVE", comment: "Hot work permit activated with active fire watch.", createdAt: new Date(now.getTime() - h(3)) },
          ],
        },
      },
    },
  });

  // 6. ACTIVE with work logs & confined space entry/exit logs
  const p6 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "ACTIVE",
      type: "CONFINED_SPACE_ENTRY",
      requesterId: requester.id,
      contractorTeam: "Apex Vessel Inspection Services",
      workDescription: "Active (With Work Logs): Deaerator tank internal sediment descaling",
      equipmentId: boilerEquipment.id,
      plannedStartTime: new Date(now.getTime() - h(4)),
      plannedEndTime: new Date(now.getTime() + h(4)),
      expiresAt: new Date(now.getTime() + h(4)),
      actualStartTime: new Date(now.getTime() - h(4)),
      activatedById: safetyOfficer.id,
      hazards: csHazards,
      ppeRequired: [...ppeStandard, "ESCAPE_BA", "MULTI_GAS_DETECTOR"],
      precautionsChecklist: { atmospheric_tested: true, ventilation_active: true, standby_present: true },
      typeData: confinedSpaceData,
      approvals: {
        createMany: {
          data: [
            { round: 1, slot: "AREA_OWNER", approverId: areaOwnerUtils.id, decision: "APPROVED" },
            { round: 1, slot: "SAFETY_OFFICER", approverId: safetyOfficer.id, decision: "APPROVED" },
          ],
        },
      },
      workLogs: {
        createMany: {
          data: [
            { authorId: requester.id, description: "Completed pre-entry gas test calibration and atmospheric clearance.", createdAt: new Date(now.getTime() - h(3)) },
            { authorId: requester.id, description: "Internal inspection of steam drum completed; minor scale buildup descaled.", createdAt: new Date(now.getTime() - h(1)) },
          ],
        },
      },
      entryExitLogs: {
        createMany: {
          data: [
            { direction: "ENTRY", personName: "Ramesh Pawar", recordedById: safetyOfficer.id, at: new Date(now.getTime() - h(2)) },
            { direction: "ENTRY", personName: "Suresh Kumar", recordedById: safetyOfficer.id, at: new Date(now.getTime() - h(2)) },
            { direction: "EXIT", personName: "Suresh Kumar", recordedById: safetyOfficer.id, at: new Date(now.getTime() - m(30)) },
          ],
        },
      },
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(5)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "SUBMIT", fromValue: "DRAFT", toValue: "PENDING_APPROVAL", createdAt: new Date(now.getTime() - h(4) - m(30)) },
            { actorId: areaOwnerUtils.id, actorLabel: areaOwnerUtils.name, actorRole: areaOwnerUtils.role, action: "APPROVE", createdAt: new Date(now.getTime() - h(4) - m(15)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "APPROVE", fromValue: "PENDING_APPROVAL", toValue: "APPROVED", createdAt: new Date(now.getTime() - h(4) - m(5)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "ACTIVATE", fromValue: "APPROVED", toValue: "ACTIVE", comment: "Confined space entry authorized.", createdAt: new Date(now.getTime() - h(4)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "WORK_LOG_ADDED", comment: "Completed pre-entry gas test calibration and atmospheric clearance.", createdAt: new Date(now.getTime() - h(3)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "WORK_LOG_ADDED", comment: "Internal inspection of steam drum completed; minor scale buildup descaled.", createdAt: new Date(now.getTime() - h(1)) },
          ],
        },
      },
    },
  });

  // 7. SUSPENDED permit
  const p7 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "SUSPENDED",
      type: "HOT_WORK",
      requesterId: requester.id,
      contractorTeam: "Industrial Welding Solutions Ltd",
      workDescription: "Suspended: Duct modification in paint shop auxiliary area",
      equipmentId: paintEquipment.id,
      plannedStartTime: new Date(now.getTime() - h(5)),
      plannedEndTime: new Date(now.getTime() + h(3)),
      expiresAt: new Date(now.getTime() + h(3)),
      actualStartTime: new Date(now.getTime() - h(5)),
      activatedById: safetyOfficer.id,
      suspendedById: safetyOfficer.id,
      suspensionReason: "Elevated solvent fumes detected in adjacent booth zone B. Work halted pending ventilation check.",
      hazards: hotWorkHazards,
      ppeRequired: [...ppeStandard, "WELDING_GLOVES", "RESPIRATOR"],
      precautionsChecklist: { fire_watch: true, combustibles_cleared: true, ventilation_adequate: true },
      typeData: hotWorkData,
      approvals: {
        createMany: {
          data: [
            { round: 1, slot: "AREA_OWNER", approverId: areaOwnerPaint.id, decision: "APPROVED" },
            { round: 1, slot: "SAFETY_OFFICER", approverId: safetyOfficer.id, decision: "APPROVED" },
          ],
        },
      },
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(6)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "SUBMIT", fromValue: "DRAFT", toValue: "PENDING_APPROVAL", createdAt: new Date(now.getTime() - h(5) - m(30)) },
            { actorId: areaOwnerPaint.id, actorLabel: areaOwnerPaint.name, actorRole: areaOwnerPaint.role, action: "APPROVE", createdAt: new Date(now.getTime() - h(5) - m(15)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "APPROVE", fromValue: "PENDING_APPROVAL", toValue: "APPROVED", createdAt: new Date(now.getTime() - h(5) - m(5)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "ACTIVATE", fromValue: "APPROVED", toValue: "ACTIVE", createdAt: new Date(now.getTime() - h(5)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "SUSPEND", fromValue: "ACTIVE", toValue: "SUSPENDED", comment: "Elevated solvent fumes detected in adjacent booth zone B. Work halted pending ventilation check.", createdAt: new Date(now.getTime() - h(2)) },
          ],
        },
      },
    },
  });

  // 8. CLOSED permit (work completed by requester)
  const p8 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "CLOSED",
      type: "ELECTRICAL_ISOLATION_LOTO",
      requesterId: requester.id,
      contractorTeam: "ElectraCare High Voltage Ltd",
      workDescription: "Closed: Main breaker contact overhaul and busbar torque verification",
      equipmentId: pressEquipment1.id,
      plannedStartTime: new Date(now.getTime() - h(8)),
      plannedEndTime: new Date(now.getTime() + h(2)),
      expiresAt: new Date(now.getTime() + h(2)),
      actualStartTime: new Date(now.getTime() - h(8)),
      actualEndTime: new Date(now.getTime() - h(1)),
      activatedById: safetyOfficer.id,
      closedById: requester.id,
      workCompletionNotes: "Main breaker contacts polished and thermal imaging scan passed normal baseline. Grounding tags removed and equipment returned to service.",
      hazards: lotoHazards,
      ppeRequired: [...ppeStandard, "ARC_FLASH_SHIELD", "INSULATED_GLOVES"],
      precautionsChecklist: { isolation_points_locked: true, tags_posted: true, zero_energy_test: true },
      typeData: lotoData,
      approvals: {
        createMany: {
          data: [
            { round: 1, slot: "AREA_OWNER", approverId: areaOwnerPress.id, decision: "APPROVED" },
            { round: 1, slot: "SAFETY_OFFICER", approverId: safetyOfficer.id, decision: "APPROVED" },
          ],
        },
      },
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(9)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "SUBMIT", fromValue: "DRAFT", toValue: "PENDING_APPROVAL", createdAt: new Date(now.getTime() - h(8) - m(30)) },
            { actorId: areaOwnerPress.id, actorLabel: areaOwnerPress.name, actorRole: areaOwnerPress.role, action: "APPROVE", createdAt: new Date(now.getTime() - h(8) - m(15)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "APPROVE", fromValue: "PENDING_APPROVAL", toValue: "APPROVED", createdAt: new Date(now.getTime() - h(8) - m(5)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "ACTIVATE", fromValue: "APPROVED", toValue: "ACTIVE", createdAt: new Date(now.getTime() - h(8)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "CLOSE", fromValue: "ACTIVE", toValue: "CLOSED", comment: "Main breaker contacts polished and thermal imaging scan passed normal baseline.", createdAt: new Date(now.getTime() - h(1)) },
          ],
        },
      },
    },
  });

  // 9. CLOSED_VERIFIED permit (Safety Officer verified closure)
  const p9 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "CLOSED_VERIFIED",
      type: "WORKING_AT_HEIGHT",
      requesterId: requester.id,
      contractorTeam: "HighRise Industrial Riggers",
      workDescription: "Closed & Verified: Warehouse high-bay conveyor sensor replacement",
      equipmentId: conveyorChn.id,
      plannedStartTime: new Date(now.getTime() - h(10)),
      plannedEndTime: new Date(now.getTime() - h(2)),
      expiresAt: new Date(now.getTime() - h(2)),
      actualStartTime: new Date(now.getTime() - h(10)),
      actualEndTime: new Date(now.getTime() - h(3)),
      activatedById: safetyOfficer.id,
      closedById: requester.id,
      workCompletionNotes: "All ceiling sensor brackets torqued and scaffolding dismantled.",
      closureVerifiedNotes: "Site inspection completed. Housekeeping verified, safety nets removed, all riggers signed off.",
      hazards: heightHazards,
      ppeRequired: [...ppeStandard, "FULL_BODY_HARNESS", "CHIN_STRAP"],
      precautionsChecklist: { harness_inspected: true, certified_anchor: true, barricade_warning: true },
      typeData: workingAtHeightData,
      approvals: {
        createMany: {
          data: [
            { round: 1, slot: "AREA_OWNER", approverId: areaOwnerPaint.id, decision: "APPROVED" },
            { round: 1, slot: "SAFETY_OFFICER", approverId: safetyOfficer.id, decision: "APPROVED" },
          ],
        },
      },
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(11)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "SUBMIT", fromValue: "DRAFT", toValue: "PENDING_APPROVAL", createdAt: new Date(now.getTime() - h(10) - m(30)) },
            { actorId: areaOwnerPaint.id, actorLabel: areaOwnerPaint.name, actorRole: areaOwnerPaint.role, action: "APPROVE", createdAt: new Date(now.getTime() - h(10) - m(15)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "APPROVE", fromValue: "PENDING_APPROVAL", toValue: "APPROVED", createdAt: new Date(now.getTime() - h(10) - m(5)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "ACTIVATE", fromValue: "APPROVED", toValue: "ACTIVE", createdAt: new Date(now.getTime() - h(10)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "CLOSE", fromValue: "ACTIVE", toValue: "CLOSED", comment: "All ceiling sensor brackets torqued and scaffolding dismantled.", createdAt: new Date(now.getTime() - h(3)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "VERIFY_CLOSURE", fromValue: "CLOSED", toValue: "CLOSED_VERIFIED", comment: "Site inspection completed. Housekeeping verified, safety nets removed, all riggers signed off.", createdAt: new Date(now.getTime() - h(2)) },
          ],
        },
      },
    },
  });

  // 10. EXPIRED permit (past validity window, expired by SYSTEM)
  const p10 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "EXPIRED",
      type: "HOT_WORK",
      requesterId: requester.id,
      contractorTeam: "Industrial Welding Solutions Ltd",
      workDescription: "Expired: Exhaust manifold bracket welding shift 1",
      equipmentId: pressEquipment2.id,
      plannedStartTime: new Date(now.getTime() - h(12)),
      plannedEndTime: new Date(now.getTime() - h(4)),
      expiresAt: new Date(now.getTime() - h(4)),
      actualStartTime: new Date(now.getTime() - h(12)),
      activatedById: safetyOfficer.id,
      hazards: hotWorkHazards,
      ppeRequired: [...ppeStandard, "WELDING_GLOVES"],
      precautionsChecklist: { fire_watch: true, combustibles_cleared: true, ventilation_adequate: true },
      typeData: hotWorkData,
      approvals: {
        createMany: {
          data: [
            { round: 1, slot: "AREA_OWNER", approverId: areaOwnerPress.id, decision: "APPROVED" },
            { round: 1, slot: "SAFETY_OFFICER", approverId: safetyOfficer.id, decision: "APPROVED" },
          ],
        },
      },
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(13)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "SUBMIT", fromValue: "DRAFT", toValue: "PENDING_APPROVAL", createdAt: new Date(now.getTime() - h(12) - m(30)) },
            { actorId: areaOwnerPress.id, actorLabel: areaOwnerPress.name, actorRole: areaOwnerPress.role, action: "APPROVE", createdAt: new Date(now.getTime() - h(12) - m(15)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "APPROVE", fromValue: "PENDING_APPROVAL", toValue: "APPROVED", createdAt: new Date(now.getTime() - h(12) - m(5)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "ACTIVATE", fromValue: "APPROVED", toValue: "ACTIVE", createdAt: new Date(now.getTime() - h(12)) },
            { actorId: null, actorLabel: "SYSTEM", actorRole: "SYSTEM", action: "EXPIRE", fromValue: "ACTIVE", toValue: "EXPIRED", comment: "Permit validity window expired automatically (now >= expiresAt).", createdAt: new Date(now.getTime() - h(4)) },
          ],
        },
      },
    },
  });

  // 11. REJECTED permit (rejected with formal reason)
  const p11 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "REJECTED",
      type: "CONFINED_SPACE_ENTRY",
      requesterId: requester.id,
      contractorTeam: "Apex Vessel Inspection Services",
      workDescription: "Rejected: Robotic spray paint booth duct entry for filter replacement",
      equipmentId: paintEquipment.id,
      plannedStartTime: new Date(now.getTime() + h(1)),
      plannedEndTime: new Date(now.getTime() + h(5)),
      expiresAt: new Date(now.getTime() + h(5)),
      rejectionReason: "Emergency extraction plan lacks secondary tripod anchor point certification. Resubmit with valid NDT certificate.",
      hazards: csHazards,
      ppeRequired: [...ppeStandard, "ESCAPE_BA", "MULTI_GAS_DETECTOR"],
      precautionsChecklist: { atmospheric_tested: true, standby_present: true },
      typeData: confinedSpaceData,
      approvals: {
        createMany: {
          data: [
            { round: 1, slot: "SAFETY_OFFICER", approverId: safetyOfficer.id, decision: "REJECTED", comment: "Emergency extraction plan lacks secondary tripod anchor point certification." },
          ],
        },
      },
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(3)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "SUBMIT", fromValue: "DRAFT", toValue: "PENDING_APPROVAL", createdAt: new Date(now.getTime() - h(2)) },
            { actorId: safetyOfficer.id, actorLabel: safetyOfficer.name, actorRole: safetyOfficer.role, action: "REJECT", fromValue: "PENDING_APPROVAL", toValue: "REJECTED", comment: "Emergency extraction plan lacks secondary tripod anchor point certification. Resubmit with valid NDT certificate.", createdAt: new Date(now.getTime() - h(1)) },
          ],
        },
      },
    },
  });

  // 12. CANCELLED permit (cancelled by requester before execution)
  const p12 = await prisma.permit.create({
    data: {
      permitSequence: seq,
      permitNumber: `PTW-2026-${String(seq++).padStart(4, "0")}`,
      status: "CANCELLED",
      type: "ELECTRICAL_ISOLATION_LOTO",
      requesterId: requester.id,
      contractorTeam: "ElectraCare High Voltage Ltd",
      workDescription: "Cancelled: Robot arm Station A servo motor replacement",
      equipmentId: assemblyRobotChn.id,
      plannedStartTime: new Date(now.getTime() + h(3)),
      plannedEndTime: new Date(now.getTime() + h(7)),
      expiresAt: new Date(now.getTime() + h(7)),
      cancellationReason: "Production schedule rescheduled due to urgent batch dispatch. Maintenance deferred to next shutdown.",
      hazards: lotoHazards,
      ppeRequired: [...ppeStandard, "ARC_FLASH_SHIELD"],
      precautionsChecklist: { isolation_points_locked: true, tags_posted: true },
      typeData: lotoData,
      auditLogs: {
        createMany: {
          data: [
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "DRAFT_CREATED", toValue: "DRAFT", createdAt: new Date(now.getTime() - h(4)) },
            { actorId: requester.id, actorLabel: requester.name, actorRole: requester.role, action: "CANCEL", fromValue: "DRAFT", toValue: "CANCELLED", comment: "Production schedule rescheduled due to urgent batch dispatch. Maintenance deferred to next shutdown.", createdAt: new Date(now.getTime() - h(2)) },
          ],
        },
      },
    },
  });

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log("✅ Seed completed successfully!");
  console.log(
    `Users: Admin (${admin.email}), Safety (${safetyOfficer.email}), AO Press (${areaOwnerPress.email}), AO Paint (${areaOwnerPaint.email}), AO Utils (${areaOwnerUtils.email}), Requester (${requester.email}), Inactive (${deactivatedUser.email})`
  );
  console.log(
    `Plants (2): ${plantPune.name} [${plantPune.code}], ${plantChennai.name} [${plantChennai.code}]`
  );
  console.log(
    `Areas (5): ${[pressArea, paintArea, utilityAreaPune, assemblyAreaChn, warehouseAreaChn].map((a) => a.code).join(", ")}`
  );
  console.log(
    `Equipment (6): ${[pressEquipment1, pressEquipment2, paintEquipment, boilerEquipment, assemblyRobotChn, conveyorChn].map((e) => e.tagNumber).join(", ")}`
  );
  console.log(
    `Permits (12): ${[p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12].map((p) => `${p.permitNumber} (${p.status})`).join(", ")}`
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
