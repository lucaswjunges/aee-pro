import { SIZE_LEVELS } from "@aee-pro/shared";

interface SizeSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function SizeSlider({ value, onChange, disabled }: SizeSliderProps) {
  const current = SIZE_LEVELS.find((s) => s.level === value) ?? SIZE_LEVELS[2];

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Tamanho do Documento</label>
      <div className="relative">
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>Resumido</span>
          <span>Padrão</span>
          <span>Completo</span>
        </div>
      </div>
      <p className="text-sm">
        <span className="font-medium">Nível {current.level} — {current.name}</span>
        {" "}
        <span className="text-muted-foreground">({current.pages} páginas)</span>
      </p>
      {current.level >= 4 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Documentos grandes consomem mais tokens da sua chave de IA. Alguns providers gratuitos podem não suportar este tamanho.
        </p>
      )}
    </div>
  );
}
