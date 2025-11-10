import { useCallback, useEffect, useRef, useState } from 'react';
import StepStatusBadge from './StepStatusBadge';
import { describeSkipReason, formatStepCommand } from '../../utils/plan';
import { MESSAGES } from '../../i18n/messages';

export default function PlanStepList({ steps, results }) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }

  const planMessages = MESSAGES.plan;
  const [copiedIndex, setCopiedIndex] = useState(null);
  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyClick = useCallback(async (text, index) => {
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
      setCopiedIndex(index);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy plan step command to clipboard.', error);
    }
  }, []);

  return (
    <ol className="plan-step-list">
      {steps.map((step, index) => {
        const stepResult = Array.isArray(results) ? results[index] : undefined;
        const title = step.title || planMessages.stepLabel(index);
        const key = step.id || `${step.command || 'unknown'}-${index}`;
        const commandText = formatStepCommand(step);
        const isCopied = copiedIndex === index;

        return (
          <li key={key} className="plan-step-item">
            <div className="plan-step-header">
              <strong>{title}</strong>
              <StepStatusBadge result={stepResult} />
            </div>
            <div className="plan-step-command">
              <code className="command-line small">{commandText}</code>
              {commandText && (
                <button
                  type="button"
                  className="copy-button"
                  onClick={() => handleCopyClick(commandText, index)}
                  aria-label={planMessages.copyCommandAria(title)}
                >
                  {isCopied ? planMessages.copyCommandCopied : planMessages.copyCommand}
                </button>
              )}
            </div>
            {step.reasoning && <p className="note">{step.reasoning}</p>}
            {step.note && <p className="note">{step.note}</p>}
            {Array.isArray(step.outputs) && step.outputs.length > 0 && (
              <ul className="plan-step-outputs">
                {step.outputs.map((output, outputIndex) => {
                  const outputKey = output.path || `${outputIndex}-${output.description || 'output'}`;
                  return (
                    <li key={outputKey}>
                      <span>{output.description || planMessages.outputFallback}:</span>{' '}
                      <span>{output.path}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {stepResult?.status === 'skipped' && (
              <p className="note">
                {planMessages.skipReasonPrefix}
                {describeSkipReason(stepResult.skipReason)}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
