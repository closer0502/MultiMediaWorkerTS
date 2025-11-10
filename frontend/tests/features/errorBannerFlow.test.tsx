import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { MESSAGES } from '../../src/i18n/messages';

describe('エラーバナーのリトライフロー', () => {
  afterEach(() => {
    if (typeof vi.unstubAllGlobals === 'function') {
      vi.unstubAllGlobals();
    }
    vi.restoreAllMocks();
  });

  it('プラン失敗時にエラーバナーを表示し、再実行ボタンでリトライできる', async () => {
    const failurePayload = {
      status: 'failed',
      sessionId: 'session-error',
      error: 'Task execution failed.',
      detail: 'Command "magick" exited with code 1.',
      phases: [
        { id: 'plan', status: 'success' },
        { id: 'execute', status: 'failed' }
      ],
      plan: { steps: [{ command: 'magick', arguments: [] }] },
      rawPlan: { steps: [{ command: 'magick', arguments: [] }] },
      result: {
        exitCode: 1,
        timedOut: false,
        stdout: '',
        stderr: 'error',
        resolvedOutputs: [],
        dryRun: false,
        steps: [
          {
            status: 'executed',
            command: 'magick',
            exitCode: 1,
            timedOut: false,
            stdout: '',
            stderr: 'error'
          },
          {
            status: 'skipped',
            command: 'magick',
            exitCode: null,
            timedOut: false,
            stdout: '',
            stderr: '',
            skipReason: 'previous_step_failed'
          }
        ]
      },
      responseText: 'failure'
    };

    const successPayload = {
      status: 'success',
      sessionId: 'session-success',
      task: '画像をオーバーレイ合成',
      plan: { steps: [{ command: 'magick', arguments: ['-help'] }] },
      rawPlan: { steps: [{ command: 'magick', arguments: ['-help'] }] },
      result: {
        exitCode: 0,
        timedOut: false,
        stdout: 'done',
        stderr: '',
        resolvedOutputs: [
          {
            path: '/generated/overlay.png',
            description: 'final image',
            href: '/files/generated/overlay.png',
            exists: true
          }
        ],
        dryRun: false,
        steps: [
          {
            status: 'executed',
            command: 'magick',
            exitCode: 0,
            timedOut: false,
            stdout: 'done',
            stderr: ''
          }
        ]
      },
      phases: [
        { id: 'plan', status: 'success' },
        { id: 'execute', status: 'success' }
      ],
      debug: null,
      uploadedFiles: [],
      parentSessionId: null,
      complaint: null,
      submittedAt: '2024-01-10T00:00:00.000Z'
    };

    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<any>>()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () => Promise.resolve(failurePayload)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(successPayload)
      });

    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<App />);

    const taskField = screen.getByLabelText(MESSAGES.taskForm.taskLabel) as HTMLTextAreaElement;
    await user.type(taskField, '画像をオーバーレイ合成');
    await user.click(screen.getByRole('button', { name: MESSAGES.taskForm.submit }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(firstUrl).toBe('/api/tasks');
    expect(firstInit.body).toBeInstanceOf(FormData);

    const bannerTitle = await screen.findByText(MESSAGES.latestOutputs.errorTitle);
    const banner = bannerTitle.closest('.error-banner');
    expect(banner).not.toBeNull();
    expect(within(banner as HTMLElement).getByText(failurePayload.detail)).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: MESSAGES.latestOutputs.errorAction });
    await user.click(retryButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/tasks');

    await waitFor(() => expect(document.querySelector('.error-banner')).toBeNull());
    expect(await screen.findByRole('heading', { name: MESSAGES.app.sections.latestResult })).toBeInTheDocument();
  });

  it('エラーから再編集ボタン押下で再送信用プロンプトが含まれた依頼を送信する', async () => {
    class MockFormData {
      private readonly store: Array<[string, FormDataEntryValue]> = [];
      append(key: string, value: FormDataEntryValue) {
        this.store.push([key, value]);
      }
      get(key: string) {
        const entry = this.store.find(([name]) => name === key);
        return entry ? entry[1] : undefined;
      }
    }

    vi.stubGlobal('FormData', MockFormData);

    const originalTask = 'resize sample.png to 256x256 and convert to webp';
    const failurePayload = {
      status: 'failed',
      sessionId: 'failure-session',
      task: originalTask,
      detail: 'Command "magick" exited with code 1.',
      result: {
        exitCode: 1,
        timedOut: false,
        stdout: '',
        stderr: 'aggregate stderr output',
        resolvedOutputs: [],
        dryRun: false,
        steps: [
          {
            status: 'executed',
            command: 'magick',
            arguments: ['convert'],
            exitCode: 1,
            timedOut: false,
            stdout: '',
            stderr: 'command line stderr details'
          }
        ]
      },
      plan: { steps: [{ command: 'magick', arguments: ['convert'] }] },
      rawPlan: { steps: [{ command: 'magick', arguments: ['convert'] }] },
      phases: [
        { id: 'plan', status: 'success' },
        { id: 'execute', status: 'failed' }
      ],
      responseText: 'dummy llm response text'
    };

    const successPayload = {
      status: 'success',
      sessionId: 'retry-success',
      task: originalTask,
      plan: { steps: [{ command: 'magick', arguments: ['convert'] }] },
      rawPlan: { steps: [{ command: 'magick', arguments: ['convert'] }] },
      result: {
        exitCode: 0,
        timedOut: false,
        stdout: 'done',
        stderr: '',
        resolvedOutputs: [],
        dryRun: false,
        steps: [
          {
            status: 'executed',
            command: 'magick',
            arguments: ['convert'],
            exitCode: 0,
            timedOut: false,
            stdout: 'done',
            stderr: ''
          }
        ]
      },
      phases: [
        { id: 'plan', status: 'success' },
        { id: 'execute', status: 'success' }
      ],
      uploadedFiles: [],
      parentSessionId: 'failure-session',
      complaint: null,
      submittedAt: '2024-01-11T00:00:00.000Z'
    };

    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<any>>()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () => Promise.resolve(failurePayload)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(successPayload)
      });

    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<App />);

    const taskField = screen.getByLabelText(MESSAGES.taskForm.taskLabel) as HTMLTextAreaElement;
    await user.type(taskField, originalTask);
    await user.click(screen.getByRole('button', { name: MESSAGES.taskForm.submit }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const firstCall = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const firstFormData = firstCall[1].body as unknown as MockFormData;
    expect(firstFormData).toBeInstanceOf(MockFormData);
    expect(firstFormData.get('task')).toBe(originalTask);

    const retryButton = await screen.findByRole('button', { name: MESSAGES.latestOutputs.errorAction });
    await user.click(retryButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const retryCall = fetchMock.mock.calls[1] as [RequestInfo | URL, RequestInit];
    const retryFormData = retryCall[1].body as unknown as MockFormData;
    expect(retryFormData).toBeInstanceOf(MockFormData);

    const retryTask = retryFormData.get('task');
    expect(typeof retryTask).toBe('string');
    const retryTaskText = retryTask as string;
    expect(retryTaskText).toBeTruthy();
    expect(retryTaskText).not.toBe(originalTask);
    expect(retryTaskText.startsWith('エラー再編集リクエストです。')).toBe(true);
    expect(retryTaskText).toContain(`元の依頼内容:\n${originalTask}`);
    expect(retryTaskText).toContain('エラー履歴:');
    expect(retryTaskText).toContain('"最新"');
    expect(retryTaskText).toContain(failurePayload.detail);
    expect(retryTaskText).toContain(failurePayload.responseText);
    expect(retryTaskText).toContain(failurePayload.result.steps[0].stderr);
    expect(retryTaskText).toContain(failurePayload.result.stderr);

    await waitFor(() => expect(taskField.value).toBe(retryTaskText));
  });
});
