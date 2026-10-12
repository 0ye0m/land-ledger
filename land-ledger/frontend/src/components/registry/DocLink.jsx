import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { documentService } from '../../services';
import { useToast } from '../../context/ToastContext.jsx';

/**
 * View/download link for a registry document.
 *
 * Replaces the old plain <a href="/api/documents/:id/download" target="_blank">:
 * that navigation can never attach the Authorization header (the JWT lives in
 * localStorage, not cookies), so every click landed on a raw JSON 401 page.
 * This component fetches the bytes with the proper header and opens a
 * temporary blob URL in a new tab instead, surfacing failures as a toast.
 */
export default function DocLink({ id, children = 'View', className = 'btn btn-ghost btn-sm', title = 'View document', busyId = null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const disabled = busy || busyId === id;

  async function handleClick() {
    setBusy(true);
    const res = await documentService.open(id);
    setBusy(false);
    if (!res.ok) toast(res.message || 'Unable to open document', 'error');
  }

  return (
    <button type="button" className={className} onClick={handleClick} disabled={disabled} title={title}>
      <span className={busy ? 'opacity-60' : ''}>{children}</span>
      {!busy && <ExternalLink size={13} className="ml-1.5 inline-block -mt-0.5" />}
      {busy && <span className="ml-1.5 inline-block animate-spin">◌</span>}
    </button>
  );
}
