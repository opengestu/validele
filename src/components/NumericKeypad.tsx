import React, { useState, useEffect, useCallback } from 'react';

type Props = {
  onDigit: (d: string) => void;
  onBack?: () => void;
  onSubmit?: () => void;
  showSubmit?: boolean;
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return isMobile;
}

/* ── Digit key ── */
function DigitButton({ digit, onClick, size }: { digit: string; onClick: () => void; size: number }) {
  const [pressed, setPressed] = useState(false);

  const handleTouchStart = useCallback(() => setPressed(true), []);
  const handleTouchEnd = useCallback(() => { setPressed(false); onClick(); }, [onClick]);
  const handleMouseDown = useCallback(() => setPressed(true), []);
  const handleMouseUp = useCallback(() => { setPressed(false); onClick(); }, [onClick]);

  return (
    <button
      className="nkp-btn"
      tabIndex={-1}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => setPressed(false)}
      style={{
        width: size,
        height: size,
        borderRadius: 18,
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 600,
        letterSpacing: '-0.5px',
        cursor: 'pointer',
        userSelect: 'none',
        background: pressed ? 'hsl(var(--muted))' : 'transparent',
        color: 'hsl(var(--foreground))',
        boxShadow: 'none',
        transform: pressed ? 'scale(0.94)' : 'scale(1)',
        transition: 'transform 0.15s cubic-bezier(0.22, 1, 0.36, 1), background 0.15s ease',
        outline: 'none',
        WebkitAppearance: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {digit}
    </button>
  );
}

/* ── Backspace key ── */
function DeleteButton({ onClick, size }: { onClick?: () => void; size: number }) {
  const [pressed, setPressed] = useState(false);

  const handleTouchStart = useCallback(() => setPressed(true), []);
  const handleTouchEnd = useCallback(() => { setPressed(false); onClick?.(); }, [onClick]);
  const handleMouseDown = useCallback(() => setPressed(true), []);
  const handleMouseUp = useCallback(() => { setPressed(false); onClick?.(); }, [onClick]);

  return (
    <button
      className="nkp-btn"
      tabIndex={-1}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => setPressed(false)}
      style={{
        width: size,
        height: size,
        borderRadius: 18,
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        background: pressed ? 'hsl(var(--muted))' : 'transparent',
        color: 'hsl(var(--muted-foreground))',
        boxShadow: 'none',
        transform: pressed ? 'scale(0.94)' : 'scale(1)',
        transition: 'transform 0.15s cubic-bezier(0.22, 1, 0.36, 1), background 0.15s ease',
        outline: 'none',
        WebkitAppearance: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {/* Backspace SVG icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size * 0.4}
        height={size * 0.4}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
        <line x1="18" y1="9" x2="12" y2="15" />
        <line x1="12" y1="9" x2="18" y2="15" />
      </svg>
    </button>
  );
}

/* ── Main keypad ── */
export default function NumericKeypad({ onDigit, onBack, onSubmit, showSubmit }: Props) {
  const isMobile = useIsMobile();
  const size  = isMobile ? 88 : 72;
  const gap   = isMobile ? 18 : 14;
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: isMobile ? 28 : 22,
        padding: isMobile ? '24px 20px 28px' : '18px 16px 22px',
        background: 'transparent',
        borderRadius: 28,
        boxShadow: 'none',
        border: 'none',
      }}
    >
      {/* Grid 3×4 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(3, ${size}px)`,
          gap,
        }}
      >
        {digits.map(d => (
          <DigitButton key={d} digit={d} size={size} onClick={() => onDigit(d)} />
        ))}
        {/* Empty slot bottom-left */}
        <div style={{ width: size, height: size }} />
        <DigitButton digit="0" size={size} onClick={() => onDigit('0')} />
        <DeleteButton size={size} onClick={onBack} />
      </div>

      {/* Submit button */}
      {showSubmit && (
        <button
          onClick={() => onSubmit?.()}
          style={{
            width: `${size * 3 + gap * 2}px`,
            padding: isMobile ? '16px 0' : '13px 0',
            borderRadius: 16,
            border: 'none',
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            fontSize: isMobile ? 18 : 16,
            fontWeight: 500,
            letterSpacing: '0.2px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px -2px rgb(0 0 0 / 0.10), 0 4px 16px -4px rgb(0 0 0 / 0.10)',
            transition: 'transform 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
            outline: 'none',
            WebkitAppearance: 'none',
          }}
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
          onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; onSubmit?.(); }}
        >
          Suivant →
        </button>
      )}
    </div>
  );
}
