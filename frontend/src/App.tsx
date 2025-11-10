import './styles.css';

import LatestOutputsPanel from './components/LatestOutputsPanel';
import HistoryList from './components/common/HistoryList';
import ProgressModal from './components/ProgressModal';
import ResultView from './components/result/ResultView';
import TaskForm from './components/TaskForm/TaskForm';
import { useTaskWorkflow } from './hooks/useTaskWorkflow';
import { useProgressPreview } from './hooks/useProgressPreview';
import { MESSAGES } from './i18n/messages';
import ErrorRetryTestScreen from './dev/ErrorRetryTestScreen';

export default function App() {
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('error-retry-test')
  ) {
    return <ErrorRetryTestScreen />;
  }

  const {
    task,
    setTask,
    selectedFiles,
    handleFilesSelected,
    handleClearFiles,
    fileInputRef,
    isSubmitting,
    planStatus,
    planError,
    error,
    history,
    debugEnabled,
    setDebugEnabled,
    showDebugOptions,
    setShowDebugOptions,
    dryRun,
    setDryRun,
    progressStage,
    handleSubmit,
    resetForm,
    latestEntry,
    latestOutputs,
    complaintText,
    complaintError,
    complaintButtonDisabled,
    complaintHelperMessage,
    canSubmitRevision,
    isSubmittingComplaint,
    handleComplaintSubmit,
    handleComplaintChange,
    handleRetryFromError,
    liveLogs
  } = useTaskWorkflow();
  const progressPreview = useProgressPreview();

  const progressModalVisible = progressPreview.enabled ? true : isSubmitting;
  const progressModalStage = progressPreview.enabled ? progressPreview.stage : progressStage;
  const progressModalLogs = progressPreview.enabled ? progressPreview.logs : liveLogs;

  const { app } = MESSAGES;
  const showErrorBanner =
    !isSubmitting &&
    planStatus === 'failed' &&
    Boolean(planError?.message || (latestEntry && latestEntry.status === 'failed'));
  const errorBannerMessage =
    planError?.message || latestEntry?.error || error || app.errors.planFailed;

  return (
    <div className="app">
      <header className="header">
        <h1>{app.header.title}</h1>
        <p>{app.header.description}</p>
      </header>

      <main className="content">
        <div className="task-progress-layout">
          <TaskForm
            task={task}
            onTaskChange={setTask}
            isSubmitting={isSubmitting}
            fileInputRef={fileInputRef}
            onSubmit={handleSubmit}
            selectedFiles={selectedFiles}
            onFilesSelected={handleFilesSelected}
            onClearFiles={handleClearFiles}
            showDebugOptions={showDebugOptions}
            onToggleDebugOptions={setShowDebugOptions}
            dryRun={dryRun}
            onDryRunChange={setDryRun}
            debugEnabled={debugEnabled}
            onDebugChange={setDebugEnabled}
            onReset={resetForm}
            error={error}
          />
        </div>

        <LatestOutputsPanel
          isSubmitting={isSubmitting}
          outputs={latestOutputs}
          showErrorBanner={showErrorBanner}
          errorMessage={errorBannerMessage}
          onRetryFromError={handleRetryFromError}
          complaintText={complaintText}
          complaintError={complaintError}
          helperMessage={complaintHelperMessage}
          onComplaintChange={handleComplaintChange}
          onComplaintSubmit={handleComplaintSubmit}
          complaintButtonDisabled={complaintButtonDisabled}
          isSubmittingComplaint={isSubmittingComplaint}
          canSubmitRevision={canSubmitRevision}
        />

        {latestEntry && (
          <section className="panel">
            <h2>{app.sections.latestResult}</h2>
            <ResultView entry={latestEntry} />
          </section>
        )}

        {history.length > 1 && (
          <section className="panel">
            <h2>{app.sections.history}</h2>
            <HistoryList entries={history.slice(1)} />
          </section>
        )}
      </main>

      {progressModalVisible && <ProgressModal stage={progressModalStage} logs={progressModalLogs} />}
    </div>
  );
}
