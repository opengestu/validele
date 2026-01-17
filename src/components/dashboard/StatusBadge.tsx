import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled' | 'paid' | 'in_delivery' | 'active' | 'inactive' | 'shipped' | 'processing';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  size = 'md', 
  className 
}) => {
  const statusConfig = {
    pending: {
      label: 'En attente',
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      dot: 'bg-yellow-400'
    },
    confirmed: {
      label: 'Confiré',
      color: 'bg-blue-100 text-blue-800 border-blue-200', 
      dot: 'bg-blue-400'
    },
    delivered: {
      label: 'Livré',
      color: 'bg-green-100 text-green-800 border-green-200',
      dot: 'bg-green-400'
    },
    cancelled: {
      label: 'Annulé',
      color: 'bg-red-100 text-red-800 border-red-200',
      dot: 'bg-red-400'
    },
    paid: {
      label: 'Payé',
      color: 'bg-purple-100 text-purple-800 border-purple-200',
      dot: 'bg-purple-400'
    },
    in_delivery: {
      label: 'En cours de livraison',
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      dot: 'bg-blue-400'
    },
    active: {
      label: 'Actif',
      color: 'bg-green-100 text-green-800 border-green-200',
      dot: 'bg-green-400'
    },
    inactive: {
      label: 'Inactif',
      color: 'bg-gray-100 text-gray-800 border-gray-200',
      dot: 'bg-gray-400'
    }
  };

  const sizeConfig = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-1.5 text-sm', 
    lg: 'px-3 py-2 text-base'
  };

  const dotSizeConfig = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-2.5 w-2.5'
  };

  const config = statusConfig[status];
  
  return (
    <span className={cn(
      "inline-flex items-center font-medium rounded-full border",
      config.color,
      sizeConfig[size],
      className
    )}>
      <span className={cn(
        "rounded-full mr-1.5",
        config.dot,
        dotSizeConfig[size]
      )} />
      {config.label}
    </span>
  );
};

export default StatusBadge;