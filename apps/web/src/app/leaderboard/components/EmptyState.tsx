import Link from "next/link";

export type EmptyStateContent = {
  icon: string;
  iconLabel: string;
  title: string;
  description: string;
  cta?: { href: string; label: string };
};

export default function EmptyState({
  icon,
  iconLabel,
  title,
  description,
  cta,
}: EmptyStateContent) {
  return (
    <div
      style={{
        marginTop: "2rem",
        padding: "2rem 1.5rem",
        borderRadius: "12px",
        border: "1px solid var(--color-border-subtle)",
        background: "var(--color-surface-elevated)",
        textAlign: "center",
      }}
    >
      <div
        role="img"
        aria-label={iconLabel}
        style={{ fontSize: "2.25rem", marginBottom: "0.75rem" }}
      >
        {icon}
      </div>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>{title}</h2>
      <p
        style={{
          margin: "0 0 1.25rem",
          color: "var(--color-text-muted)",
          fontSize: "0.95rem",
        }}
      >
        {description}
      </p>
      {cta ? (
        <Link
          href={cta.href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.5rem 1.25rem",
            borderRadius: "999px",
            border: "1px solid var(--color-button-strong-border)",
            background: "var(--color-button-strong-bg)",
            color: "var(--color-button-strong-text)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
