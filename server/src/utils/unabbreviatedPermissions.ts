import { Permission } from "../db";

export function unabbreviatedPermissions(
  abbrev: string
): Permission.Permission[] {
  const permits = [];
  if (abbrev.includes("a")) permits.push("access");
  if (abbrev.includes("e")) permits.push("edit");
  if (abbrev.includes("i")) permits.push("invite");
  if (abbrev.includes("x")) permits.push("admin");
  return permits;
}
