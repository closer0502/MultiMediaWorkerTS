import { STATUS_LABELS } from '../../constants/app';
import { normalizePlan } from '../../utils/plan';
import DebugDetails from '../common/DebugDetails';
import OutputList from '../common/OutputList';
import PhaseChecklist from '../common/PhaseChecklist';
import ProcessSummary from '../common/ProcessSummary';
import UploadedFileList from '../common/UploadedFileList';
import { MESSAGES } from '../../i18n/messages';

export default function ResultView({ entry }) {
  const outputList = entry?.result?.resolvedOutputs || [];
  const status = entry.status || 'unknown';
  const statusLabel = STATUS_LABELS[status] || status || MESSAGES.formatters.unknownStatus;
  const statusClassName = `status-chip status-${status}`;
  const plan = normalizePlan(entry.plan ?? entry.rawPlan);
  const followUp = plan?.followUp || '';
  const stepResults = Array.isArray(entry?.result?.steps) ? entry.result.steps : [];
  const messages = MESSAGES.result;
  const debugMessages = MESSAGES.debug;
  const debugEnabled = Boolean(entry?.requestOptions?.debug);
  const showDebugSection = debugEnabled || Boolean(entry?.debug);

  return (
    <div className="result-view">
      <div className="result-header">
        <span className={statusClassName}>{statusLabel}</span>
        {entry.parentSessionId && <span className="chip">{messages.revisionChip}</span>}
        {entry.requestOptions?.dryRun && <span className="chip">{messages.dryRunChip}</span>}
        {entry.requestOptions?.debug && <span className="chip">{messages.debugChip}</span>}
      </div>

      {entry.error && <div className="error inline">{entry.error}</div>}
      {entry.complaint && (
        <div className="result-section">
          <h3>{messages.complaintHeading}</h3>
          <p>{entry.complaint}</p>
        </div>
      )}

      <div className="result-section">
        <h3>{messages.phasesHeading}</h3>
        <PhaseChecklist phases={entry.phases} />
      </div>

      {followUp && (
        <div className="result-section">
          <h3>{messages.followUpHeading}</h3>
          <p>{followUp}</p>
        </div>
      )}

      {entry.rawPlan && (
        <div className="result-section">
          <h3>{messages.rawPlanHeading}</h3>
          <details className="debug-block">
            <summary>{messages.rawPlanSummary}</summary>
            <pre>{JSON.stringify(entry.rawPlan, null, 2)}</pre>
          </details>
        </div>
      )}

      {entry.responseText && (
        <div className="result-section">
          <h3>{messages.responseHeading}</h3>
          <details className="debug-block">
            <summary>{messages.responseSummary}</summary>
            <pre>{entry.responseText}</pre>
          </details>
        </div>
      )}

      <div className="result-section">
        <h3>{messages.uploadsHeading}</h3>
        <UploadedFileList files={entry.uploadedFiles} />
      </div>

      <div className="result-section">
        <h3>{messages.outputsHeading}</h3>
        <OutputList outputs={outputList} />
      </div>

      <div className="result-section">
        <h3>{messages.summaryHeading}</h3>
        <ProcessSummary result={entry.result} />
      </div>

      {showDebugSection && (
        <div className="result-section">
          <h3>{messages.debugHeading}</h3>
          {entry.debug ? <DebugDetails debug={entry.debug} /> : <p>{debugMessages.empty}</p>}
        </div>
      )}
    </div>
  );
}
