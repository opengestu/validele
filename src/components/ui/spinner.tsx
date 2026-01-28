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

  // Add a helper class so global CSS can hide local spinners when an overlay is active
  const helperClass = hideWhenGlobal ? 'local-spinner' : 'global-spinner-exempt';

  // Spinner fluide noir et blanc, style "eau"
  return (
    <div className={cn("relative flex items-center justify-center", sizeClasses[size], helperClass, className)}>
      <style>
        {`
          @keyframes water-spin {
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <svg
        style={{
          animation: 'water-spin 0.9s cubic-bezier(0.4,0.2,0.2,1) infinite',
          transformOrigin: '50% 50%'
        }}
        viewBox="0 0 50 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="waterSpinnerGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#111" />
            <stop offset="100%" stopColor="#fff" />
          </linearGradient>
        </defs>
        <circle
          cx="25"
          cy="25"
          r="20"
          stroke="url(#waterSpinnerGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="80 120"
          strokeDashoffset="0"
        />
      </svg>
    </div>
  );
}

export default Spinner;
