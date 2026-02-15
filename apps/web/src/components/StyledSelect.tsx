"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";

type SelectValue = string | number;

export type SelectOption<Value extends SelectValue = SelectValue> = {
  value: Value;
  label: string;
  disabled?: boolean;
};

type StyledSelectProps<Value extends SelectValue> = {
  value: Value;
  options: readonly SelectOption<Value>[];
  onChange: (value: Value) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
};

export function StyledSelect<Value extends SelectValue>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  className
}: StyledSelectProps<Value>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  const rootClassName = className ? `ui-select ${className}` : "ui-select";

  return (
    <div className={rootClassName} ref={rootRef}>
      <button
        type="button"
        className={`ui-select-trigger ${open ? "is-open" : ""}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="ui-select-label">{selectedOption?.label ?? String(value)}</span>
        <span className="ui-select-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="ui-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => {
            const active = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={active}
                className={`ui-select-option ${active ? "is-active" : ""}`}
                disabled={option.disabled}
                style={{ "--ui-select-option-delay": `${Math.min(index, 6) * 22}ms` } as CSSProperties}
                onClick={() => {
                  if (option.disabled) {
                    return;
                  }
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
