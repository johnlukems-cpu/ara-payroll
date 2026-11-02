import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <p className="text-muted-foreground">This page could not be found.</p>
      <Link href="/app" className="mt-2 text-sm font-medium text-primary hover:underline">Back to dashboard</Link>
    </div>
  );
}
