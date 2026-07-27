import mascot from "../assets/mascot.png";

export const authInputClass =
  "w-full rounded-full border border-cute-border bg-cute-surface px-6 py-[18px] font-body text-sm text-cute-text outline-none transition placeholder:text-cute-text-muted focus:border-cute-primary";

export const authButtonClass =
  "w-full cursor-pointer rounded-full bg-cute-primary px-6 py-4 font-heading text-base font-semibold text-cute-primary-foreground transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60";

/** Shared full-page frame for the sign-in / create-account screens (per UI.pen). */
export function AuthShell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-7 bg-cute-bg px-10 py-12 pt-[env(safe-area-inset-top)]">
      <img
        src={mascot}
        alt="Tidy Nest mascot"
        className="h-[200px] w-[200px] rounded-cute-l object-cover"
      />
      <h1 className="font-heading text-4xl font-semibold text-cute-primary">Tidy Nest</h1>
      <p className="w-full max-w-[400px] text-center font-body text-[15px] leading-[21px] text-cute-text-muted">
        {subtitle}
      </p>
      {children}
    </div>
  );
}
