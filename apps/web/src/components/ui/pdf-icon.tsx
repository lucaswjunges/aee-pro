import { cn } from "@/lib/utils";

/** Classic PDF file icon — red with "PDF" label and folded corner */
export function PdfIcon({ size = "sm", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizeClasses = {
    sm: "w-5 h-6 text-[7px] rounded",
    md: "w-7 h-8 text-[8px] rounded-md",
    lg: "w-10 h-12 text-[10px] rounded-lg",
  };

  const cornerClasses = {
    sm: "w-1.5 h-1.5 rounded-bl-sm",
    md: "w-2 h-2 rounded-bl-sm",
    lg: "w-2.5 h-2.5 rounded-bl-md",
  };

  return (
    <div
      className={cn(
        sizeClasses[size],
        "flex items-end justify-center pb-[2px] shrink-0 relative overflow-hidden border font-bold",
        "bg-red-500/15 dark:bg-red-500/25",
        "border-red-400/30 dark:border-red-500/40",
        "text-red-600 dark:text-red-400",
        className
      )}
    >
      <div
        className={cn(
          "absolute top-0 right-0 bg-white/40 dark:bg-white/20",
          cornerClasses[size]
        )}
      />
      <span className="uppercase leading-none">PDF</span>
    </div>
  );
}
