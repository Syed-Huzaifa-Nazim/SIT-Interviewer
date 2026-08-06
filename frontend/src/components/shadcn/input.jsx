import * as React from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-md border border-input bg-card text-foreground shadow-xs transition-[color,box-shadow,border-color] outline-none ' +
  'placeholder:text-muted-foreground/70 ' +
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-invalid:border-destructive aria-invalid:ring-destructive/25';

const Input = React.forwardRef(function Input({ className, type = 'text', ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        fieldBase,
        'h-9 px-3 py-1 text-sm',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className
      )}
      {...props}
    />
  );
});

const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(fieldBase, 'min-h-20 px-3 py-2 text-sm field-sizing-content', className)}
      {...props}
    />
  );
});

const Label = React.forwardRef(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      data-slot="label"
      className={cn('text-sm font-medium text-foreground select-none', className)}
      {...props}
    />
  );
});

/** Native <select> styled to match Input — lighter than a Radix Select where the
 *  extra keyboard/portal behaviour of a full combobox is not needed. */
const NativeSelect = React.forwardRef(function NativeSelect({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      data-slot="native-select"
      className={cn(fieldBase, 'h-9 px-3 py-1 text-sm cursor-pointer appearance-none pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '1rem',
      }}
      {...props}
    >
      {children}
    </select>
  );
});

export { Input, Textarea, Label, NativeSelect };
