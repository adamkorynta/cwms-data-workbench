import { SiteWrapper } from "@usace/groundwork";
import { Database, User } from "lucide-react";
import { dataSources } from "../config/dataSources";
import type { AppSettings, CdaOffice } from "../types";

interface AppShellProps {
  settings: AppSettings;
  offices: CdaOffice[];
  officesLoading: boolean;
  officesError: string | null;
  onDataSourceChange: (baseUrl: string) => void;
  onOfficeChange: (office: string) => void;
  children: React.ReactNode;
}

export function AppShell({
  settings,
  offices,
  officesLoading,
  officesError,
  onDataSourceChange,
  onOfficeChange,
  children,
}: AppShellProps) {
  return (
    <SiteWrapper
      title="CWMS Data Workbench"
      subtitle="Operational CDA Client"
      homeUrl="#"
      fluidNav
      showFooter={false}
      usaBanner={false}
      cwbiLogo
      navRight={<HeaderControls user={settings.user} />}
    >
      <div className="app-shell">
        <header className="app-header">
          <div className="status-strip">
            <label className="status-control status-control-wide" title={settings.baseUrl}>
              <Database size={15} />
              <span>Data Source:</span>
              <select value={settings.baseUrl} onChange={(event) => onDataSourceChange(event.target.value)}>
                {dataSources.map((source) => (
                  <option key={source.environment} value={source.baseUrl}>
                    {source.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="status-control">
              <span>Office:</span>
              <select value={settings.office} onChange={(event) => onOfficeChange(event.target.value)} disabled={officesLoading}>
                {!offices.some((office) => office.id === settings.office) && <option value={settings.office}>{settings.office}</option>}
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.id}
                  </option>
                ))}
              </select>
            </label>
            {officesError && <span className="status-warning" title={officesError}>Offices unavailable</span>}
          </div>
        </header>
        {children}
      </div>
    </SiteWrapper>
  );
}

function HeaderControls({ user }: { user: string }) {
  return (
    <div className="groundwork-nav-status">
      <StatusItem icon={<User size={15} />} label="User" value={user} />
    </div>
  );
}

function StatusItem({
  icon,
  label,
  value,
  wide = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "status-item status-item-wide" : "status-item"}>
      {icon}
      <span>{label}:</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}
