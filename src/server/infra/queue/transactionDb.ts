import type { PoolClient } from 'pg';
import type { Db } from 'pg-boss';

export function createQueueTransactionDb(client: PoolClient): Db {
  // 将 pg-boss 的 SQL 交给业务事务连接，保证任务与业务数据一起提交或回滚。
  return { executeSql: (text, values) => client.query(text, values) };
}
