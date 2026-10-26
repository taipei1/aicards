import type { CSSProperties } from 'react';

interface ModelLabelProps {
  model?: string;
  label?: string;
  style?: CSSProperties;
}

/**
 * Tiny caption under generated content. The value comes from the backend and
 * is the model that really answered (including the Groq fallback), not just
 * the name configured in Settings.
 */
export function ModelLabel({ model, label = 'model', style }: ModelLabelProps) {
  if (!model) return null;
  return (
    <div
      title="Model that generated this text"
      style={{
        fontSize: '0.7rem',
        lineHeight: 1.3,
        color: 'var(--text-secondary)',
        opacity: 0.8,
        fontFamily: 'monospace',
        wordBreak: 'break-all',
        ...style,
      }}
    >
      {label}: {model}
    </div>
  );
}
