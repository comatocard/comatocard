import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const INPUT =
  "w-full rounded-2xl border border-line bg-white px-4 text-[15px] font-medium outline-none transition-colors focus:border-ink aria-[invalid=true]:border-neg";

/** The line under a field: its error, or else its hint. */
function FieldNote({ error, hint }: { error: string | null | undefined; hint: ReactNode }) {
  if (error) return <span className="mt-1.5 block text-[12.5px] text-neg">{error}</span>;
  if (hint) return <span className="mt-1.5 block text-[12.5px] text-muted">{hint}</span>;
  return null;
}

/** A labelled field with an optional suffix (a token symbol) and an error line under it. */
export function Field({
  label,
  hint,
  error,
  suffix,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  suffix?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      <span className="relative block">
        <input
          aria-invalid={error ? true : undefined}
          className={`${INPUT} h-12 ${suffix ? "pr-16" : ""} tabular-nums`}
          {...props}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[13px] font-semibold text-muted">
            {suffix}
          </span>
        ) : null}
      </span>
      <FieldNote error={error} hint={hint} />
    </label>
  );
}

export function TextArea({
  label,
  hint,
  error,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      <textarea
        aria-invalid={error ? true : undefined}
        className={`${INPUT} min-h-[88px] py-3 leading-snug`}
        {...props}
      />
      <FieldNote error={error} hint={hint} />
    </label>
  );
}

/** A row of pills for a small choice, the same look as the bottom bar's active tab. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-1.5 block p-0 text-[13px] font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`h-10 rounded-full border px-4 text-[13.5px] font-semibold transition-colors ${
              value === o.value
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-ink-2 hover:border-line-2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
