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

  const buttonBaseStyle: React.CSSProperties = {
    fontSize: 32,
    fontWeight: 600,
    padding: 0,
    width: 70,
    height: 70,
    borderRadius: '50%',
    border: '3px solid #10b981',
    background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2), 0 2px 4px rgba(16, 185, 129, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    color: '#10b981',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  const buttonHoverStyle: React.CSSProperties = {
    transform: 'scale(1.05)',
    boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3), 0 4px 8px rgba(16, 185, 129, 0.15)',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#ffffff',
    borderColor: '#059669',
  };

  const buttonActiveStyle: React.CSSProperties = {
    transform: 'scale(0.95)',
    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.2), 0 1px 2px rgba(16, 185, 129, 0.1)',
    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    color: '#ffffff',
    borderColor: '#047857',
  };

  const deleteButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    color: '#dc2626',
    border: '3px solid #dc2626',
    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.2), 0 2px 4px rgba(220, 38, 38, 0.1)',
  };

  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      {/* PIN Indicators */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: 16, 
        marginBottom: 40,
        padding: '0 20px' 
      }}>
        {Array.from({ length }).map((_, i) => (
          <div 
            key={i} 
            style={{ 
              width: 16, 
              height: 16, 
              borderRadius: 8,
              background: i < digits.length 
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                : '#e5e7eb',
              boxShadow: i < digits.length 
                ? '0 2px 8px rgba(16, 185, 129, 0.3)' 
                : 'none',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: i < digits.length ? 'scale(1.1)' : 'scale(1)'
            }} 
          />
        ))}
      </div>

      {/* Numeric Keypad */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: 20, 
        maxWidth: 280, 
        margin: '0 auto',
        padding: '0 20px'
      }}>
        {[1,2,3,4,5,6,7,8,9].map((n) => (
          <button 
            key={n} 
            onClick={() => addDigit(String(n))}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, { transform: 'scale(1)', boxShadow: buttonBaseStyle.boxShadow, background: buttonBaseStyle.background, color: buttonBaseStyle.color, borderColor: '#10b981' })}
            onMouseDown={(e) => Object.assign(e.currentTarget.style, buttonActiveStyle)}
            onMouseUp={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
            style={buttonBaseStyle}
          >
            {n}
          </button>
        ))}
        
        {/* Empty space */}
        <div style={{ width: 70, height: 70 }} />
        
        {/* Zero button */}
        <button 
          onClick={() => addDigit('0')}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, { transform: 'scale(1)', boxShadow: buttonBaseStyle.boxShadow, background: buttonBaseStyle.background, color: buttonBaseStyle.color, borderColor: '#10b981' })}
          onMouseDown={(e) => Object.assign(e.currentTarget.style, buttonActiveStyle)}
          onMouseUp={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
          style={buttonBaseStyle}
        >
          0
        </button>
        
        {/* Delete button */}
        <button 
          onClick={removeDigit}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, { transform: 'scale(1.05)', boxShadow: '0 8px 20px rgba(220, 38, 38, 0.3), 0 4px 8px rgba(220, 38, 38, 0.15)', background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#ffffff', borderColor: '#b91c1c' })}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, { transform: 'scale(1)', boxShadow: deleteButtonStyle.boxShadow, background: deleteButtonStyle.background, color: deleteButtonStyle.color, borderColor: '#dc2626' })}
          onMouseDown={(e) => Object.assign(e.currentTarget.style, { transform: 'scale(0.95)', boxShadow: '0 2px 6px rgba(220, 38, 38, 0.2), 0 1px 2px rgba(220, 38, 38, 0.1)', background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)', color: '#ffffff', borderColor: '#991b1b' })}
          onMouseUp={(e) => Object.assign(e.currentTarget.style, { transform: 'scale(1.05)', boxShadow: '0 8px 20px rgba(220, 38, 38, 0.3), 0 4px 8px rgba(220, 38, 38, 0.15)', background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#ffffff', borderColor: '#b91c1c' })}
          style={deleteButtonStyle}
        >
          ⌫
        </button>
      </div>
    </div>
  );
};

export default PinInput;
