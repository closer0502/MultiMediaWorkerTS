import { useEffect, useMemo, useRef } from 'react';
import { PROGRESS_STEPS } from '../constants/app';
import { MESSAGES } from '../i18n/messages';

export default function ProgressModal({ stage, logs = [] }) {
  const logViewerRef = useRef(null);
  const progressMessages = MESSAGES.progress;
  const displayText = useMemo(() => {
    if (!Array.isArray(logs) || logs.length === 0) {
      return progressMessages.logEmpty;
    }
    return logs.join('\n');
  }, [logs, progressMessages.logEmpty]);

  useEffect(() => {
    if (logViewerRef.current) {
      logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight;
    }
  }, [displayText]);

  return (
    <div className="progress-modal" role="dialog" aria-modal="true" aria-labelledby="progress-modal-title">
      <div className="progress-modal-backdrop" />
      <div className="progress-modal-dialog">
        <div className="progress-modal-layout">
          <section className="panel progress-panel">
            <h2 id="progress-modal-title">{progressMessages.dialogTitle}</h2>
            <p className="progress-lead">{progressMessages.lead}</p>
            <ul className="progress-steps">
              {PROGRESS_STEPS.map((step, index) => {
                let statusClass = '';
                if (index === stage) {
                  statusClass = 'is-active';
                } else if (index < stage) {
                  statusClass = 'is-complete';
                }
                return (
                  <li key={step.title || `step-${index}`} className={`progress-step ${statusClass}`}>
                    <span className="progress-step-index">{index + 1}</span>
                    <div className="progress-step-body">
                      <strong>{step.title}</strong>
                      <span>{step.description}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="panel progress-log-panel" aria-label={progressMessages.logAriaLabel}>
            <h3 className="progress-log-title">{progressMessages.logTitle}</h3>
            <pre ref={logViewerRef} className="progress-log-viewer" aria-live="polite">{displayText}</pre>
          </section>
        </div>
      </div>
    </div>
  );
}
