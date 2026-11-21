import { prisma } from "../../config/prisma.js";

// Returns [{ module: "CUSTOMERS", permissions: [{ id, code, description }, ...] }, ...]
export async function listPermissionsGrouped() {
  const all = await prisma.permission.findMany({
    select: { id: true, code: true, module: true, description: true },
    orderBy: [{ module: "asc" }, { code: "asc" }],
  });
  const groups = new Map();
  for (const { module, ...p } of all) {
    if (!groups.has(module)) groups.set(module, []);
    groups.get(module).push(p);
  }
  return [...groups].map(([module, permissions]) => ({ module, permissions }));
}
