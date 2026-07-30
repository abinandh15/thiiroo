import { openDB, type IDBPDatabase } from 'idb';
import type { ActivityEvent, Order } from './types';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB('thiiroo-dashboard', 1, {
      upgrade(d) {
        d.createObjectStore('orders', { keyPath: 'key' });
        d.createObjectStore('activity', { autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

const orderKey = (o: Order) => `${o.id}::${o.itemId}`;

export async function saveOrder(order: Order): Promise<void> {
  const d = await db();
  await d.put('orders', { key: orderKey(order), order });
}

export async function deleteOrder(order: Order): Promise<void> {
  const d = await db();
  await d.delete('orders', orderKey(order));
}

export async function loadOrders(): Promise<Order[]> {
  const d = await db();
  const rows = (await d.getAll('orders')) as { key: string; order: Order }[];
  return rows.map((r) => r.order).sort((a, b) => a.importedAt - b.importedAt);
}

export async function logActivity(ev: ActivityEvent): Promise<void> {
  const d = await db();
  await d.put('activity', ev);
}

export async function loadActivity(limit = 30): Promise<ActivityEvent[]> {
  const d = await db();
  const all = (await d.getAll('activity')) as ActivityEvent[];
  return all.sort((a, b) => b.at - a.at).slice(0, limit);
}
