import fs from 'node:fs/promises';
import path from 'node:path';

export class SessionRecordStore {
  private readonly storageRoot: string;

  constructor(storageRoot: string) {
    this.storageRoot = storageRoot;
  }

  buildSessionRecord(payload) {
    return {
      id: payload.sessionId,
      submittedAt: payload.submittedAt,
      task: payload.task,
      status: payload.status,
      plan: payload.plan ?? null,
      rawPlan: payload.rawPlan ?? null,
      result: payload.result ?? null,
      phases: payload.phases ?? [],
      uploadedFiles: payload.uploadedFiles ?? [],
      requestOptions: payload.requestOptions ?? {},
      debug: payload.debug ?? null,
      error: payload.error ?? null,
      detail: payload.detail ?? null,
      responseText: payload.responseText ?? null,
      parentSessionId: payload.parentSessionId ?? null,
      complaintContext: payload.complaintContext ?? null,
      complaints: Array.isArray(payload.complaints) ? payload.complaints : []
    };
  }

  async writeSessionRecord(record) {
    const filePath = this.getSessionRecordPath(record.id);
    const payload = JSON.stringify(record, null, 2);
    await fs.writeFile(filePath, payload, 'utf8');
  }

  async readSessionRecord(sessionId) {
    const filePath = this.getSessionRecordPath(sessionId);
    try {
      const buffer = await fs.readFile(filePath, 'utf8');
      return JSON.parse(buffer);
    } catch (error) {
      if (error && (error as any).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async appendComplaintEntry(sessionId, entry) {
    const record = await this.readSessionRecord(sessionId);
    if (!record) {
      return;
    }
    const complaints = Array.isArray(record.complaints) ? record.complaints.slice() : [];
    complaints.push(entry);
    record.complaints = complaints;
    await this.writeSessionRecord(record);
  }

  async collectRevisionHistory(startRecord) {
    if (!startRecord) {
      return [];
    }
    /** @type {Record<string, any>[]} */
    const history = [];
    const visited = new Set();
    let current = startRecord;
    let safetyCounter = 0;

    while (current && !visited.has(current.id) && safetyCounter < 25) {
      history.push(current);
      visited.add(current.id);
      safetyCounter += 1;
      if (!current.parentSessionId) {
        break;
      }
      const parent = await this.readSessionRecord(current.parentSessionId);
      if (!parent) {
        break;
      }
      current = parent;
    }

    return history;
  }

  async clearStorageRecords() {
    let entries;
    try {
      entries = await fs.readdir(this.storageRoot, { withFileTypes: true });
    } catch (error) {
      if (error && (error as any).code === 'ENOENT') {
        return;
      }
      throw new Error('Failed to scan storage directory.', { cause: error });
    }

    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
          return;
        }
        const targetPath = path.join(this.storageRoot, entry.name);
        try {
          await fs.rm(targetPath, { force: true });
        } catch (error) {
          throw new Error(`繧ｹ繝医Ξ繝ｼ繧ｸ繝輔ぃ繧､繝ｫ縺ｮ蜑企勁縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ${targetPath}`, { cause: error });
        }
      })
    );
  }

  getSessionRecordPath(sessionId: string) {
    return path.join(this.storageRoot, `${sessionId}.json`);
  }
}
