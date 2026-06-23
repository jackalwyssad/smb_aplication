import React from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-10 h-10',
  xl: 'w-14 h-14',
};

const LoadingSpinner = ({ size = 'md', className, text }) => {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3', className)}>
      <Loader2 className={clsx('animate-spin text-accent-500', sizeMap[size])} />
      {text && (
        <p className="text-dark-300 text-sm font-medium animate-pulse-subtle">{text}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
