import { MESSAGES } from '../../i18n/messages';

export default function StepStatusBadge({ result }) {
  if (!result) {
    return null;
  }

  const messages = MESSAGES.stepStatusBadge;
  const status = result.status || 'unknown';
  const statusLabel = status === 'executed' ? messages.executed : messages.skipped;
  const extras = [];
  if (status === 'executed') {
    if (result.exitCode !== null && result.exitCode !== undefined) {
      extras.push(`${messages.exitCode} ${result.exitCode}`);
    }
    if (result.timedOut) {
      extras.push(messages.timedOut);
    }
  }

  const text = extras.length ? `${statusLabel} (${extras.join(' / ')})` : statusLabel;
  return <span className={`chip step-status-${status}`}>{text}</span>;
}
