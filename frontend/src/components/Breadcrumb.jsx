import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import clsx from 'clsx';

const Breadcrumb = ({ path = '/', onNavigate }) => {
  // Parse path jadi segments
  const segments = path.split('/').filter(Boolean);

  const handleClick = (index) => {
    if (index === -1) {
      onNavigate('/');
    } else {
      const newPath = '/' + segments.slice(0, index + 1).join('/');
      onNavigate(newPath);
    }
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 min-h-[36px]">
      {/* Home / Root */}
      <button
        onClick={() => handleClick(-1)}
        className={clsx(
          'flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0',
          'transition-all duration-150 touch-manipulation',
          segments.length === 0
            ? 'text-accent-400 bg-accent-500/15'
            : 'text-dark-300 hover:text-dark-100 hover:bg-dark-700 active:bg-dark-600'
        )}
        aria-label="Ke root"
      >
        <Home className="w-4 h-4" />
      </button>

      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <React.Fragment key={index}>
            <ChevronRight className="w-3.5 h-3.5 text-dark-600 flex-shrink-0" />
            <button
              onClick={() => !isLast && handleClick(index)}
              className={clsx(
                'text-sm font-medium px-2 py-1 rounded-lg flex-shrink-0',
                'transition-all duration-150 touch-manipulation',
                'max-w-[120px] truncate',
                isLast
                  ? 'text-dark-50 cursor-default'
                  : 'text-dark-300 hover:text-dark-100 hover:bg-dark-700 active:bg-dark-600 cursor-pointer'
              )}
              disabled={isLast}
              title={segment}
            >
              {segment}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default Breadcrumb;
