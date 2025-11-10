import { useCallback } from 'react';
import FilePreviewList from './FilePreviewList';
import { MESSAGES } from '../../i18n/messages';

export default function TaskForm({
  task,
  onTaskChange,
  isSubmitting,
  fileInputRef,
  onSubmit,
  selectedFiles,
  onFilesSelected,
  onClearFiles,
  showDebugOptions,
  onToggleDebugOptions,
  dryRun,
  onDryRunChange,
  debugEnabled,
  onDebugChange,
  onReset,
  error
}) {
  const handleTaskChange = useCallback(
    (event) => {
      onTaskChange(event.target.value);
    },
    [onTaskChange]
  );

  const handleFileChange = useCallback(
    (event) => {
      const { files } = event.target;
      const nextFiles = Array.from(files || []);
      if (nextFiles.length > 0) {
        onFilesSelected(nextFiles);
      }
      if (event.target) {
        event.target.value = '';
      }
    },
    [onFilesSelected]
  );

  const messages = MESSAGES.taskForm;

  return (
    <section className="panel task-panel">
      <h2>{messages.heading}</h2>
      <form className="task-form" onSubmit={onSubmit}>
        <label className="field">
          <span>{messages.taskLabel}</span>
          <textarea
            value={task}
            placeholder={messages.placeholder}
            onChange={handleTaskChange}
            rows={5}
            disabled={isSubmitting}
          />
        </label>

        <div className="field">
          <label htmlFor="task-form-file-input">{messages.attachLabel}</label>
          <input
            ref={fileInputRef}
            id="task-form-file-input"
            className="file-input"
            type="file"
            multiple
            onChange={handleFileChange}
            disabled={isSubmitting}
            aria-label={messages.attachAria}
          />
          <FilePreviewList
            files={selectedFiles}
            onClear={onClearFiles}
            onAdd={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={isSubmitting}
          />
        </div>

        <div className={`field options debug-options ${showDebugOptions ? 'is-expanded' : 'is-collapsed'}`}>
          <label className="debug-options-header">
            <input
              type="checkbox"
              checked={showDebugOptions}
              onChange={(event) => onToggleDebugOptions(event.target.checked)}
              disabled={isSubmitting}
            />
            <span className="debug-options-title">{messages.debugOptionsTitle}</span>
          </label>
          {showDebugOptions && (
            <div className="debug-options-body">
              <label className="option">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(event) => onDryRunChange(event.target.checked)}
                  disabled={isSubmitting}
                />
                <span>{messages.dryRunLabel}</span>
              </label>
              <label className="option">
                <input
                  type="checkbox"
                  checked={debugEnabled}
                  onChange={(event) => onDebugChange(event.target.checked)}
                  disabled={isSubmitting}
                />
                <span>{messages.debugVerboseLabel}</span>
              </label>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? messages.submitting : messages.submit}
          </button>
          <button type="button" onClick={onReset} disabled={isSubmitting}>
            {messages.reset}
          </button>
        </div>
      </form>
      {error && <div className="error">{error}</div>}
    </section>
  );
}
