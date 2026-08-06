'use client';

import { useEffect, useState, type ReactNode } from 'react';

interface SkeletonRevealProps {
  pending: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  durationMs?: number;
}

export function SkeletonReveal({
  pending,
  skeleton,
  children,
  className = '',
  contentClassName = '',
  durationMs = 450,
}: SkeletonRevealProps) {
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (pending) {
      setShowSkeleton(true);
      setFading(false);
      return;
    }
    if (!showSkeleton) return;
    const raf = requestAnimationFrame(() => setFading(true));
    const t = setTimeout(() => setShowSkeleton(false), durationMs);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [pending, showSkeleton, durationMs]);

  return (
    <div className={`relative ${className}`}>
      {pending ? (
        <div className="relative" aria-hidden="true">
          {skeleton}
        </div>
      ) : (
        <>
          <div
            className={`transition-opacity ease-out ${contentClassName} ${
              fading ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ transitionDuration: `${durationMs}ms` }}
          >
            {children}
          </div>
          {showSkeleton && (
            <div
              className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity ease-out ${
                fading ? 'opacity-0' : 'opacity-100'
              }`}
              style={{ transitionDuration: `${durationMs}ms` }}
              aria-hidden="true"
            >
              {skeleton}
            </div>
          )}
        </>
      )}
    </div>
  );
}
