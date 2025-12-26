
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RoleSpecificFieldsProps {
  role: 'buyer' | 'vendor' | 'delivery';
  companyName: string;
  vehicleInfo: string;
  onCompanyNameChange: (value: string) => void;
  onVehicleInfoChange: (value: string) => void;
  disabled?: boolean;
}

const RoleSpecificFields = ({
  role,
  companyName,
  vehicleInfo,
  onCompanyNameChange,
  onVehicleInfoChange,
  disabled = false
}: RoleSpecificFieldsProps) => {
  if (role === 'vendor') {
    return (
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
