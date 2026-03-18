import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export interface CategoryRow {
  id: string;
  name: string;
  position: number;
}

export async function listCategories(db: DbClient): Promise<CategoryRow[]> {
  const { rows } = await db.query<CategoryRow>(
    'select id, name, position from categories order by position asc, name asc',
  );
  return rows;
}

export async function createCategory(
  db: DbClient,
  input: { name: string; position?: number },
): Promise<CategoryRow> {
  const { rows } = await db.query<CategoryRow>(
    `
      insert into categories(name, position)
      values ($1, $2)
      returning id, name, position
    `,
    [input.name, input.position ?? 0],
  );
  return rows[0];
}

export async function updateCategory(
  db: DbClient,
  id: string,
  input: { name?: string; position?: number },
): Promise<CategoryRow | null> {
  const fields: string[] = [];
  const values: Array<string | number> = [];
  let paramIndex = 1;

  if (typeof input.name !== 'undefined') {
    fields.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (typeof input.position !== 'undefined') {
    fields.push(`position = $${paramIndex++}`);
    values.push(input.position);
  }
  if (fields.length === 0) return null;

  fields.push('updated_at = now()');
  values.push(id);

  const { rows } = await db.query<CategoryRow>(
    `
      update categories
      set ${fields.join(', ')}
      where id = $${paramIndex}
      returning id, name, position
    `,
    values,
  );

  return rows[0] ?? null;
}

export async function deleteCategory(db: DbClient, id: string): Promise<boolean> {
  const res = await db.query('delete from categories where id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function findCategoryByNormalizedName(
  db: DbClient,
  name: string,
): Promise<CategoryRow | null> {
  const { rows } = await db.query<CategoryRow>(
    `
      select id, name, position
      from categories
      where lower(btrim(name)) = lower(btrim($1))
      limit 1
    `,
    [name.trim()],
  );
  return rows[0] ?? null;
}

export async function getNextCategoryPosition(db: DbClient): Promise<number> {
  const { rows } = await db.query<{ nextPosition: number }>(
    'select coalesce(max(position), -1) + 1 as "nextPosition" from categories',
  );
  return rows[0]?.nextPosition ?? 0;
}

export async function reorderCategories(
  db: DbClient,
  items: Array<{ id: string; position: number }>,
): Promise<CategoryRow[]> {
  await db.query('begin');
  try {
    const ids = items.map((item) => item.id);
    const positions = items.map((item) => item.position);

    const existing = await db.query<{ id: string }>(
      'select id from categories where id = any($1::bigint[])',
      [ids],
    );
    if (existing.rows.length !== ids.length) {
      throw new Error('category_not_found');
    }

    await db.query(
      `
      update categories as c
      set position = v.position,
          updated_at = now()
      from (
        select unnest($1::bigint[]) as id, unnest($2::int[]) as position
      ) as v
      where c.id = v.id
      `,
      [ids, positions],
    );

    const result = await db.query<CategoryRow>(
      'select id, name, position from categories order by position asc, name asc',
    );

    await db.query('commit');
    return result.rows;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
