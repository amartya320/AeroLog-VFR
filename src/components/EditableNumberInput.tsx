import React, { useState, useEffect } from 'react';

interface EditableNumberInputProps {
  id?: string;
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: string | number;
  fallbackOnEmptyBlur?: number;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Controlled numeric input that allows the user to completely clear the field
 * or type intermediate decimals without snapping back to a minimum mid-keystroke.
 */
export const EditableNumberInput: React.FC<EditableNumberInputProps> = ({
  id,
  value,
  onChange,
  min,
  max,
  step = 'any',
  fallbackOnEmptyBlur,
  placeholder,
  ariaLabel,
  className,
}) => {
  const [draft, setDraft] = useState<string>(() => String(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // Sync draft from external value when not actively focused
  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDraft(raw);

    if (raw.trim() === '' || raw === '-') {
      return;
    }

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const clampedMax = max !== undefined ? Math.min(max, parsed) : parsed;
      onChange(clampedMax);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const trimmed = draft.trim();
    if (trimmed === '' || isNaN(parseFloat(trimmed))) {
      const fallback = fallbackOnEmptyBlur !== undefined ? fallbackOnEmptyBlur : min ?? 0;
      onChange(fallback);
      setDraft(String(fallback));
      return;
    }

    let finalVal = parseFloat(trimmed);
    if (min !== undefined) finalVal = Math.max(min, finalVal);
    if (max !== undefined) finalVal = Math.min(max, finalVal);
    onChange(finalVal);
    setDraft(String(finalVal));
  };

  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={draft}
      onFocus={() => setIsFocused(true)}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
};
