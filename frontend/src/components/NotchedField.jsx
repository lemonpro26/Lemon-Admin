import React from 'react';

// Fetchapro-style outlined input with a "notch" label sitting on the border.
// Implemented with a native <fieldset>/<legend> for a pixel-accurate notch.
export const NotchedField = React.forwardRef(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        <fieldset
          className={`relative rounded-xl border-2 bg-white px-3.5 pb-3 pt-1.5 transition-colors ${
            error ? 'border-red-400' : 'border-slate-900/85 focus-within:border-[#EF4444]'
          } ${className}`}
        >
          <legend className="px-1.5 text-[13px] font-medium text-slate-600">{label}</legend>
          <input
            ref={ref}
            className="w-full bg-transparent text-lg text-slate-900 outline-none placeholder:text-slate-400"
            {...props}
          />
        </fieldset>
        {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);
NotchedField.displayName = 'NotchedField';
