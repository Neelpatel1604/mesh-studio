import { ReactNode } from "react";

type HudPanelProps = {
  children: ReactNode;
  className?: string;
};

export function HudPanel({ children, className = "" }: HudPanelProps) {
  const merged = `ui-hud-panel ${className}`.trim();
  return <div className={merged}>{children}</div>;
}
