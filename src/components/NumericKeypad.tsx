import React, { useState } from 'react';

type Props = {
  onDigit: (d: string) => void;
  onBack?: () => void;
  onSubmit?: () => void;
  showSubmit?: boolean;
};

const buttonBaseStyle: React.CSSProperties = {
  width: 70,
  height: 70,
  borderRadius: '50%',
  border: '3px solid #10b981',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 28,
  fontWeight: '600',
  cursor: 'pointer',
  userSelect: 'none',
  background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
  color: '#10b981',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  transition: 'all 0.2s ease',
};

const buttonHoverStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  color: '#ffffff',
  transform: 'scale(1.05)',
  boxShadow: '0 6px 16px rgba(16, 185, 129, 0.3)',
};

const buttonActiveStyle: React.CSSProperties = {
  transform: 'scale(0.95)',
  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)',
};

const deleteButtonBaseStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  border: '3px solid #ef4444',
  color: '#ef4444',
};

const deleteButtonHoverStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
  color: '#ffffff',
  transform: 'scale(1.05)',
  boxShadow: '0 6px 16px rgba(239, 68, 68, 0.3)',
};

function DigitButton({ digit, onClick }: { digit: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);

  return (
    <div
      style={{
        ...buttonBaseStyle,
        ...(hover ? buttonHoverStyle : {}),
        ...(active ? buttonActiveStyle : {}),
      }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
    >
      {digit}
    </div>
  );
}

function DeleteButton({ onClick }: { onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);

  return (
    <div
      style={{
        ...deleteButtonBaseStyle,
        ...(hover ? deleteButtonHoverStyle : {}),
        ...(active ? buttonActiveStyle : {}),
      }}
      onClick={() => onClick && onClick()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
    >
      ⌫
    </div>
  );
}

export default function NumericKeypad({ onDigit, onBack, onSubmit, showSubmit }: Props) {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: 20,
        maxWidth: 280 
      }}>
        {digits.map(d => (
          <DigitButton key={d} digit={d} onClick={() => onDigit(d)} />
        ))}
        <div style={{ width: 70, height: 70 }} />
        <DigitButton digit="0" onClick={() => onDigit('0')} />
        <DeleteButton onClick={onBack} />
      </div>
      {showSubmit && (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => onSubmit && onSubmit()} style={{ padding: '10px 40px', borderRadius: 28, background: '#10b981', border: 'none', fontSize: 18, color: '#ffffff', fontWeight: '600' }}>
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
