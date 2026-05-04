import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  hideWhenGlobal?: boolean;
}

const sizeClasses = {
  sm: 'h-12 w-12',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
  xl: 'h-32 w-32',
};

export function Spinner({ size = 'lg', className, hideWhenGlobal = true }: SpinnerProps) {
  // If requested, hide this spinner when a global overlay spinner is active
  if (hideWhenGlobal && typeof window !== 'undefined' && document.body.classList.contains('has-global-spinner')) {
    return null;
  }

  // Add a helper class so global CSS can hide local spinners when an overlay is active
  const helperClass = hideWhenGlobal ? 'local-spinner' : 'global-spinner-exempt';

  // Spinner arc style — white arc on dark background, no background circle
  return (
    <div className={cn("relative flex items-center justify-center", sizeClasses[size], helperClass, className)}>
      <svg
        className="animate-[arc-spin_1.1s_ease-in-out_infinite]"
        viewBox="0 0 66 66"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="33"
          cy="33"
          r="28"
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="120 200"
          strokeDashoffset="0"
          className="animate-[arc-dash_1.4s_ease-in-out_infinite]"
        />
      </svg>
      <style>{`
        @keyframes arc-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes arc-dash {
          0%   { stroke-dasharray: 1 200; stroke-dashoffset: 0; }
          50%  { stroke-dasharray: 100 200; stroke-dashoffset: -30; }
          100% { stroke-dasharray: 100 200; stroke-dashoffset: -124; }
        }
      `}</style>
    </div>
  );
}

export default Spinner;
