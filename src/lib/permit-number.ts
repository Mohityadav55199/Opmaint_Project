/**
 * Formats a sequence integer and calendar year into canonical PTW format:
 * Example: year 2026, sequence 42 -> PTW-2026-0042
 */
export function formatPermitNumber(year: number, sequence: number): string {
  return `PTW-${year}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Parses a canonical permit number string into year and sequence components.
 */
export function parsePermitNumber(permitNumber: string): { year: number; sequence: number } | null {
  const match = /^PTW-(\d{4})-(\d+)$/.exec(permitNumber.trim());
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    sequence: parseInt(match[2], 10),
  };
}

/**
 * Allocates the next permit number in a concurrency-safe manner within a PostgreSQL transaction.
 * Uses a PostgreSQL transaction-scoped advisory lock keyed by year to prevent race conditions.
 */
export async function allocateNextPermitNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  year: number = new Date().getFullYear()
): Promise<{ permitNumber: string; sequence: number }> {
  // Keyed advisory lock for the given year (released automatically upon transaction commit/rollback)
  const lockKey = 420000 + (year % 10000);
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);

  const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
  const endOfYear = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const result = await tx.permit.aggregate({
    _max: {
      permitSequence: true,
    },
    where: {
      createdAt: {
        gte: startOfYear,
        lt: endOfYear,
      },
    },
  });

  const nextSeq = (result._max.permitSequence || 0) + 1;
  const permitNumber = formatPermitNumber(year, nextSeq);

  return {
    permitNumber,
    sequence: nextSeq,
  };
}
