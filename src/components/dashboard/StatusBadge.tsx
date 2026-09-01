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
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      dot: 'bg-amber-500'
    },
    confirmed: {
      label: 'Confirmé',
      color: 'bg-muted text-foreground border-border',
      dot: 'bg-foreground'
    },
    delivered: {
      label: 'Livrée',
      color: 'bg-green-50 text-green-700 border-green-200',
      dot: 'bg-green-600'
    },

    cancelled: {
      label: 'Annulé',
      color: 'bg-red-50 text-red-700 border-red-200',
      dot: 'bg-red-500'
    },
    paid: {
      label: 'Payé',
      color: 'bg-green-50 text-green-700 border-green-200',
      dot: 'bg-green-600'
    },
    in_delivery: {
      label: 'En cours de livraison',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-500'
    },
    active: {
      label: 'Actif',
      color: 'bg-green-50 text-green-700 border-green-200',
      dot: 'bg-green-600'
    },
    inactive: {
      label: 'Inactif',
      color: 'bg-muted text-muted-foreground border-border',
      dot: 'bg-muted-foreground'
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