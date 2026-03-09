import React, { useState, useCallback } from 'react';

interface PinInputProps {
  length?: number;
  onComplete?: (pin: string) => void;
}

const SIZE = 82;
const GAP = 14;

function DigitBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  const down = useCallback(() => setPressed(true), []);
  const up   = useCallback(() => { setPressed(false); onPress(); }, [onPress]);

  return (
    <button
      type="button"
      aria-label={`Chiffre ${label}`}
      onMouseDown={down}
      onMouseUp={up}
      onTouchStart={(e) => { e.preventDefault(); down(); }}
      onTouchEnd={(e) => { e.preventDefault(); up(); }}
      style={{
        width: SIZE, height: SIZE,
        borderRadius: 18,
        border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 600, letterSpacing: '-0.5px',
        cursor: 'pointer', userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        background: pressed
          ? 'linear-gradient(160deg, #e5e7eb 0%, #d1d5db 100%)'
          : 'linear-gradient(160deg, #ffffff 0%, #f8fafc 100%)',
        color: 'hsl(var(--primary))',
        boxShadow: 'none',
        transform: pressed ? 'scale(0.93)' : 'scale(1)',
        transition: 'transform 0.1s ease, background 0.1s ease',
        outline: 'none',
      }}
    >
      {label}
    </button>
  );
}

function DeleteBtn({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  const down = useCallback(() => setPressed(true), []);
  const up   = useCallback(() => { setPressed(false); onPress(); }, [onPress]);

  return (
    <button
      type="button"
      aria-label="Effacer"
      onMouseDown={down}
      onMouseUp={up}
      onTouchStart={(e) => { e.preventDefault(); down(); }}
      onTouchEnd={(e) => { e.preventDefault(); up(); }}
      style={{
        width: SIZE, height: SIZE,
        borderRadius: 18,
        border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        background: pressed
          ? 'linear-gradient(160deg, #fee2e2 0%, #fecaca 100%)'
          : 'linear-gradient(160deg, #fff1f2 0%, #ffe4e6 100%)',
        color: '#ef4444',
        boxShadow: 'none',
        transform: pressed ? 'scale(0.93)' : 'scale(1)',
        transition: 'transform 0.1s ease, background 0.1s ease',
        outline: 'none',
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
        <line x1="18" y1="9" x2="12" y2="15" />
        <line x1="12" y1="9" x2="18" y2="15" />
      </svg>
    </button>
  );
}

const PinInput: React.FC<PinInputProps> = ({ length = 4, onComplete }) => {
  const [digits, setDigits] = useState<string[]>([]);

  const addDigit = useCallback((d: string) => {
    setDigits(prev => {
      if (prev.length >= length) return prev;
      const next = [...prev, d];
      if (next.length === length && onComplete) onComplete(next.join(''));
      return next;
    });
  }, [length, onComplete]);

  const removeDigit = useCallback(() => {
    setDigits(prev => prev.slice(0, -1));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
      {/* PIN dot indicators */}
      <div style={{ display: 'flex', gap: 16 }}>
        {Array.from({ length }).map((_, i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: 7,
            background: i < digits.length ? 'hsl(var(--primary))' : '#e5e7eb',
            transform: i < digits.length ? 'scale(1.15)' : 'scale(1)',
            transition: 'all 0.2s ease',
          }} />
        ))}
      </div>

      {/* Key grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(3, ${SIZE}px)`,
        gap: GAP,
      }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <DigitBtn key={n} label={String(n)} onPress={() => addDigit(String(n))} />
        ))}
        <div style={{ width: SIZE, height: SIZE }} />
        <DigitBtn label="0" onPress={() => addDigit('0')} />
        <DeleteBtn onPress={removeDigit} />
      </div>
    </div>
  );
};

export default PinInput;
