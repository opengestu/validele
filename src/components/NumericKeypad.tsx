import React from 'react';

type Props = {
  onDigit: (d: string) => void;
  onBack?: () => void;
  onSubmit?: () => void;
  showSubmit?: boolean;
};

const buttonStyle: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 28,
  cursor: 'pointer',
  userSelect: 'none',
};

export default function NumericKeypad({ onDigit, onBack, onSubmit, showSubmit }: Props) {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {digits.map(d => (
          <div key={d} style={buttonStyle} onClick={() => onDigit(d)}>
            {d}
          </div>
        ))}
        <div style={{ height: 72 }} />
        <div style={buttonStyle} onClick={() => onDigit('0')}>
          0
        </div>
        <div style={buttonStyle} onClick={() => onBack && onBack()}>
          ⌫
        </div>
      </div>
      {showSubmit && (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => onSubmit && onSubmit()} style={{ padding: '10px 40px', borderRadius: 28, background: '#aeeffd', border: 'none', fontSize: 18 }}>
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
