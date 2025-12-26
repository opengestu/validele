import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Menu, 
  Bell, 
  User, 
  LogOut, 
  Settings,
  ChevronDown
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  user: {
    id: string;
    email?: string;
    user_metadata?: {
      full_name?: string;
    };
  };
  onSignOut: () => void;
  onMenuClick: () => void;
  config: {
    color: string;
    gradient: string;
    title: string;
  };
}

const Header: React.FC<HeaderProps> = ({ user, onSignOut, onMenuClick, config }) => {
  const [notifications] = useState(3); // Mock notifications count

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Utilisateur';
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left Side - Menu Button */}
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onMenuClick}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          {/* Desktop Title */}
          <div className="hidden lg:block">
            <h1 className="text-xl font-semibold text-gray-900">
              {config.title}
            </h1>
          </div>
        </div>

        {/* Right Side - Notifications & Profile */}
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="h-5 w-5" />
            {notifications > 0 && (
              <span className={cn(
                "absolute -top-1 -right-1 h-4 w-4 text-xs font-bold text-white rounded-full flex items-center justify-center",
                `bg-${config.color}`
              )}>
                {notifications}
              </span>
            )}
          </Button>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center space-x-2 hover:bg-gray-50">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium bg-gradient-to-br",
                  config.gradient
                )}>
                  {userInitial}
                </div>
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-medium text-gray-900">
                    {userName}
                  </span>
                  <span className="text-xs text-gray-500">
                    {user?.email}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </Button>
            </DropdownMenuTrigger>
            
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Mon Compte</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>Profil</span>
              </DropdownMenuItem>
              
              <DropdownMenuItem className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Paramètres</span>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                className="cursor-pointer text-red-600 focus:text-red-600"
                onClick={onSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Se déconnecter</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;