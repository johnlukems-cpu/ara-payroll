import { redirect } from "next/navigation";

/** Tax rules moved to the Tax & Declarations module. */
export default function LegacyTaxSettings() {
  redirect("/app/tax/rules");
}
