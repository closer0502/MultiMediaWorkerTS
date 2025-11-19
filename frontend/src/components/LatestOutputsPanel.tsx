import OutputList from './common/OutputList';
import { MESSAGES } from '../i18n/messages';

export default function LatestOutputsPanel({
  isSubmitting,
  outputs,
  showErrorBanner,
  errorMessage,
  onRetryFromError,
  complaintText,
  complaintError,
  helperMessage,
  onComplaintChange,
  onComplaintSubmit,
  complaintButtonDisabled,
  isSubmittingComplaint,
  canSubmitRevision
}) {
  const messages = MESSAGES.latestOutputs;

  return (
    <section className="panel">
      <h2>{messages.heading}</h2>
      {showErrorBanner && (
        <div className="error-banner">
          <div className="error-banner__content">
            <p className="error-banner__title">{messages.errorTitle}</p>
            {errorMessage && <p className="error-banner__message">{errorMessage}</p>}
            <button
              type="button"
              onClick={onRetryFromError}
              disabled={isSubmitting}
              className="error-banner__action"
            >
              {messages.errorAction}
            </button>
          </div>
        </div>
      )}
      {isSubmitting ? (
        <p className="note">{messages.processing}</p>
      ) : outputs.length > 0 ? (
        <OutputList outputs={outputs} />
      ) : (
        <p className="note">{messages.empty}</p>
      )}
      <div className="complaint-section">
        <div className="complaint-heading">
          <h3>{messages.complaintSectionTitle}</h3>
          <p className="complaint-hint">{helperMessage}</p>
        </div>
        <textarea
          value={complaintText}
          onChange={(event) => onComplaintChange(event.target.value)}
          placeholder={messages.complaintPlaceholder}
          rows={2}
          disabled={isSubmittingComplaint || isSubmitting || !canSubmitRevision}
        />
        <div className="complaint-actions">
          <button type="button" onClick={onComplaintSubmit} disabled={complaintButtonDisabled}>
            {isSubmittingComplaint ? messages.complaintSubmitting : messages.complaintButton}
          </button>
          <span className="complaint-hint">{messages.complaintHint}</span>
        </div>
        {complaintError && <div className="error">{complaintError}</div>}
      </div>
    </section>
  );
}
