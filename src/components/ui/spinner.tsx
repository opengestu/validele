import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  hideWhenGlobal?: boolean;
}

const sizeClasses = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
};

export function Spinner({ size = 'lg', className, hideWhenGlobal = true }: SpinnerProps) {
  // If requested, hide this spinner when a global overlay spinner is active
  if (hideWhenGlobal && typeof window !== 'undefined' && document.body.classList.contains('has-global-spinner')) {
    return null;
  }

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <svg
        className="animate-spin"
        viewBox="0 0 50 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="50%" stopColor="#6b7280" />
            <stop offset="100%" stopColor="#d1d5db" />
          </linearGradient>
        </defs>
        <circle
          cx="25"
          cy="25"
          r="20"
          stroke="url(#spinnerGradient)"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="90 150"
        />
      </svg>
    </div>
  );
}

export default Spinner;
