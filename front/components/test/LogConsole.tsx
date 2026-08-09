'use client';

import { useEffect, useRef } from 'react';
import { Terminal, Trash2 } from 'lucide-react';

export type LogLevel = 'info' | 'success' | 'error' | 'request' | 'response' | 'system';

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  detail?: unknown;
  at: string;
}

const LEVEL_STYLE: Record<LogLevel, { dot: string; text: string; label: string }> = {
  info: { dot: 'bg-sky-400', text: 'text-sky-300', label: 'INFO' },
  success: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'OK' },
  error: { dot: 'bg-red-400', text: 'text-red-300', label: 'ERR' },
  request: { dot: 'bg-blue-400', text: 'text-blue-300', label: 'REQ' },
  response: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'RES' },
  system: { dot: 'bg-zinc-400', text: 'text-zinc-400', label: 'SYS' },
};

function formatDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

export function LogConsole({
  logs,
  onClear,
  maxHeight = 'h-72',
}: {
  logs: LogEntry[];
  onClear?: () => void;
  maxHeight?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  return (
    <div className="rounded-card border border-zinc-800 bg-black/50 overflow-hidden">
      <div className="flex items-center justify-between px-md py-xs border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Логи</span>
          <span className="text-xs text-zinc-600">{logs.length}</span>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Очистить
          </button>
        )}
      </div>
      <div className={`${maxHeight} overflow-y-auto px-md py-sm space-y-1.5 font-mono text-xs`}>
        {logs.length === 0 && (
          <p className="text-zinc-700">Пусто — запустите проверку, чтобы увидеть логи.</p>
        )}
        {logs.map((log) => {
          const style = LEVEL_STYLE[log.level];
          return (
            <div key={log.id} className="leading-relaxed break-words">
              <div className="flex items-start gap-2">
                <span className="text-zinc-700 whitespace-nowrap">{log.at}</span>
                <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${style.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-pill shrink-0 ${style.dot}`} />
                  <span className="font-bold">{style.label}</span>
                </span>
                <span className="text-zinc-300">{log.message}</span>
              </div>
              {log.detail !== undefined && (
                <pre className="mt-1 ml-4 pl-3 border-l border-zinc-800 text-zinc-500 whitespace-pre-wrap">
                  {formatDetail(log.detail)}
                </pre>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
