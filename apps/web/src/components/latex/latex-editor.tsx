interface LatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function LatexEditor({ value, onChange, disabled, className }: LatexEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      spellCheck={false}
      className={`w-full h-full min-h-[400px] font-mono text-xs leading-relaxed p-3 bg-muted/30 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${className ?? ""}`}
      placeholder="Código LaTeX..."
    />
  );
}
