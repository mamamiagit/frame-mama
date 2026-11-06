import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { ConfirmationRequest } from "../../electron/confirmation-types.cjs";
import Modal from "./Modal";
import "./Organization.css";
import "./ConfirmationDialog.css";

export default function ConfirmationDialog() {
  const api = window.frame?.confirmation;
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const answering = useRef(false);
  const descriptionId = useId();
  useEffect(() => {
    if (!api) return;
    let disposed = false, changes = 0;
    const unsubscribe = api.onChange(value => {
      changes++;
      setRequest(value);
      setError("");
    });
    const initial = changes;
    void api.current().then(value => {
      if (!disposed && changes === initial) setRequest(value);
    }).catch(() => {});
    return () => { disposed = true; unsubscribe(); };
  }, [api]);
  const answer = useCallback(async (accepted: boolean) => {
    if (!request || !api || answering.current) return;
    answering.current = true;
    setSubmitting(true);
    setError("");
    try { await api.answer(request.id, accepted); }
    catch {
      setError("Could not submit your choice. Please try again.");
      void api.current().then(setRequest).catch(() => {});
    } finally { answering.current = false; setSubmitting(false); }
  }, [api, request]);
  const cancel = useCallback(() => { void answer(false); }, [answer]);
  if (!request) return null;
  return <Modal title={request.title} onClose={cancel} role="alertdialog"
    descriptionId={descriptionId} className="confirmation-modal">
    <div className="confirmation-symbol" aria-hidden="true"><ShieldCheck size={27} /></div>
    <p id={descriptionId} className="confirmation-description">{request.description}</p>
    {error && <p role="alert" className="confirmation-error">{error}</p>}
    <div className="confirmation-actions">
      <button className="secondary-button" data-autofocus disabled={submitting} onClick={cancel}>{request.cancelLabel}</button>
      <button className="primary-button" data-confirm-action disabled={submitting} onClick={() => void answer(true)}>{request.confirmLabel}</button>
    </div>
  </Modal>;
}
