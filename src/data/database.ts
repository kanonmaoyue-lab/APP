import Dexie, { type Table } from 'dexie';
import type { Entity, Operation } from '../domain/types';
export interface QueueRow {
  sequence?: number;
  id: string;
  operation: Operation;
}
export class Database extends Dexie {
  base!: Table<Entity, [string, string]>;
  queue!: Table<QueueRow, number>;
  meta!: Table<{ key: string; value: unknown }, string>;
  constructor(userId: string) {
    super('little-days:' + userId);
    this.version(1).stores({ base: '[table+id],table', queue: '++sequence,&id', meta: '&key' });
  }
}
