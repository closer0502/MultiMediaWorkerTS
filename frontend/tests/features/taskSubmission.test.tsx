import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { MESSAGES } from '../../src/i18n/messages';

describe('タスク送信フォーム', () => {
  afterEach(() => {
    if (typeof vi.unstubAllGlobals === 'function') {
      vi.unstubAllGlobals();
    }
    vi.restoreAllMocks();
  });

  it('初期表示でフォームとガイダンスが確認できる', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: MESSAGES.app.header.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: MESSAGES.app.sections.taskForm })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.taskForm.submit })).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.latestOutputs.empty)).toBeInTheDocument();
  });

  it('入力が空のまま送信するとバリデーションエラーを表示する', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: MESSAGES.taskForm.submit }));

    const validationMessages = await screen.findAllByText((content) =>
      content.includes(MESSAGES.workflow.validation.emptyTask)
    );
    expect(validationMessages.length).toBeGreaterThan(0);
  });

  it('ファイルを含むタスク送信で成功レスポンスを履歴に記録する', async () => {
    const payload = {
      sessionId: 'session-1',
      submittedAt: '2024-01-10T00:00:00.000Z',
      task: '画像をリサイズ',
      plan: {
        overview: 'Simple plan',
        followUp: '',
        steps: [
          {
            command: 'ffmpeg',
            arguments: ['-i', 'input.mp4', '-vf', 'scale=1280:720', 'output.mp4'],
            reasoning: 'Resize video',
            outputs: [{ path: '/tmp/output.mp4', description: 'resized video' }]
          }
        ]
      },
      result: {
        exitCode: 0,
        timedOut: false,
        stdout: '[step 1] ok',
        stderr: '',
        resolvedOutputs: [{ path: '/tmp/output.mp4', description: 'resized video', exists: true }],
        steps: [
          {
            status: 'executed',
            command: 'ffmpeg',
            arguments: ['-i', 'input.mp4', '-vf', 'scale=1280:720', 'output.mp4'],
            reasoning: 'Resize video',
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
      uploadedFiles: [
        { id: 'file-1', originalName: 'sample.png', size: 1024, mimeType: 'image/png' }
      ],
      status: 'success',
      detail: null,
      debug: null,
      responseText: null
    };

    let resolveFetch;
    const mockFetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve({
              ok: true,
              json: () => Promise.resolve(payload)
            });
        })
    );
    vi.stubGlobal('fetch', mockFetch);

    const user = userEvent.setup();
    render(<App />);

    const taskField = screen.getByLabelText(MESSAGES.taskForm.taskLabel);
    await user.type(taskField, '画像をリサイズ');

    const fileInput = screen.getByLabelText(MESSAGES.taskForm.attachLabel);
    const file = new File(['content'], 'sample.png', { type: 'image/png' });
    await user.upload(fileInput, file);

    expect(screen.getByText(MESSAGES.filePreview.selectedLabel(1))).toBeInTheDocument();
    expect(screen.getByText('sample.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: MESSAGES.taskForm.submit }));

    expect(await screen.findByRole('button', { name: MESSAGES.taskForm.submitting })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: MESSAGES.progress.dialogTitle })).toBeInTheDocument();

    resolveFetch();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData)
      })
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: MESSAGES.taskForm.submit })).toBeEnabled();

    expect(await screen.findByRole('heading', { name: MESSAGES.app.sections.latestResult })).toBeInTheDocument();
    expect(screen.getAllByText(MESSAGES.progress.statusLabels.success)).not.toHaveLength(0);
    expect(screen.getByText('画像をリサイズ')).toBeInTheDocument();
    expect(screen.getByText(/1）ffmpeg/)).toBeInTheDocument();
  });
});
