import { describeSkipReason, formatStepCommand, formatStepStatus } from '../../utils/plan';
import { MESSAGES } from '../../i18n/messages';

export default function ProcessSummary({ result }) {
  const messages = MESSAGES.process;
  if (!result) {
    return <p>{messages.notExecuted}</p>;
  }

  const stepResults = Array.isArray(result.steps) ? result.steps : [];

  return (
    <div className="process-summary">
      <div className="process-row">
        <span>{messages.exitCode}</span>
        <span>{result.exitCode === null ? messages.unknown : result.exitCode}</span>
      </div>
      <div className="process-row">
        <span>{messages.timedOut}</span>
        <span>{result.timedOut ? messages.yes : messages.no}</span>
      </div>
      <div className="process-row">
        <span>{messages.dryRun}</span>
        <span>{result.dryRun ? messages.yes : messages.no}</span>
      </div>
      {stepResults.length > 0 && (
        <div className="process-steps">
          <h4>{messages.stepsHeading}</h4>
          <ol className="process-step-list">
            {stepResults.map((step, index) => {
              const key = `${step.command || 'step'}-${index}`;
              return (
                <li key={key} className="process-step-item">
                  <div className="process-row">
                    <span>{messages.stepLabel(index)}</span>
                    <span>{formatStepStatus(step)}</span>
                  </div>
                  <code className="command-line small">{formatStepCommand(step)}</code>
                  {step.reasoning && <p className="note">{step.reasoning}</p>}
                  {step.status === 'skipped' && (
                    <p className="note">
                      {messages.skipReasonPrefix}
                      {describeSkipReason(step.skipReason)}
                    </p>
                  )}
                  {step.status === 'executed' && (
                    <>
                      <details className="log-block">
                        <summary>{messages.stdout}</summary>
                        <pre>{step.stdout || messages.emptyLog}</pre>
                      </details>
                      <details className="log-block">
                        <summary>{messages.stderr}</summary>
                        <pre className={step.stderr ? 'log-error' : ''}>{step.stderr || messages.emptyLog}</pre>
                      </details>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <details className="log-block">
        <summary>{messages.stdout}</summary>
        <pre>{result.stdout || messages.emptyLog}</pre>
      </details>
      <details className="log-block">
        <summary>{messages.stderr}</summary>
        <pre className={result.stderr ? 'log-error' : ''}>{result.stderr || messages.emptyLog}</pre>
      </details>
    </div>
  );
}
