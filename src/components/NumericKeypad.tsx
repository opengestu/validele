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

/* ── Inject keyframe animation once ── */
const STYLE_ID = 'nkp-styles';
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes nkp-pop {
      0%   { transform: scale(1);    }
      40%  { transform: scale(0.88); }
      70%  { transform: scale(1.06); }
      100% { transform: scale(1);    }
    }
    .nkp-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
    .nkp-btn:active { animation: nkp-pop 0.22s ease forwards; }
  `;
  document.head.appendChild(s);
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
      style={{
        width: size,
        height: size,
        borderRadius: 20,
        border: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: '600',
        letterSpacing: '-0.5px',
        cursor: 'pointer',
        userSelect: 'none',
        background: pressed
          ? 'linear-gradient(160deg, #e5e7eb 0%, #d1d5db 100%)'
          : 'linear-gradient(160deg, #ffffff 0%, #f8fafc 100%)',
        color: 'hsl(var(--primary))',
        boxShadow: pressed
          ? '0 1px 4px rgba(34,197,94,0.18), inset 0 2px 6px rgba(34,197,94,0.12)'
          : 'none',
        transform: pressed ? 'scale(0.93)' : 'scale(1)',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease',
        outline: 'none',
        WebkitAppearance: 'none',
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
      style={{
        width: size,
        height: size,
        borderRadius: 20,
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        background: pressed
          ? 'linear-gradient(160deg, #fee2e2 0%, #fecaca 100%)'
          : 'linear-gradient(160deg, #fff1f2 0%, #ffe4e6 100%)',
        color: pressed ? '#b91c1c' : '#ef4444',
        boxShadow: pressed
          ? '0 1px 4px rgba(239,68,68,0.15), inset 0 2px 6px rgba(239,68,68,0.1)'
          : 'none',
        transform: pressed ? 'scale(0.93)' : 'scale(1)',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease',
        outline: 'none',
        WebkitAppearance: 'none',
      }}
    >
      {/* Backspace SVG icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size * 0.42}
        height={size * 0.42}
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
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
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
            borderRadius: 18,
            border: 'none',
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            fontSize: isMobile ? 20 : 17,
            fontWeight: '700',
            letterSpacing: '0.3px',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)',
            transition: 'transform 0.12s ease, box-shadow 0.12s ease',
            outline: 'none',
            WebkitAppearance: 'none',
          }}
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
          onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; onSubmit?.(); }}
        >
          Suivant →
        </button>
      )}
    </div>
  );
}
