// Dashboard Layout Components
export { default as DashboardLayout } from './DashboardLayout';
export { default as Sidebar } from './Sidebar';
export { default as Header } from './Header';

// Dashboard UI Components  
export { default as StatsCard } from './StatsCard';
export { default as StatusBadge } from './StatusBadge';
export { default as Breadcrumbs } from './Breadcrumbs';

// Types
export interface DashboardUser {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
  };
}

export interface RoleConfig {
  color: string;
  gradient: string;
  title: string;
}