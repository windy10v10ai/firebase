import type { ReactNode } from 'react';

interface FieldProps {
  children: ReactNode;
  error?: string;
  help?: ReactNode;
  htmlFor: string;
  label: string;
  messageId: string;
  required?: boolean;
}

const Field = ({
  children,
  error,
  help,
  htmlFor,
  label,
  messageId,
  required = false,
}: FieldProps) => {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block font-medium text-heading">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-danger">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error || help ? (
        <div id={messageId} className="space-y-1">
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          {help ? <div className="text-sm text-muted">{help}</div> : null}
        </div>
      ) : null}
    </div>
  );
};

export default Field;
