import React from 'react';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import QRCode from 'qrcode';

interface SimpleQRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

const SimpleQRCode: React.FC<SimpleQRCodeProps> = ({ value, size = 240, className }) => {
  const [svg, setSvg] = React.useState<string>('');

  React.useEffect(() => {
    QRCode.toString(value, { type: 'svg', width: size, margin: 1 }, (err, svgString) => {
      if (!err && svgString) setSvg(svgString);
    });
  }, [value, size]);

  return (
    <div
      className={className}
      style={{ width: size, height: size, display: 'inline-block' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default SimpleQRCode;
