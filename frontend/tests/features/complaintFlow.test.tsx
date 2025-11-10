import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { MESSAGES } from '../../src/i18n/messages';

describe('修正リクエストフロー', () => {
  afterEach(() => {
    if (typeof vi.unstubAllGlobals === 'function') {
      vi.unstubAllGlobals();
    }
    vi.restoreAllMocks();
  });

  it('生成物がない場合は修正リクエストボタンが無効になる', async () => {
    const user = userEvent.setup();
    render(<App />);

    const complaintField = screen.getByPlaceholderText(MESSAGES.latestOutputs.complaintPlaceholder);
    await user.type(complaintField, '生成物にノイズが乗ってしまいました');

    const complaintButton = screen.getByRole('button', { name: MESSAGES.latestOutputs.complaintButton });
    expect(complaintButton).toBeDisabled();
    expect(screen.getByText(MESSAGES.complaint.helperWithoutOutputs)).toBeInTheDocument();
  });

  it('最新の生成物に対して修正リクエストを送信できる', async () => {
    const taskPayload = {
      sessionId: 'session-1',
      submittedAt: '2024-01-10T00:00:00.000Z',
      task: 'テスト用タスク',
      plan: {
        overview: '',
        followUp: '',
        steps: [
          {
            command: 'ffmpeg',
            arguments: ['-i', 'input.mp4', 'output.mp4'],
            reasoning: 'convert',
            outputs: [{ path: '/tmp/output.mp4', description: 'converted' }]
          }
        ]
      },
      result: {
        exitCode: 0,
        timedOut: false,
        stdout: '',
        stderr: '',
        resolvedOutputs: [{ path: '/tmp/output.mp4', description: 'converted', exists: true }],
        steps: []
      },
      phases: [],
      uploadedFiles: [],
      status: 'success',
      detail: null,
      debug: null,
      responseText: null
    };

    const revisionPayload = {
      sessionId: 'session-2',
      parentSessionId: 'session-1',
      submittedAt: '2024-01-11T00:00:00.000Z',
      task: 'テスト用タスク',
      plan: taskPayload.plan,
      result: taskPayload.result,
      phases: [],
      uploadedFiles: [],
      status: 'success',
      detail: null,
      debug: null,
      responseText: null,
      complaint: 'もう少し明るくしてください。'
    };

    const mockFetch = vi.fn((url) => {
      if (url.startsWith('/api/tasks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(taskPayload)
        });
      }
      if (url.startsWith('/api/revisions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(revisionPayload)
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', mockFetch);

    const user = userEvent.setup();
    render(<App />);

    const taskField = screen.getByLabelText(MESSAGES.taskForm.taskLabel);
    await user.type(taskField, 'テスト用タスク');
    await user.click(screen.getByRole('button', { name: MESSAGES.taskForm.submit }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'POST' }))
    );

    await screen.findByRole('heading', { name: MESSAGES.app.sections.latestResult });
    const complaintField = screen.getByPlaceholderText(MESSAGES.latestOutputs.complaintPlaceholder);
    await user.type(complaintField, revisionPayload.complaint);

    const complaintButton = screen.getByRole('button', { name: MESSAGES.latestOutputs.complaintButton });
    await waitFor(() => expect(complaintButton).toBeEnabled());

    await user.click(complaintButton);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/revisions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' })
        })
      )
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const latestHeader = await screen.findByRole('heading', { name: MESSAGES.app.sections.latestResult });
    expect(latestHeader).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.result.revisionChip)).toBeInTheDocument();
    expect(screen.getByText(revisionPayload.complaint)).toBeInTheDocument();
  });
});
