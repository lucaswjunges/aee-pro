import { HEAT_LEVELS } from "@aee-pro/shared";

interface HeatSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function HeatSlider({ value, onChange, disabled }: HeatSliderProps) {
  const current = HEAT_LEVELS.find((h) => h.level === value) ?? HEAT_LEVELS[2];

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Estilo Visual</label>
      <div className="relative">
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: `linear-gradient(to right, #3b82f6, #8b5cf6, #ef4444)`,
          }}
        />
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>Conservador</span>
          <span>Moderado</span>
          <span>Máximo</span>
        </div>
      </div>
      <p className="text-sm">
        <span className="font-medium">Nível {current.level} — {current.name}</span>
        <br />
        <span className="text-xs text-muted-foreground">{current.description}</span>
      </p>
      {current.level >= 4 && (
        <p className="text-xs text-muted-foreground">
          Gera mais código LaTeX e consome mais tokens.
        </p>
      )}
    </div>
  );
}
