"use client";

import type { FC } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseSupportContent } from "@/lib/supportContent";

export type SupportMessageContentProps = {
  content: string;
  /** Класс для текстовых частей — наследует оформление сообщения. */
  className?: string;
};

/**
 * Текст сообщения поддержки с превью прикреплённых файлов.
 * Без состояния и хуков — годится и в реактивной ленте, и в админке.
 */
export const SupportMessageContent: FC<SupportMessageContentProps> = ({
  content,
  className,
}) => {
  const parts = parseSupportContent(content);
  if (parts.length === 0) return null;

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <p key={index} className={className}>
              {part.text}
            </p>
          );
        }

        if (part.type === "image") {
          return (
            <a
              key={index}
              href={part.url}
              target="_blank"
              rel="noreferrer"
              className="block max-w-full cursor-zoom-in"
            >
              <img
                src={part.url}
                alt="Прикреплённый скриншот"
                loading="lazy"
                className="mt-1 max-h-72 w-auto max-w-full rounded-[10px] border border-white/15"
              />
            </a>
          );
        }

        return (
          <a
            key={index}
            href={part.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "mt-1 inline-flex max-w-full items-center gap-2 rounded-[10px] border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-sky-200 hover:bg-white/10",
              className,
            )}
          >
            <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{part.label}</span>
          </a>
        );
      })}
    </>
  );
};
