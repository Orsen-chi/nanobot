import {
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CircleHelp, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogoFallback } from "@/hooks/useLogoFallback";
import { inferProviderFromModelName, providerBrand } from "@/lib/provider-brand";
import { cn } from "@/lib/utils";

export interface ModelPresetOption {
  name: string;
  label: string;
  model?: string | null;
  provider?: string | null;
  contextWindowTokens?: number | null;
}

interface ModelPresetBadgeProps {
  label: string;
  modelDetail?: string | null;
  modelPreset?: string | null;
  modelPresets?: ModelPresetOption[];
  onPresetChange?: (name: string) => void;
  provider?: string | null;
  providerLabel?: string | null;
  needsSetup?: boolean;
  fallbackModelName?: string | null;
  isHero: boolean;
  onClick?: () => void;
}

export function ModelPresetBadge({
  label,
  modelDetail,
  modelPreset,
  modelPresets = [],
  onPresetChange,
  provider,
  providerLabel,
  needsSetup = false,
  fallbackModelName,
  isHero,
  onClick,
}: ModelPresetBadgeProps) {
  const { t } = useTranslation();
  const activeName = modelPreset?.trim() || "";
  const listedIndex = modelPresets.findIndex((preset) => preset.name === activeName);
  const activePreset: ModelPresetOption = {
    ...(listedIndex >= 0 ? modelPresets[listedIndex] : undefined),
    name: activeName,
    label: label || modelPresets[listedIndex]?.label || activeName,
    model: modelDetail ?? modelPresets[listedIndex]?.model,
    provider: provider || modelPresets[listedIndex]?.provider,
    contextWindowTokens: modelPresets[listedIndex]?.contextWindowTokens,
  };
  const presets = !activeName
    ? modelPresets
    : listedIndex < 0
      ? [activePreset, ...modelPresets]
      : modelPresets.map((preset, index) => index === listedIndex ? activePreset : preset);
  const interactive = Boolean(onClick);
  const canSwitch = !interactive && Boolean(onPresetChange) && activeName !== "" && presets.length > 1;

  const badgeClassName = cn(
    "thread-composer-model-badge group/model-badge relative inline-flex w-fit min-w-0 max-w-[min(18rem,44vw)] items-center justify-end appearance-none border-0 bg-transparent p-0 shadow-none",
    interactive && "cursor-pointer",
    isHero ? "h-8" : "h-9",
  );

  // Non-switchable badge: plain button (e.g. "needs setup" → opens settings) or static pill.
  if (interactive || !canSwitch) {
    const Container = interactive ? "button" : "span";
    return (
      <Container
        aria-label={label}
        type={interactive ? "button" : undefined}
        onClick={interactive ? onClick : undefined}
        className={badgeClassName}
      >
        <PresetPill
          label={label}
          modelDetail={modelDetail}
          provider={provider}
          providerLabel={providerLabel}
          needsSetup={needsSetup}
          fallbackModelName={fallbackModelName}
          isHero={isHero}
        />
      </Container>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          className={cn(
            badgeClassName,
            "cursor-pointer select-none focus-visible:outline-none",
          )}
        >
          <PresetPill
            label={label}
            modelDetail={modelDetail}
            provider={provider}
            providerLabel={providerLabel}
            needsSetup={needsSetup}
            fallbackModelName={fallbackModelName}
            isHero={isHero}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64 max-w-[min(20rem,78vw)]">
        <DropdownMenuLabel>
          {t("models.selectModel", { defaultValue: "Select model" })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {presets.map((preset) => (
          <DropdownMenuCheckboxItem
            key={preset.name}
            checked={preset.name === activeName}
            onSelect={(event) => {
              if (preset.name === activeName) {
                event.preventDefault();
                return;
              }
              onPresetChange?.(preset.name);
            }}
            className="py-1.5"
          >
            <span className="flex min-w-0 flex-col items-start gap-0.5 py-0.5">
              <span className="min-w-0 truncate text-[13px] font-medium text-foreground/90">
                {preset.label || preset.name}
              </span>
              {preset.model ? (
                <span className="min-w-0 truncate text-[11.5px] leading-none text-muted-foreground/80">
                  {preset.model}
                </span>
              ) : null}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PresetPill({
  className,
  label,
  modelDetail,
  provider,
  providerLabel,
  needsSetup = false,
  fallbackModelName,
  isHero,
}: {
  className?: string | false | null;
  label: string;
  modelDetail?: string | null;
  provider?: string | null;
  providerLabel?: string | null;
  needsSetup?: boolean;
  fallbackModelName?: string | null;
  isHero: boolean;
}) {
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [labelOverflows, setLabelOverflows] = useState(false);
  const inferredProvider = needsSetup
    ? null
    : provider || inferProviderFromModelName(modelDetail || label);
  const brand = providerBrand(inferredProvider);
  const { logoUrl, onLogoError, onLogoLoad } = useLogoFallback(brand?.logoUrls);
  const title = [...new Set([label, modelDetail, providerLabel].filter(Boolean))].join(" · ");
  const logoTestId = needsSetup
    ? "composer-model-setup-icon"
    : `composer-model-logo${inferredProvider ? `-${inferredProvider}` : ""}`;

  useLayoutEffect(() => {
    const node = labelRef.current;
    if (!node) return;
    const update = () => setLabelOverflows(node.scrollWidth > node.clientWidth + 1);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [label]);

  return (
    <span
      data-fallback={fallbackModelName ? "true" : undefined}
      title={fallbackModelName || title || undefined}
      className={cn(
        "composer-model-badge composer-model-pill inline-flex h-full w-fit max-w-full min-w-0 shrink-0 items-center rounded-full border border-border/55 bg-card font-medium text-foreground/70",
        "shadow-[0_2px_8px_rgba(15,23,42,0.045)]",
        "transition-[color,background-color,border-color,transform] duration-150 ease-out group-focus-visible/model-badge:ring-2 group-focus-visible/model-badge:ring-ring/45",
        needsSetup && "border-amber-500/35 bg-amber-50/70 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
        isHero ? "gap-1.5 px-2.5 text-[12px]" : "gap-2 px-3 text-[12.5px]",
        className,
      )}
    >
      <span
        data-testid={logoTestId}
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden",
          needsSetup ? "text-amber-800 dark:text-amber-200" : "rounded-full border bg-background",
          isHero ? "h-4 w-4" : "h-[18px] w-[18px]",
        )}
        style={{
          borderColor: !needsSetup && brand ? `${brand.color}28` : undefined,
          boxShadow: !needsSetup && brand ? `inset 0 0 0 1px ${brand.color}18` : undefined,
        }}
        aria-hidden
      >
        {needsSetup ? (
          <CircleHelp className={cn(isHero ? "h-3 w-3" : "h-3.5 w-3.5")} strokeWidth={1.8} />
        ) : logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            draggable={false}
            decoding="async"
            loading="lazy"
            className={cn("object-contain", isHero ? "h-3 w-3" : "h-3.5 w-3.5")}
            onLoad={onLogoLoad}
            onError={onLogoError}
          />
        ) : brand ? (
          <span
            className={cn(
              "grid h-full w-full place-items-center rounded-full text-white",
              isHero ? "text-[7.5px]" : "text-[8px]",
            )}
            style={{ backgroundColor: brand.color }}
          >
            {brand.initials.slice(0, 2)}
          </span>
        ) : (
          <Sparkles className="h-3 w-3 text-muted-foreground/65" />
        )}
      </span>
      <span
        ref={labelRef}
        className={cn(
          "thread-composer-model-label min-w-0 overflow-hidden whitespace-nowrap text-center",
          labelOverflows && "thread-composer-model-label-fade",
        )}
      >
        {label}
      </span>
    </span>
  );
}
