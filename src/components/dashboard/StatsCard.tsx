import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: string;
    trend: 'up' | 'down' | 'neutral';
  };
  icon: LucideIcon;
  color?: 'vendor' | 'buyer' | 'delivery' | 'default';
  className?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  color = 'default',
  className
}) => {
  const colorConfig = {
    vendor: {
      bg: 'from-black to-neutral-800',
      text: 'text-black',
      bgLight: 'bg-black/5'
    },
    buyer: {
      bg: 'from-black to-neutral-800', 
      text: 'text-black',
      bgLight: 'bg-black/5'
    },
    delivery: {
      bg: 'from-black to-neutral-800',
      text: 'text-black', 
      bgLight: 'bg-black/5'
    },
    default: {
      bg: 'from-gray-500 to-gray-600',
      text: 'text-gray-600',
      bgLight: 'bg-gray-50'
    }
  };

  const config = colorConfig[color];

  const getTrendColor = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up': return 'text-black';
      case 'down': return 'text-red-600';
      case 'neutral': return 'text-gray-600';
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      case 'neutral': return '→';
    }
  };

  return (
    <Card className={cn("hover:shadow-lg transition-all duration-300", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">
          {title}
        </CardTitle>
        <div className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center bg-gradient-to-br shadow-sm",
          config.bg
        )}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold text-gray-900">
            {value}
          </div>
          
          {change && (
            <div className={cn(
              "text-xs font-medium flex items-center",
              getTrendColor(change.trend)
            )}>
              <span className="mr-1">{getTrendIcon(change.trend)}</span>
              {change.value}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StatsCard;