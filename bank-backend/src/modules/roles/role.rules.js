import { AppError } from "../../utils/AppError.js";
import { ROLE_PERMISSION_RULES } from "../../constants/permissions.js";

// Pure function (no DB): easy to unit-test and to explain.
// Throws 422 if the list of permission codes breaks the separation-of-duties rules of the role.
export function validatePermissionSet(roleName, codes) {
  const rules = ROLE_PERMISSION_RULES[roleName];
  if (!rules) return; // custom roles have no special rule

  const violations = [];

  const forbidden = codes.filter((c) => rules.forbidden?.includes(c));
  if (forbidden.length) violations.push(`${roleName} cannot hold: ${forbidden.join(", ")}`);

  if (rules.viewOnly) {
    const writes = codes.filter((c) => !c.endsWith("_VIEW"));
    if (writes.length) violations.push(`${roleName} is read-only, remove: ${writes.join(", ")}`);
  }

  const missing = (rules.required ?? []).filter((c) => !codes.includes(c));
  if (missing.length) violations.push(`${roleName} must keep: ${missing.join(", ")}`);

  if (violations.length) {
    throw new AppError("These permissions violate the rules of this role", 422, "ROLE_RULE_VIOLATION", violations);
  }
}
