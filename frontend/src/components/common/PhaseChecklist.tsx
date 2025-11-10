import {
  formatDateTime,
  formatPhaseMetaKey,
  formatPhaseMetaValue,
  statusLabel
} from '../../utils/formatters';
import { MESSAGES } from '../../i18n/messages';

export default function PhaseChecklist({ phases }) {
  const phaseMessages = MESSAGES.phase;
  if (!phases || !phases.length) {
    return <p>{phaseMessages.none}</p>;
  }
  return (
    <ol className="phase-list">
      {phases.map((phase, index) => {
        const status = phase.status || 'pending';
        const title = phase.title || phase.id || `phase-${index}`;
        const metaEntries = Object.entries(phase.meta || {});
        return (
          <li key={phase.id || `phase-${index}`} className={`phase phase-${status}`}>
            <div className="phase-header">
              <span className="phase-title">{title}</span>
              <span className={`phase-status phase-status-${status}`}>{statusLabel(status)}</span>
            </div>
            {(phase.startedAt || phase.finishedAt) && (
              <div className="phase-timestamps">
                {phase.startedAt && (
                  <span>
                    {phaseMessages.startedAt}: {formatDateTime(phase.startedAt)}
                  </span>
                )}
                {phase.finishedAt && (
                  <span>
                    {phaseMessages.finishedAt}: {formatDateTime(phase.finishedAt)}
                  </span>
                )}
              </div>
            )}
            {metaEntries.length > 0 && (
              <ul className="phase-meta">
                {metaEntries.map(([key, value]) => (
                  <li key={key}>
                    <strong>{formatPhaseMetaKey(key)}</strong>
                    <span>{formatPhaseMetaValue(value)}</span>
                  </li>
                ))}
              </ul>
            )}
            {phase.error && (
              <div className="phase-error">
                <strong>{phase.error.name || phaseMessages.errorLabel}:</strong> {phase.error.message}
              </div>
            )}
            {Array.isArray(phase.logs) && phase.logs.length > 0 && (
              <details className="log-block">
                <summary>{phaseMessages.logsLabel(phase.logs.length)}</summary>
                <ul className="phase-logs">
                  {phase.logs.map((log, logIndex) => (
                    <li key={`${phase.id || `phase-${index}`}-log-${logIndex}`}>
                      <time>{formatDateTime(log.at)}</time>
                      <span>{log.message}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
