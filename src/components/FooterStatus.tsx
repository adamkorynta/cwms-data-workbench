import { Clock } from "lucide-react";
import type { AppSettings } from "../types";
import { formatTimeWindow } from "../utils/timeWindow";
import { GwButton } from "./GroundworkControls";

interface FooterStatusProps {
  settings: AppSettings;
  onOpenTimeWindow: () => void;
}

export function FooterStatus({ settings, onOpenTimeWindow }: FooterStatusProps) {
  return (
    <footer className="footer-status">
      <div>
        <Clock size={14} />
        <span>Time window: {formatTimeWindow(settings.timeWindow)}</span>
        <span>Time zone: {settings.timezone}</span>
        <span>Unit system: {settings.unitSystem}</span>
      </div>
      <GwButton type="button" onClick={onOpenTimeWindow}>Set Time Window</GwButton>
    </footer>
  );
}
