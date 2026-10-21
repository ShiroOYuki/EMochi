import { type ReactNode } from "react";

export function Section({
  title,
  step,
  right,
  children,
  dim,
}: {
  title: string;
  step?: number;
  right?: ReactNode;
  children: ReactNode;
  dim?: boolean;
}) {
  return (
    <section className={`card ${dim ? "opacity-50" : ""}`}>
      <div className="mb-3 flex items-center gap-2">
        {step !== undefined && (
          <span className="flex size-7 items-center justify-center rounded-full bg-gold text-sm text-on-gold shadow-[0_2px_0_var(--c-gold-deep)]">
            {step}
          </span>
        )}
        <h2 className="text-base">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}
