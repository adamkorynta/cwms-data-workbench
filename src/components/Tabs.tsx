import type { TabId } from "../types";
import { GwButton } from "./GroundworkControls";

export interface TabDefinition {
  id: TabId;
  label: string;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabDefinition[];
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <nav className="tabs" aria-label="CWMS workbench tabs">
      {tabs.map((tab) => (
        <GwButton
          key={tab.id}
          type="button"
          variant="subtle"
          className={tab.id === activeTab ? "tab active" : "tab"}
          disabled={tab.disabled}
          onClick={() => {
            if (!tab.disabled) onChange(tab.id);
          }}
          title={tab.disabled ? "Coming soon" : undefined}
        >
          {tab.label}
        </GwButton>
      ))}
    </nav>
  );
}
