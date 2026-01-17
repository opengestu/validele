import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  Package, 
  ShoppingCart, 
  BarChart3, 
  User, 
  Search, 
  Clock,
  Truck,
  QrCode,
  CheckCircle,
  Home
} from 'lucide-react';
import validelLogo from '@/assets/validel-logo.png';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'vendor' | 'buyer' | 'delivery';
  config: {
    color: string;
    gradient: string;
    title: string;
  };
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, userRole, config }) => {
  const location = useLocation();

  const menuItems = {
    vendor: [
      { icon: BarChart3, label: 'Vue d\'ensemble', path: '/vendor', key: 'overview' },
      { icon: Package, label: 'Mes Produits', path: '/vendor#products', key: 'products' },
      { icon: ShoppingCart, label: 'Commandes', path: '/vendor#orders', key: 'orders' },
      { icon: User, label: 'Profil', path: '/vendor#profile', key: 'profile' }
    ],
    buyer: [
      { icon: Home, label: 'Accueil', path: '/buyer', key: 'overview' },
      { icon: Search, label: 'Rechercher', path: '/buyer#search', key: 'search' },
      { icon: ShoppingCart, label: 'Mes Commandes', path: '/buyer#orders', key: 'orders' },
      { icon: User, label: 'Profil', path: '/buyer#profile', key: 'profile' }
    ],
    delivery: [
      { icon: Truck, label: 'Tableau de bord', path: '/delivery', key: 'overview' },
      { icon: Package, label: 'Livraisons', path: '/delivery#deliveries', key: 'deliveries' },
      { icon: QrCode, label: 'Scanner QR', path: '/delivery#scanner', key: 'scanner' },
      { icon: CheckCircle, label: 'Historique', path: '/delivery#history', key: 'history' },
      { icon: User, label: 'Profil', path: '/delivery#profile', key: 'profile' }
    ]
  };

  const items = menuItems[userRole];

  return (
    <div className={cn(
      "fixed left-0 top-0 h-full bg-white shadow-xl z-50 transition-all duration-300 ease-in-out border-r border-gray-200",
      isOpen ? "w-64" : "w-16 lg:w-16"
    )}>
      {/* Logo */}
      <div className="flex items-center p-4 border-b border-gray-100">
        {userRole !== 'delivery' && (
          <img src={validelLogo} alt="Validèl" className="w-10 h-10 object-contain rounded-lg shadow-md bg-white" />
        )}
        {isOpen && (
          <div className="ml-3">
            <h2 className="text-lg font-bold text-gray-900">Validèl</h2>
            <p className={cn("text-xs font-medium", `text-${config.color}`)}>
              {config.title}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.hash === item.path.split('#')[1];
            
            return (
              <li key={item.key}>
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group",
                    isActive 
                      ? `bg-${config.color}/10 text-${config.color} border-r-2 border-${config.color}`
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className={cn(
                    "h-5 w-5 flex-shrink-0",
                    isActive && `text-${config.color}`
                  )} />
                  {isOpen && (
                    <span className="ml-3 font-medium text-sm">
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100">
        <Link 
          to="/"
          className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <Home className="h-5 w-5" />
          {isOpen && <span className="ml-3 text-sm font-medium">Retour accueil</span>}
        </Link>
      </div>
    </div>
  );
};

export default Sidebar;