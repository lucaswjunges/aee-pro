import { useEffect, useRef } from "react";
import { Terminal as TermIcon } from "lucide-react";

interface TerminalProps {
  logs: TerminalLog[];
}

export interface TerminalLog {
  id: string;
  type: "info" | "success" | "error" | "warning" | "command";
  message: string;
  timestamp: string;
}

export function Terminal({ logs }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800">
        <TermIcon className="h-3 w-3 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-500">Terminal</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <span className="text-zinc-600">
            Logs de compilação aparecerão aqui...
          </span>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2">
              <span className="text-zinc-600 flex-shrink-0">
                {new Date(log.timestamp).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span
                className={
                  log.type === "error"
                    ? "text-red-400"
                    : log.type === "success"
                      ? "text-green-400"
                      : log.type === "warning"
                        ? "text-yellow-400"
                        : log.type === "command"
                          ? "text-blue-400"
                          : "text-zinc-300"
                }
              >
                {log.type === "command" ? `$ ${log.message}` : log.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
