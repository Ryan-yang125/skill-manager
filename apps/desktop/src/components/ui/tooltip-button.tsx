import type { ReactElement, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export { TooltipProvider };

interface TooltipButtonProps {
  className: string;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

export function TooltipButton({ className, label, children, disabled, onClick }: TooltipButtonProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button className={className} type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="rounded-[5px] border border-[var(--ink-faint)] bg-[var(--ink)] px-[7px] py-[5px] text-xs text-[var(--bg)] shadow-[var(--shadow)]" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function IconButton({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; disabled?: boolean; onClick: () => void }): ReactElement {
  return (
    <TooltipButton className="size-[30px] rounded-[5px] bg-transparent text-[var(--ink-dim)] transition-colors hover:bg-[var(--hover-strong)] hover:text-[var(--ink)]" label={label} disabled={disabled} onClick={onClick}>
      {icon}
    </TooltipButton>
  );
}
