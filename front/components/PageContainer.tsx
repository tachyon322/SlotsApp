import type { ReactNode } from "react";

export function PageContainer({
  children,
  maxWidth = "max-w-5xl",
  className,
}: {
  children: ReactNode;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <main
      className={`px-page md:px-2xl pt-md md:pt-xl pb-2xl w-full ${className ?? ""}`}
    >
      <div className={`mx-auto transition-all duration-300 ${maxWidth}`}>
        {children}
      </div>
    </main>
  );
}
