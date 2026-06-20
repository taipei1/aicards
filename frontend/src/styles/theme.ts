import type { CSSProperties } from 'react';

const t = (name: string) => `var(--${name})`;

export const colors = {
  bg: t('bg-primary'),
  text: t('text-primary'),
  textSecondary: t('text-secondary'),
  border: t('border-primary'),
  borderLight: t('border-light'),
  bgMuted: t('bg-muted'),
  bgInverse: t('bg-inverse'),
  textInverse: t('text-inverse'),
  bgTag: t('bg-tag'),
  bgDanger: t('bg-danger'),
  textDanger: t('text-danger'),
  bgSuccess: t('bg-success'),
  textSuccess: t('text-success'),
  overlay: t('overlay'),
  inputBg: t('input-bg'),
  inputBorder: t('input-border'),
};

export const btn: CSSProperties = {
  border: `2px solid ${colors.border}`,
  background: colors.bg,
  color: colors.text,
  padding: '10px 16px',
  fontSize: '0.9rem',
  cursor: 'pointer',
  borderRadius: '4px',
  fontWeight: 'bold',
  minHeight: '44px',
};

export const btnPrimary: CSSProperties = {
  ...btn,
  background: colors.text,
  color: colors.bg,
};

export const btnSmall: CSSProperties = {
  border: `1px solid ${colors.border}`,
  background: colors.bg,
  color: colors.text,
  padding: '3px 8px',
  fontSize: '0.75rem',
  cursor: 'pointer',
  borderRadius: '3px',
  minHeight: '28px',
};

export const btnGrade: CSSProperties = {
  border: `2px solid ${colors.border}`,
  background: colors.bg,
  color: colors.text,
  padding: '12px 4px',
  fontSize: '0.85rem',
  fontWeight: 'bold',
  cursor: 'pointer',
  borderRadius: '4px',
  minHeight: '48px',
  textAlign: 'center',
};

export const select: CSSProperties = {
  padding: '10px 12px',
  fontSize: '1rem',
  border: `2px solid ${colors.border}`,
  borderRadius: '4px',
  minHeight: '44px',
  background: colors.inputBg,
  color: colors.text,
};

export const input: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '1rem',
  border: `2px solid ${colors.border}`,
  borderRadius: '4px',
  boxSizing: 'border-box',
  background: colors.inputBg,
  color: colors.text,
};

export const label: CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontWeight: 'bold',
  fontSize: '0.9rem',
  color: colors.text,
};

export const overlay: CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: colors.overlay,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '16px',
};

export const modal: CSSProperties = {
  background: colors.bg,
  border: `2px solid ${colors.border}`,
  padding: '20px',
  maxWidth: '400px',
  width: '100%',
  borderRadius: '4px',
};

export const tagStyle: CSSProperties = {
  border: `1px solid ${colors.borderLight}`,
  padding: '2px 8px',
  fontSize: '0.75rem',
  borderRadius: '3px',
  background: colors.bgTag,
  color: colors.text,
};

export const cardBox: CSSProperties = {
  border: `2px solid ${colors.border}`,
  minHeight: '220px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '20px',
  cursor: 'pointer',
  marginBottom: '14px',
  userSelect: 'text',
  background: colors.bg,
};

export const textarea: CSSProperties = {
  width: '100%',
  height: '100px',
  padding: '10px',
  fontSize: '0.9rem',
  fontFamily: 'monospace',
  border: `2px solid ${colors.border}`,
  borderRadius: '4px',
  boxSizing: 'border-box',
  resize: 'vertical',
  background: colors.inputBg,
  color: colors.text,
};

export const truncate: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '200px',
};
