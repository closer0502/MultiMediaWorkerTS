import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

type LogStreamEntry = {
  res: ExpressResponse;
  heartbeat: NodeJS.Timeout;
  closed: boolean;
};

export class LogStreamManager {
  private readonly streams = new Map<string, LogStreamEntry>();

  extractLogChannel(req: Pick<ExpressRequest, 'query' | 'headers'>) {
    const fromQuery = this.normalizeChannelId(req.query?.logChannel);
    const fromHeader = this.normalizeChannelId(req.headers?.['x-log-channel']);
    return fromQuery || fromHeader || '';
  }

  normalizeChannelId(value: unknown) {
    if (Array.isArray(value)) {
      const candidate = value.find((item) => typeof item === 'string' && item.trim().length > 0);
      return this.normalizeChannelId(candidate ?? '');
    }
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(trimmed)) {
      return '';
    }
    return trimmed;
  }

  async waitForLogChannel(channelId: string, timeoutMs = 1000): Promise<void> {
    if (!channelId) {
      return;
    }
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (Date.now() - start < timeoutMs) {
      const entry = this.streams.get(channelId);
      if (entry && !entry.closed) {
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
    }
  }

  handleTaskLogStream(req: ExpressRequest, res: ExpressResponse) {
    const channelId =
      this.normalizeChannelId(req.query?.channel) || this.normalizeChannelId(req.query?.logChannel);
    if (!channelId) {
      res.status(400).json({ error: 'channel query parameter is required.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const existing = this.streams.get(channelId);
    if (existing) {
      existing.closed = true;
      clearInterval(existing.heartbeat);
      this.streams.delete(channelId);
      existing.res.end();
    }

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keep-alive\n\n');
      }
    }, 15000);

    const entry = { res, heartbeat, closed: false };
    this.streams.set(channelId, entry);

    res.write('event: ready\n');
    res.write('data: {}\n\n');

    req.on('close', () => {
      if (!entry.closed) {
        entry.closed = true;
        clearInterval(entry.heartbeat);
        this.streams.delete(channelId);
      }
    });
  }

  sendLogMessage(channelId: string, message: string) {
    if (!channelId || !message) {
      return;
    }
    this.sendLogEvent(channelId, 'info', { message });
  }

  sendLogError(channelId: string, message: string) {
    if (!channelId || !message) {
      return;
    }
    this.sendLogEvent(channelId, 'error', { message });
  }

  sendLogEvent(channelId: string, eventName: string, payload: Record<string, any> = {}) {
    if (!channelId) {
      return;
    }
    const entry = this.streams.get(channelId);
    if (!entry || entry.closed) {
      return;
    }
    try {
      const serialized = JSON.stringify(payload ?? {});
      entry.res.write(`event: ${eventName}\n`);
      entry.res.write(`data: ${serialized}\n\n`);
    } catch (error) {
      entry.closed = true;
      clearInterval(entry.heartbeat);
      this.streams.delete(channelId);
      entry.res.end();
      // eslint-disable-next-line no-console
      console.error('Failed to send log event', error);
    }
  }

  closeLogStream(channelId: string, payload: Record<string, any> = {}) {
    if (!channelId) {
      return;
    }
    const entry = this.streams.get(channelId);
    if (!entry || entry.closed) {
      return;
    }
    this.sendLogEvent(channelId, 'end', payload ?? {});
    entry.closed = true;
    clearInterval(entry.heartbeat);
    this.streams.delete(channelId);
    entry.res.end();
  }

  createCommandLogHandlers(channelId: string) {
    return {
      onCommandStart: ({ index, step }) => {
        const commandLine = this.formatCommandLine(step);
        this.sendLogEvent(channelId, 'command_start', {
          index,
          command: step?.command ?? '',
          arguments: Array.isArray(step?.arguments) ? step.arguments : [],
          commandLine
        });
      },
      onCommandOutput: ({ index, stream, text }) => {
        if (!text) {
          return;
        }
        this.sendLogEvent(channelId, 'log', {
          index,
          stream,
          text
        });
      },
      onCommandEnd: ({ index, exitCode, timedOut }) => {
        this.sendLogEvent(channelId, 'command_end', {
          index,
          exitCode,
          timedOut
        });
      },
      onCommandSkip: ({ index, step, reason }) => {
        const commandLine = this.formatCommandLine(step);
        this.sendLogEvent(channelId, 'command_skip', {
          index,
          reason,
          command: step?.command ?? '',
          commandLine
        });
      }
    };
  }

  private formatCommandLine(step?: { command?: string; arguments?: string[] }) {
    if (!step) {
      return '';
    }
    const args = Array.isArray(step.arguments) ? step.arguments : [];
    const parts = [step.command, ...args]
      .map((part) => (part === undefined || part === null ? '' : String(part)))
      .filter((part) => part.length > 0);
    return parts.join(' ').trim();
  }
}
