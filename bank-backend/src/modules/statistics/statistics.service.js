import { Prisma } from "@prisma/client";
import * as prismaModule from "../../config/prisma.js";

const prisma = prismaModule.default ?? prismaModule.prisma;
const { Decimal } = Prisma;

const TYPES = ["DEPOT", "RETRAIT", "VIREMENT"];
const DAY_MS = 86_400_000;

// Transaction has no bankId: it belongs to a bank through its accounts.
const txScope = (bankId) => ({
  OR: [
    { sourceAccount: { bankId } },
    { destinationAccount: { bankId } },
  ],
});

const fmt = (d) => new Decimal(d ?? 0).toFixed(2);

// "YYYY-MM-DD" of an instant, expressed in the client's local time.
const dayKey = (date, tzOffset) =>
  new Date(date.getTime() - tzOffset * 60_000).toISOString().slice(0, 10);

export async function getStatistics(bankId, { from, to, tzOffset }) {
  // Only successfully executed operations count as financial activity.
  const where = {
    status: "COMPLETED",
    createdAt: { gte: from, lte: to },
    ...txScope(bankId),
  };

  const [groups, flowRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["transactionType"],
      where,
      _count: { _all: true },
      _sum: { amount: true, fee: true },
      _max: { amount: true },
    }),

    // Daily deposits / withdrawals, grouped by the database in the client's local day.
    // Deposits belong to the destination account's bank, withdrawals to the source account's bank.
    prisma.$queryRaw`
      SELECT
        to_char((t."createdAt" - make_interval(mins => ${tzOffset}::int))::date, 'YYYY-MM-DD') AS day,
        t."transactionType"::text AS type,
        SUM(t.amount) AS total
      FROM transactions t
      LEFT JOIN accounts s ON s.id = t."sourceAccountId"
      LEFT JOIN accounts d ON d.id = t."destinationAccountId"
      WHERE t.status = 'COMPLETED'
        AND t."createdAt" >= ${from}
        AND t."createdAt" <= ${to}
        AND (
          (t."transactionType" = 'DEPOT'   AND d."bankId" = ${bankId}::uuid) OR
          (t."transactionType" = 'RETRAIT' AND s."bankId" = ${bankId}::uuid)
        )
      GROUP BY 1, 2
      ORDER BY 1
    `,
  ]);

  let totalFees = new Decimal(0);
  let totalVolume = new Decimal(0);
  let totalTransactions = 0;

  const byType = TYPES.map((type) => {
    const g = groups.find((x) => x.transactionType === type);
    const count = g?._count._all ?? 0;
    const total = new Decimal(g?._sum.amount ?? 0);
    totalFees = totalFees.plus(g?._sum.fee ?? 0);
    totalVolume = totalVolume.plus(total);
    totalTransactions += count;
    return {
      type,
      count,
      total: fmt(total),
      average: count > 0 ? total.div(count).toFixed(2) : "0.00",
      maximum: fmt(g?._max.amount ?? 0),
    };
  });

  const totalOf = (t) => byType.find((x) => x.type === t).total;

  // Index the SQL rows by day, then zero-fill every day of the period (no gaps in the chart).
  const buckets = new Map();
  for (const r of flowRows) {
    const b = buckets.get(r.day) ?? {
      inflows: new Decimal(0),
      outflows: new Decimal(0),
    };
    const v = new Decimal(String(r.total));
    if (r.type === "DEPOT") b.inflows = b.inflows.plus(v);
    else b.outflows = b.outflows.plus(v);
    buckets.set(r.day, b);
  }

  const startMs = Date.parse(`${dayKey(from, tzOffset)}T00:00:00Z`);
  const endMs = Date.parse(`${dayKey(to, tzOffset)}T00:00:00Z`);
  let cumulative = new Decimal(0);
  const netFlow = [];
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    const key = new Date(t).toISOString().slice(0, 10);
    const b = buckets.get(key);
    const inflows = b?.inflows ?? new Decimal(0);
    const outflows = b?.outflows ?? new Decimal(0);
    const net = inflows.minus(outflows);
    cumulative = cumulative.plus(net);
    netFlow.push({
      date: key,
      inflows: fmt(inflows),
      outflows: fmt(outflows),
      net: fmt(net),
      cumulativeNet: fmt(cumulative),
    });
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    kpis: {
      totalDeposits: totalOf("DEPOT"),
      totalWithdrawals: totalOf("RETRAIT"),
      totalTransfers: totalOf("VIREMENT"), // gross transfer volume
      totalFees: fmt(totalFees),
      totalVolume: fmt(totalVolume),
      totalTransactions,
      netExternalFlow: fmt(cumulative), // deposits - withdrawals
    },
    byType,
    netFlow,
  };
}