import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeoOption { id: number; nombre: string; }

interface Props {
  options: GeoOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  /** Estilo "píldora": recuadro redondeado, borde verde y texto centrado. */
  pill?: boolean;
}

export function GeoCombobox({
  options, value, onChange,
  placeholder = 'Seleccionar...', disabled, loading, error, pill,
}: Props) {
  const [open, setOpen]             = useState(false);
  const [search, setSearch]         = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLUListElement>(null);

  const selected = options.find(o => String(o.id) === value);

  const filtered = search.trim()
    ? options.filter(o => o.nombre.toUpperCase().includes(search.toUpperCase()))
    : options;

  // Cerrar al hacer click o toque fuera
  useEffect(() => {
    function handle(e: Event) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, []);

  // Foco al input y scroll para que el dropdown sea visible al abrir
  useEffect(() => {
    if (open) {
      setHighlighted(0);
      setTimeout(() => {
        inputRef.current?.focus();
        containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 10);
    }
  }, [open]);

  // Scroll al elemento resaltado
  useEffect(() => {
    const item = listRef.current?.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'Escape':
        setOpen(false);
        setSearch('');
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted(h => Math.min(h + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted(h => Math.max(h - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlighted]) select(filtered[highlighted]);
        break;
    }
  }

  function select(opt: GeoOption) {
    onChange(String(opt.id));
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Botón disparador */}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => { if (!disabled && !loading) setOpen(o => !o); }}
        className={cn(
          'relative w-full flex items-center px-3 border text-sm transition-colors',
          'bg-white focus:outline-none',
          pill ? 'h-9 rounded-full justify-center text-center' : 'h-9 rounded-lg justify-between text-left',
          error
            ? 'border-red-400 focus:border-red-400'
            : pill
              ? 'border-agro-500 hover:border-agro-600'
              : 'border-stone-200 hover:border-stone-300',
          (disabled || loading) && 'opacity-50 cursor-not-allowed',
          open && !error && 'border-agro-400 ring-2 ring-agro-500/20',
        )}
      >
        <span className={cn(pill && 'px-6 truncate', selected ? 'text-stone-800' : 'text-stone-400')}>
          {loading ? 'Cargando...' : (selected?.nombre ?? placeholder)}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-stone-400 flex-shrink-0 transition-transform duration-150',
            pill && 'absolute right-4',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-stone-200 shadow-xl overflow-hidden">
          {/* Buscador */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100">
            <Search className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setHighlighted(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Buscar..."
              className="flex-1 text-sm outline-none placeholder:text-stone-300 text-stone-800 bg-transparent"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setHighlighted(0); inputRef.current?.focus(); }}
                className="text-stone-300 hover:text-stone-500 text-xs leading-none"
              >
                ✕
              </button>
            )}
          </div>

          {/* Lista */}
          <ul ref={listRef} className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-stone-400 text-center">
                Sin resultados para "{search}"
              </li>
            ) : (
              filtered.map((opt, i) => (
                <li
                  key={opt.id}
                  onMouseDown={() => select(opt)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors',
                    i === highlighted
                      ? 'bg-agro-50 text-agro-700'
                      : 'text-stone-700 hover:bg-stone-50',
                    String(opt.id) === value && 'font-semibold',
                  )}
                >
                  <span>{opt.nombre}</span>
                  {String(opt.id) === value && (
                    <Check className="w-3.5 h-3.5 text-agro-600 flex-shrink-0" />
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
