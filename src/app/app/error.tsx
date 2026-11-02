"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm text-muted-foreground">The error has been logged. Please try again.</p>
      <button onClick={reset} className="mt-4 text-sm font-medium text-primary hover:underline">Try again</button>
    </div>
  );
}
