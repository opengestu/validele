import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar, Header } from './index';

interface DashboardUser {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
  };
}

interface DashboardLayoutProps {
  children: ReactNode;
  userRole: 'vendor' | 'buyer' | 'delivery';
  user: DashboardUser;
  onSignOut: () => void;
  sidebarOpen?: boolean;
  setSidebarOpen?: (open: boolean) => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  userRole,
  user,
  onSignOut,
  sidebarOpen = false,
  setSidebarOpen
}) => {
  const roleConfig = {
    vendor: {
      color: 'validel-vendor',
      gradient: 'from-green-500 to-emerald-500',
      title: 'Espace Vendeur'
    },
    buyer: {
      color: 'validel-buyer', 
      gradient: 'from-green-500 to-emerald-500',
      title: 'Espace Client'
    },
    delivery: {
      color: 'validel-delivery',
      gradient: 'from-green-500 to-emerald-500', 
      title: 'Espace Livreur'
    }
  };

  const config = roleConfig[userRole];

  return (
    <div className="min-h-screen bg-gray-50/30">
      {/* Sidebar */}
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen?.(false)}
        userRole={userRole}
        config={config}
      />
      
      {/* Main Content */}
      <div className={cn(
        "transition-all duration-300 ease-in-out",
        sidebarOpen ? "lg:ml-64" : "lg:ml-16"
      )}>
        {/* Header */}
        <Header 
          user={user}
          onSignOut={onSignOut}
          onMenuClick={() => setSidebarOpen?.(!sidebarOpen)}
          config={config}
        />
        
        {/* Content */}
        <main className="p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 lg:hidden z-40"
          onClick={() => setSidebarOpen?.(false)}
        />
      )}
    </div>
  );
};

export default DashboardLayout;