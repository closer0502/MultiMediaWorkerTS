import { useCallback, useEffect, useRef, useState } from 'react';
import { describeSkipReason, formatStepCommand, formatStepStatus } from '../../utils/plan';
import { MESSAGES } from '../../i18n/messages';

export default function ProcessSummary({ result }) {
  const messages = MESSAGES.process;
  const copyMessages = MESSAGES.plan;
  if (!result) {
    return <p>{messages.notExecuted}</p>;
  }

  const stepResults = Array.isArray(result.steps) ? result.steps : [];

  const [copiedIndex, setCopiedIndex] = useState(null);
  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyClick = useCallback(
    async (text, indexLabel) => {
      if (!text) {
        return;
      }
      if (
        typeof navigator === 'undefined' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== 'function'
      ) {
        console.warn('Clipboard API is not available in this environment.');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        setCopiedIndex(indexLabel);
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => setCopiedIndex(null), 2000);
      } catch (error) {
        console.error('Failed to copy executed command to clipboard.', error);
      }
    },
    []
  );

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
              const commandText = formatStepCommand(step);
              const isCopied = copiedIndex === index;
              return (
                <li key={key} className="process-step-item">
                  <div className="process-row">
                    <span>{messages.stepLabel(index)}</span>
                    <span>{formatStepStatus(step)}</span>
                  </div>
                  <div className="process-command-row">
                    <code className="command-line small">{commandText}</code>
                    {commandText && (
                      <button
                        type="button"
                        className="copy-button"
                        onClick={() => handleCopyClick(commandText, index)}
                        aria-label={copyMessages.copyCommandAria(messages.stepLabel(index))}
                      >
                        {isCopied ? copyMessages.copyCommandCopied : copyMessages.copyCommand}
                      </button>
                    )}
                  </div>
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
