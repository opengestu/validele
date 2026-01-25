import React, { useState } from 'react';

interface PinInputProps {
  length?: number;
  onComplete?: (pin: string) => void;
}

const PinInput: React.FC<PinInputProps> = ({ length = 4, onComplete }) => {
  const [digits, setDigits] = useState<string[]>([]);

  const addDigit = (d: string) => {
    if (digits.length >= length) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === length && onComplete) onComplete(next.join(''));
  };

  const removeDigit = () => {
    setDigits(digits.slice(0, -1));
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
        {Array.from({ length }).map((_, i) => (
          <div key={i} style={{ width: 18, height: 18, borderRadius: 9, background: i < digits.length ? '#aee9ff' : '#eaeaea' }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, width: 240, margin: '0 auto' }}>
        {[1,2,3,4,5,6,7,8,9].map((n) => (
          <button key={n} onClick={() => addDigit(String(n))} style={{ fontSize: 28, padding: 12 }}>{n}</button>
        ))}
        <div />
        <button onClick={() => addDigit('0')} style={{ fontSize: 28, padding: 12 }}>0</button>
        <button onClick={removeDigit} style={{ fontSize: 20, padding: 12 }}>⌫</button>
      </div>
    </div>
  );
};

export default PinInput;
