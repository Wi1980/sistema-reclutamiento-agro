import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: string;
  className?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = '90vh',
  className,
}: BottomSheetProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Sheet panel */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl',
          'transform transition-transform duration-300 ease-out',
          'flex flex-col',
          open ? 'translate-y-0' : 'translate-y-full',
          className
        )}
        style={{ maxHeight }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-stone-200 rounded-full" />
        </div>

        {/* Title bar */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 flex-shrink-0">
            <h3 className="font-bold text-stone-900 text-base">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          {children}
        </div>
      </div>
    </div>
  );
}
