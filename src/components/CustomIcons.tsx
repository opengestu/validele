// Téléphone
type IconProps = {
  className?: string;
  size?: number;
};

export const PhoneIcon = ({ className, size = 16 }: IconProps) => (
  <img
    src="/assets/phone-icon.png"
    alt="Appeler"
    className={className}
    style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }}
  />
);

export const WhatsAppIcon = ({ className, size = 16 }: IconProps) => (
  <img
    src="/assets/whatsapp-icon.png"
    alt="WhatsApp"
    className={className}
    style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }}
  />
);
