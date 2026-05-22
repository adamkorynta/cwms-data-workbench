import { GwButton, GwInput } from "./GroundworkControls";

interface AuthMethodDialogProps {
  open: boolean;
  apiKey: string;
  busy: boolean;
  error: string | null;
  onApiKeyChange: (value: string) => void;
  onUseApiKey: () => void;
  onUseIdp: () => void;
  onClose: () => void;
}

export function AuthMethodDialog({
  open,
  apiKey,
  busy,
  error,
  onApiKeyChange,
  onUseApiKey,
  onUseIdp,
  onClose,
}: Readonly<AuthMethodDialogProps>) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <dialog
        open
        className="auth-method-dialog"
        aria-label="Choose Sign In Method"
      >
        <header>
          <strong>Sign In</strong>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close sign in dialog">
            ×
          </button>
        </header>
        <div className="dialog-body auth-dialog-body">
          <p className="auth-dialog-text">Choose an authentication method for this CDA session.</p>
          <div className="auth-dialog-actions">
            <GwButton type="button" variant="primary" onClick={onUseIdp} disabled={busy}>
              Continue with IdP
            </GwButton>
          </div>
          <div className="auth-divider">or</div>
          <label className="auth-api-key-row" htmlFor="auth-api-key-input">
            <span>API Key</span>
            <GwInput
              id="auth-api-key-input"
              type="password"
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder="Paste API key"
              autoComplete="off"
              disabled={busy}
            />
          </label>
          {error ? <div className="auth-error">{error}</div> : null}
        </div>
        <footer>
          <GwButton type="button" onClick={onClose} disabled={busy}>
            Cancel
          </GwButton>
          <GwButton type="button" variant="primary" onClick={onUseApiKey} disabled={busy || !apiKey.trim()}>
            Use API Key
          </GwButton>
        </footer>
      </dialog>
    </div>
  );
}
