import { EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";

export function NoProfile() {
  return <Card><EmptyState title="No employee profile linked" description="Your account is not linked to an employee record in this company. Contact your payroll administrator." /></Card>;
}
