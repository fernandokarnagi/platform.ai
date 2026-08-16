export default function SuccessModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-notice" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <span>Saved</span>
          <button type="button" onClick={onClose} className="modal-x">
            ✕
          </button>
        </div>
        <p className="ok-line">{message}</p>
        <div className="modal-actions">
          <button type="button" className="toggle accent" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
