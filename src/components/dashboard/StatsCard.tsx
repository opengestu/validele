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
    vendor: { bg: 'bg-primary', text: 'text-foreground', bgLight: 'bg-muted' },
    buyer: { bg: 'bg-primary', text: 'text-foreground', bgLight: 'bg-muted' },
    delivery: { bg: 'bg-primary', text: 'text-foreground', bgLight: 'bg-muted' },
    default: { bg: 'bg-primary', text: 'text-muted-foreground', bgLight: 'bg-muted' }
  };

  const config = colorConfig[color];

  const getTrendColor = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up': return 'text-success';
      case 'down': return 'text-destructive';
      case 'neutral': return 'text-muted-foreground';
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
    <Card className={cn("hover:shadow-premium transition-all duration-300", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={cn(
          "h-10 w-10 rounded-xl flex items-center justify-center shadow-premium-sm",
          config.bg
        )}>
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold text-foreground">
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