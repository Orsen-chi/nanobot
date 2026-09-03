import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Compact context-window meter shown next to the composer's voice input:
 * a small full-ring gauge plus a percentage label. Hovering reveals the
 * exact token figures instantly (server-side estimate when available).
 */

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) {
    const k = n / 1_000;
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  return String(Math.round(n));
}

export function ContextMeter({
  usedTokens,
  windowTokens,
  isHero,
  className,
}: {
  usedTokens?: number | null;
  windowTokens?: number | null;
  isHero?: boolean;
  className?: string;
}) {
  if (
    windowTokens == null
    || !Number.isFinite(windowTokens)
    || windowTokens <= 0
  ) {
    return null;
  }
  const used = Math.max(0, Math.min(usedTokens ?? 0, windowTokens));
  const ratio = used / windowTokens;
  const pct = Math.round(ratio * 100);
  const tone =
    ratio >= 0.9
      ? "stroke-red-500"
      : ratio >= 0.7
        ? "stroke-amber-500"
        : "stroke-emerald-500";

  const size = isHero ? 15 : 16;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const detail = `Context ${formatTokens(used)} / ${formatTokens(windowTokens)} tokens (${pct}%)`;

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="status"
            aria-label={detail}
            className={cn(
              "context-meter flex min-w-0 shrink-0 cursor-help items-center gap-1 text-muted-foreground/75",
              className,
            )}
          >
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="shrink-0 -rotate-90"
              aria-hidden
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={stroke}
                className="stroke-muted-foreground/20 transition-colors duration-200"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                className={cn(
                  "transition-[stroke-dashoffset,stroke] duration-300 ease-out",
                  tone,
                )}
                strokeDasharray={circumference + 1}
                strokeDashoffset={circumference * (1 - ratio)}
              />
            </svg>
            <span
              className={cn(
                "shrink-0 tabular-nums leading-none",
                isHero ? "text-[10px]" : "text-[10.5px]",
              )}
            >
              {pct}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          <span className="font-medium tabular-nums">{detail}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
