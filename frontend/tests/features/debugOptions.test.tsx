import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { MESSAGES } from '../../src/i18n/messages';

describe('デバッグオプション', () => {
  afterEach(() => {
    if (typeof vi.unstubAllGlobals === 'function') {
      vi.unstubAllGlobals();
    }
    vi.restoreAllMocks();
  });

  it('ドライランとデバッグを有効にするとAPIのクエリが切り替わる', async () => {
    const payload = {
      sessionId: 'session-debug',
      submittedAt: '2024-01-10T00:00:00.000Z',
      task: 'sample',
      plan: { overview: '', followUp: '', steps: [] },
      result: { exitCode: 0, timedOut: false, stdout: '', stderr: '', resolvedOutputs: [], steps: [] },
      phases: [],
      uploadedFiles: [],
      status: 'success',
      detail: null,
      debug: null,
      responseText: null
    };

    const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<any>>(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payload)
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const user = userEvent.setup();
    render(<App />);

    const dryRunCheckbox = screen.getByLabelText(MESSAGES.taskForm.dryRunLabel);
    const debugCheckbox = screen.getByLabelText(MESSAGES.taskForm.debugVerboseLabel);

    expect(dryRunCheckbox).not.toBeChecked();
    expect(debugCheckbox).not.toBeChecked();

    await user.click(dryRunCheckbox);
    await user.click(debugCheckbox);

    expect(dryRunCheckbox).toBeChecked();
    expect(debugCheckbox).toBeChecked();

    const taskField = screen.getByLabelText(MESSAGES.taskForm.taskLabel);
    await user.type(taskField, 'テスト');

    await user.click(screen.getByRole('button', { name: MESSAGES.taskForm.submit }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    expect(mockFetch.mock.calls[0][0]).toBe('/api/tasks?debug=verbose&dryRun=true');
  });

  it('デバッグオプションを閉じるとチェックボックスが非表示になる', async () => {
    const user = userEvent.setup();
    render(<App />);

    const headerToggle = screen.getByLabelText(MESSAGES.taskForm.debugOptionsTitle);
    expect(screen.getByLabelText(MESSAGES.taskForm.dryRunLabel)).toBeInTheDocument();

    await user.click(headerToggle);

    expect(headerToggle).not.toBeChecked();
    expect(screen.queryByLabelText(MESSAGES.taskForm.dryRunLabel)).not.toBeInTheDocument();

    await user.click(headerToggle);

    expect(headerToggle).toBeChecked();
    expect(screen.getByLabelText(MESSAGES.taskForm.debugVerboseLabel)).toBeInTheDocument();
  });
});
