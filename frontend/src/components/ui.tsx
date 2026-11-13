import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { errorMessage } from "../api";
import { Icon } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// 디자인은 프로토타입 클래스(.button.primary 등, styles/design.css)를 쓴다. props는 예전과 같다
const VARIANT_CLASS: Record<Variant, string> = {
  primary: "button primary",
  secondary: "button secondary",
  ghost: "button text",
  danger: "button danger",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={`${VARIANT_CLASS[variant]} ${className}`} />;
}

/** 버튼처럼 보이는 링크 (<a> 안에 <button>을 넣지 않기 위해) */
export function ButtonLink({ to, variant = "primary", className = "", children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`${VARIANT_CLASS[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card card-pad ${className}`}>{children}</section>;
}

const BADGE_TONE = { stone: "gray", brand: "green", amber: "orange", red: "red", sky: "blue" } as const;

export function Badge({ children, tone = "stone" }: { children: ReactNode; tone?: keyof typeof BADGE_TONE }) {
  return (
    <span className={`badge ${BADGE_TONE[tone]}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}

export function Spinner({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div className="state-block compact" role="status">
      <span className="spinner" />
      <strong>{label}</strong>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state-block compact" role="alert">
      <span className="state-icon error">
        <Icon name="alert" />
      </span>
      <strong>{errorMessage(error)}</strong>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card state-block">
      <span className="state-icon">
        <Icon name="book" />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
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
    <div className="page-heading">
      <div>
        <h1>{children}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </div>
  );
}

export const METHOD_LABEL = {
  FACEPASS: "얼굴 인증",
  QR: "QR",
  BARCODE: "바코드",
  MANUAL: "교사 확인",
} as const;
