import { Prisma } from "@prisma/client";
import * as prismaModule from "../../config/prisma.js";

const prisma = prismaModule.default ?? prismaModule.prisma;
const { Decimal } = Prisma;

const TYPES = ["DEPOT", "RETRAIT", "VIREMENT"];
// Supported currencies (order = order of the tabs in the UI).
export const CURRENCIES = ["DZD", "EUR", "USD"];
const DAY_MS = 86_400_000;

const fmt = (d) => new Decimal(d ?? 0).toFixed(2);
const dec = (v) => new Decimal(v == null ? 0 : String(v));

// "YYYY-MM-DD" of an instant, expressed in the client's local time.
const dayKey = (date, tzOffset) =>
  new Date(date.getTime() - tzOffset * 60_000).toISOString().slice(0, 10);

/**
 * Statistics are computed PER CURRENCY: amounts in different currencies are never added together.
 *
 * Transaction has no currency column, so the currency is the one of its account(s):
 *   DEPOT    -> destination account currency
 *   RETRAIT  -> source account currency
 *   VIREMENT -> source account currency (the amount is expressed in the debited account's currency)
 * which is exactly COALESCE(source.currency, destination.currency).
 */
export async function getStatistics(bankId, { from, to, tzOffset }) {
  const [typeRows, flowRows] = await Promise.all([
    // Totals per (currency, type). Transaction belongs to a bank through its accounts.
    prisma.$queryRaw`
      SELECT
        UPPER(COALESCE(s.currency, d.currency)) AS currency,
        t."transactionType"::text AS type,
        COUNT(*)::int AS count,
        SUM(t.amount) AS total,
        SUM(t.fee) AS fees,
        MAX(t.amount) AS maximum
      FROM transactions t
      LEFT JOIN accounts s ON s.id = t."sourceAccountId"
      LEFT JOIN accounts d ON d.id = t."destinationAccountId"
      WHERE t.status = 'COMPLETED'
        AND t."createdAt" >= ${from}
        AND t."createdAt" <= ${to}
        AND (s."bankId" = ${bankId}::uuid OR d."bankId" = ${bankId}::uuid)
      GROUP BY 1, 2
    `,

    // Daily deposits / withdrawals per currency, grouped in the client's local day.
    prisma.$queryRaw`
      SELECT
        to_char((t."createdAt" - make_interval(mins => ${tzOffset}::int))::date, 'YYYY-MM-DD') AS day,
        UPPER(COALESCE(s.currency, d.currency)) AS currency,
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
      GROUP BY 1, 2, 3
      ORDER BY 1
    `,
  ]);

  // Every day of the period (zero-filled, no gaps in the chart), shared by all currencies.
  const startMs = Date.parse(`${dayKey(from, tzOffset)}T00:00:00Z`);
  const endMs = Date.parse(`${dayKey(to, tzOffset)}T00:00:00Z`);
  const days = [];
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }

  const byCurrency = {};

  for (const currency of CURRENCIES) {
    // ---- totals per type ----
    let totalFees = new Decimal(0);
    let totalVolume = new Decimal(0);
    let totalTransactions = 0;

    const byType = TYPES.map((type) => {
      const g = typeRows.find((x) => x.currency === currency && x.type === type);
      const count = g ? Number(g.count) : 0;
      const total = dec(g?.total);
      totalFees = totalFees.plus(dec(g?.fees));
      totalVolume = totalVolume.plus(total);
      totalTransactions += count;
      return {
        type,
        count,
        total: fmt(total),
        average: count > 0 ? total.div(count).toFixed(2) : "0.00",
        maximum: fmt(dec(g?.maximum)),
      };
    });

    const totalOf = (t) => byType.find((x) => x.type === t).total;

    // ---- daily net flow ----
    const buckets = new Map();
    for (const r of flowRows) {
      if (r.currency !== currency) continue;
      const b = buckets.get(r.day) ?? { inflows: new Decimal(0), outflows: new Decimal(0) };
      const v = dec(r.total);
      if (r.type === "DEPOT") b.inflows = b.inflows.plus(v);
      else b.outflows = b.outflows.plus(v);
      buckets.set(r.day, b);
    }

    let cumulative = new Decimal(0);
    const netFlow = days.map((key) => {
      const b = buckets.get(key);
      const inflows = b?.inflows ?? new Decimal(0);
      const outflows = b?.outflows ?? new Decimal(0);
      const net = inflows.minus(outflows);
      cumulative = cumulative.plus(net);
      return {
        date: key,
        inflows: fmt(inflows),
        outflows: fmt(outflows),
        net: fmt(net),
        cumulativeNet: fmt(cumulative),
      };
    });

    byCurrency[currency] = {
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

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    currencies: CURRENCIES,
    byCurrency,
  };
}