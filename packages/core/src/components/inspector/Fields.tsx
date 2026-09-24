import React from 'react';

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 text-[11px] text-metin-etiket">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </label>
  );
}

export function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  disabled,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-w-0 bg-denetim px-1.5 py-1 text-xs text-metin outline-none ring-amber focus:ring-1 disabled:opacity-50"
      />
      {suffix && <span className="text-[10px] text-metin-etiket">{suffix}</span>}
    </div>
  );
}

export function SliderField({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  disabled,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  format?: (v: number) => string;
}) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-[var(--mzn-amber)] disabled:opacity-50"
      />
      <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-metin-zayif">
        {format ? format(value) : Math.round(value * 100) / 100}
      </span>
    </>
  );
}

export function ColorField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 shrink-0 cursor-pointer border border-kenar-denetim bg-transparent disabled:opacity-50"
      />
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-denetim px-1.5 py-1 text-[11px] text-metin outline-none"
      />
    </div>
  );
}

export function TextField({
  value,
  onChange,
  disabled,
  placeholder,
  multiline,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const cls =
    'w-full min-w-0 bg-denetim px-1.5 py-1 text-xs text-metin outline-none ring-amber focus:ring-1 disabled:opacity-50 placeholder:text-metin-cok-zayif';
  if (multiline) {
    return (
      <textarea
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cls + ' resize-y'}
      />
    );
  }
  return (
    <input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cls}
    />
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full min-w-0 bg-denetim px-1.5 py-1 text-xs text-metin outline-none disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function CheckField({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-metin-govde">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--mzn-amber)]"
      />
      {label}
    </label>
  );
}

/**
 * Denetçi bölümü — B · Kesme Masası.
 *
 * Kutu YOK: her bölümü çerçeveleyince ekranda kutu içinde kutu içinde kutu
 * çıkıyordu ve hiçbiri ötekinden önemli görünmüyordu. Ayrım tek bir
 * yatay çizgiyle ve VERSAL etiketle yapılıyor — gezgin ve kitaplık
 * başlıklarıyla aynı dil.
 */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-kenar-ic pb-3">
      <h3 className="mzn-etiket mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}
