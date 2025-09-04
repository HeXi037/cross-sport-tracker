import { SelectHTMLAttributes, ReactNode } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}

export default function SelectField({
  id,
  label,
  error,
  children,
  ...props
}: Props) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
