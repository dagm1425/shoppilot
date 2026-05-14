import { type ReactNode } from 'react';
import { LuChevronDown } from 'react-icons/lu';
import { cn } from '../lib/utils';

type CatalogFilterSectionProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function CatalogFilterSection({
  title,
  open,
  onToggle,
  children,
}: CatalogFilterSectionProps) {
  return (
    <section className="border-t border-border py-5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between"
        aria-expanded={open}
      >
        <h3 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
          {title}
        </h3>
        <LuChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform duration-200',
            open ? 'rotate-180' : 'rotate-0',
          )}
          aria-hidden="true"
        />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
