import Dexie, { type Table } from 'dexie';

export interface DetectorLogRecord {
  id?: number;
  detector: string;
  providerVersion: string;
  errorType: 'selector_miss' | 'observer_error' | 'init_fail';
  at: number;
  message: string;
}

export class IdleDb extends Dexie {
  detectorLogs!: Table<DetectorLogRecord, number>;

  constructor() {
    super('idle-db');
    this.version(1).stores({
      detectorLogs: '++id, detector, at',
    });
  }
}

export const db = new IdleDb();
