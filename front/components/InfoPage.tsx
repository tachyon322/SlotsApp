import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { PageContainer } from "@/components/PageContainer";

export type InfoSection = {
  title: string;
  content: string[];
};

export function InfoPage({
  icon: Icon,
  title,
  intro,
  updated,
  sections,
  outro,
  related,
}: {
  icon: LucideIcon;
  title: string;
  intro: string;
  /** Дата последней редакции документа — берётся из lib/legal.ts. */
  updated?: string;
  sections: InfoSection[];
  /** Заключительный абзац, выделенный рамкой (например, акцепт документа). */
  outro?: string;
  /** Перелинковка со связанными документами и разделами. */
  related?: { href: string; label: string }[];
}) {
  return (
    <PageContainer>
      <div className="flex items-center gap-xs">
        <span className="flex h-10 w-10 items-center justify-center rounded-panel bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
          <Icon className="h-5 w-5 text-blue-400" />
        </span>
        <h1 className="text-xl font-bold text-white">{title}</h1>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {intro}
      </p>

      {updated && (
        <p className="mt-2 text-xs text-muted-foreground/70">
          Редакция от {updated}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-panel border border-white/8 bg-white/[0.02] p-card"
          >
            <h2 className="text-base font-bold text-white">
              {section.title}
            </h2>
            <div className="mt-2 space-y-2">
              {section.content.map((paragraph, i) => (
                <p
                  key={i}
                  className="text-sm leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      {outro && (
        <section className="mt-4 rounded-panel border border-blue-500/20 bg-blue-500/[0.06] p-card">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {outro}
          </p>
        </section>
      )}

      {related && related.length > 0 && (
        <nav
          className="mt-4 flex flex-wrap gap-xs"
          aria-label="Связанные документы"
        >
          {related.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-control border border-white/8 bg-white/[0.02] px-sm py-2xs text-xs font-medium text-muted-foreground transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </PageContainer>
  );
}
