import type { ServiceField } from '../types'

interface FormFieldProps {
  field: ServiceField
  value: string
  onChange: (value: string) => void
  error?: string
}

const baseInputClasses =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[calc(15px_*_var(--text-scale))] text-navy-950 placeholder:text-slate-500 focus:border-navy-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/15'

export default function FormField({ field, value, onChange, error }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={field.id} className="mb-1.5 block text-[calc(14px_*_var(--text-scale))] font-semibold text-navy-950">
        {field.label}
        {field.required && <span className="ml-0.5 text-gold-600">*</span>}
      </label>

      {field.type === 'select' ? (
        <select
          id={field.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInputClasses} appearance-none`}
        >
          <option value="" disabled>
            Select {field.label.toLowerCase()}
          </option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          id={field.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${baseInputClasses} resize-none`}
        />
      ) : (
        <input
          id={field.id}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseInputClasses}
        />
      )}

      {field.helper && !error && <p className="mt-1 text-[calc(12.5px_*_var(--text-scale))] text-slate-500">{field.helper}</p>}
      {error && <p className="mt-1 text-[calc(12.5px_*_var(--text-scale))] font-medium text-rose-600">{error}</p>}
    </div>
  )
}
