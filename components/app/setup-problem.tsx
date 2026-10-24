import { Logo } from "@/components/brand/logo";
import type { ProfileLoadError } from "@/lib/auth";

/**
 * Shown instead of a blank "server error" when the profile can't be loaded,
 * usually because a database migration hasn't been run yet.
 */
export function SetupProblem({ problem }: { problem: ProfileLoadError }) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <Logo size="2rem" />
      <h1 className="font-display text-heading font-bold tracking-[-0.02em]">
        {problem.kind === "schema" ? "Rivl's database needs an update" : "Couldn't load your profile"}
      </h1>
      <p className="text-body text-muted text-pretty">
        {problem.kind === "schema"
          ? "The app is newer than the database. Run any files in supabase/migrations that haven't been run yet, in order, then reload."
          : "Something went wrong reaching the database. Try again in a moment."}
      </p>
      <pre className="overflow-x-auto rounded-chip border border-line bg-surface p-3 font-mono text-caption whitespace-pre-wrap text-muted">
        {problem.code ? `${problem.code}: ` : ""}
        {problem.message}
      </pre>
      <a href="" className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 font-semibold text-on-accent">
        Reload
      </a>
    </div>
  );
}
