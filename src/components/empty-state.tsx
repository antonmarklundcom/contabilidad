import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  ctaLabel,
  ctaHref,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  ctaLabel?: string;
  ctaHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-muted-foreground/50" />}
      <p className="text-sm text-muted-foreground">{title}</p>
      {ctaLabel && ctaHref && (
        <Button asChild className="mt-4">
          <Link href={ctaHref}>{ctaLabel}</Link>
        </Button>
      )}
      {children}
    </div>
  );
}
