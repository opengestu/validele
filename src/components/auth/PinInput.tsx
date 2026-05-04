import React, { useState, useCallback } from 'react';

interface PinInputProps {
  length?: number;
  onComplete?: (pin: string) => void;
}

const BUTTON_HEIGHT = 62;
const GAP = 8;

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
        width: '100%', height: BUTTON_HEIGHT,
        borderRadius: 0,
        border: '0',
        borderWidth: 0,
        borderStyle: 'none',
        borderColor: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 600, letterSpacing: '-0.5px',
        cursor: 'pointer', userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        WebkitAppearance: 'none',
        appearance: 'none',
        padding: 0,
        background: 'transparent',
        backgroundImage: 'none',
        color: '#111827',
        boxShadow: 'none',
        WebkitBoxShadow: 'none',
        MozBoxShadow: 'none',
        filter: 'none',
        transform: 'none',
        textShadow: 'none',
        transition: 'none',
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
        width: '100%', height: BUTTON_HEIGHT,
        borderRadius: 16,
        border: '0',
        borderWidth: 0,
        borderStyle: 'none',
        borderColor: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        WebkitAppearance: 'none',
        appearance: 'none',
        background: pressed ? '#ef4444' : '#111827',
        backgroundImage: 'none',
        color: '#ffffff',
        boxShadow: 'none',
        WebkitBoxShadow: 'none',
        MozBoxShadow: 'none',
        filter: 'none',
        transform: 'none',
        textShadow: 'none',
        transition: 'background 0.12s ease',
        outline: 'none',
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 70, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
        {Array.from({ length }).map((_, i) => (
          <div key={i} style={{
            width: i < digits.length ? 12 : 12,
            height: i < digits.length ? 12 : 12,
            borderRadius: 9999,
            background: i < digits.length ? '#111827' : '#d1d5db',
            boxShadow: 'none',
            transform: i < digits.length ? 'scale(1)' : 'scale(0.95)',
            transition: 'all 0.18s ease',
          }} />
        ))}
      </div>

      <div style={{
        display: 'grid',
        width: '100%',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: GAP,
        padding: 0,
        borderRadius: 0,
        background: 'transparent',
        boxShadow: 'none',
        border: '0',
        borderWidth: 0,
        borderStyle: 'none',
        borderColor: 'transparent',
      }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <DigitBtn key={n} label={String(n)} onPress={() => addDigit(String(n))} />
        ))}
        <div style={{ width: '100%', height: BUTTON_HEIGHT }} />
        <DigitBtn label="0" onPress={() => addDigit('0')} />
        <DeleteBtn onPress={removeDigit} />
      </div>
    </div>
  );
};

export default PinInput;
