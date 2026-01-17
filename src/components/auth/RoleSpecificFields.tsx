
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import waveLogo from '@/assets/wave.png';
import orangeMoneyLogo from '@/assets/orange-money.png';

interface RoleSpecificFieldsProps {
  role: 'buyer' | 'vendor' | 'delivery';
  companyName: string;
  vehicleInfo: string;
  walletType?: string;
  onCompanyNameChange: (value: string) => void;
  onVehicleInfoChange: (value: string) => void;
  onWalletTypeChange?: (value: string) => void;
  disabled?: boolean;
}

const RoleSpecificFields = ({
  role,
  companyName,
  vehicleInfo,
  walletType = 'wave-senegal',
  onCompanyNameChange,
  onVehicleInfoChange,
  onWalletTypeChange,
  disabled = false
}: RoleSpecificFieldsProps) => {
  if (role === 'vendor') {
    return (
      <div className="space-y-3">
        <div>
          <Label htmlFor="companyName">Nom de l'entreprise</Label>
          <Input
            id="companyName"
            value={companyName}
            onChange={(e) => onCompanyNameChange(e.target.value)}
            placeholder="Nom de votre entreprise"
            disabled={disabled}
          />
        </div>

        <div>
          <Label htmlFor="walletType">Moyen de recevoir paiement</Label>
          <Select
            value={walletType}
            onValueChange={(value) => onWalletTypeChange && onWalletTypeChange(value)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wave-senegal">
                <div className="flex items-center gap-3">
                  <img src={waveLogo} alt="Wave" style={{ height: 36, width: 36, objectFit: 'contain', borderRadius: 6, background: '#fff' }} />
                  <span className="text-lg">Wave</span>
                </div>
              </SelectItem>
              <SelectItem value="orange-money-senegal">
                <div className="flex items-center gap-3">
                  <img src={orangeMoneyLogo} alt="Orange Money" style={{ height: 36, width: 36, objectFit: 'contain', borderRadius: 6, background: '#fff' }} />
                  <span className="text-lg">Orange Money</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (role === 'delivery') {
    return (
      <div>
        <Label htmlFor="vehicleInfo">Informations véhicule</Label>
        <Input
          id="vehicleInfo"
          value={vehicleInfo}
          onChange={(e) => onVehicleInfoChange(e.target.value)}
          placeholder="Type de véhicule, immatriculation..."
          disabled={disabled}
        />
      </div>
    );
  }

  return null;
};

export default RoleSpecificFields;
