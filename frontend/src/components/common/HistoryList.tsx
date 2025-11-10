import { STATUS_LABELS } from '../../constants/app';
import { buildPlanSummary } from '../../utils/plan';
import { MESSAGES } from '../../i18n/messages';

export default function HistoryList({ entries }) {
  const messages = MESSAGES.history;
  if (!Array.isArray(entries) || entries.length === 0) {
    return <p>{messages.none}</p>;
  }
  return (
    <ul className="history-list">
      {entries.map((item) => {
        const statusLabel = STATUS_LABELS[item.status] || item.status || MESSAGES.formatters.unknownStatus;
        const statusClass = `status-chip status-${item.status || 'unknown'}`;
        return (
          <li key={item.id}>
            <div className="history-row">
              <span className={statusClass}>{statusLabel}</span>
              {item.parentSessionId && <span className="chip">{messages.revisionChip}</span>}
              <span>{new Date(item.submittedAt).toLocaleString()}</span>
            </div>
            <p className="history-task">{item.task}</p>
            {item.complaint && (
              <p className="history-complaint">
                {messages.complaintLabel}: {item.complaint}
              </p>
            )}
            <code className="command-line small">
              {buildPlanSummary(item.plan ?? item.rawPlan) || messages.planFallback}
            </code>
          </li>
        );
      })}
    </ul>
  );
}
