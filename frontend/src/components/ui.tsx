import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { errorMessage } from "../api";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-stone-300",
  secondary: "bg-white text-ink border border-stone-300 hover:bg-stone-100 disabled:text-stone-400",
  ghost: "text-stone-600 hover:bg-stone-100 disabled:text-stone-300",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** 버튼처럼 보이는 링크 (<a> 안에 <button>을 넣지 않기 위해) */
export function ButtonLink({ to, variant = "primary", className = "", children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-stone-200 bg-white p-5 ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "brand" | "amber" | "red" | "sky" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    brand: "bg-brand-100 text-brand-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    sky: "bg-sky-100 text-sky-800",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Spinner({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-stone-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="danger" className="mt-3" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
      <p className="font-medium text-stone-700">{title}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

export function CheckChip({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
        checked ? "border-brand-500 bg-brand-50 font-medium text-brand-700" : "border-stone-300 bg-white hover:bg-stone-50"
      }`}
    >
      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold">{children}</h1>
      {sub && <p className="mt-1 text-sm text-stone-500">{sub}</p>}
    </div>
  );
}

export const METHOD_LABEL = {
  FACEPASS: "얼굴 인증",
  QR: "QR",
  BARCODE: "바코드",
  MANUAL: "교사 확인",
} as const;
