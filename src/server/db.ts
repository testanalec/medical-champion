import postgres from '../../vendor/postgres/index.js';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

export type Sql = any;

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  'postgres://postgres:postgres@localhost:5432/mc';

const isLocal = /localhost|127\.0\.0\.1/.test(url);

declare global {
  // eslint-disable-next-line no-var
  var __mcSql: Sql | undefined;
  // eslint-disable-next-line no-var
  var __mcReady: Promise<void> | undefined;
}

function makeClient(): Sql {
  return (postgres as any)(url, {
    max: isLocal ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // compatible with pgbouncer / Neon pooled connections
    ssl: isLocal ? false : 'require',
    onnotice: () => {},
    types: {
      numeric: { to: 1700, from: [1700], serialize: (x: any) => String(x), parse: (x: string) => parseFloat(x) },
      bigint: { to: 20, from: [20], serialize: (x: any) => String(x), parse: (x: string) => Number(x) },
    },
  });
}

export const sql: Sql = globalThis.__mcSql ?? (globalThis.__mcSql = makeClient());

export function ready(): Promise<void> {
  if (!globalThis.__mcReady) {
    globalThis.__mcReady = init().catch((e) => {
      globalThis.__mcReady = undefined;
      throw e;
    });
  }
  return globalThis.__mcReady;
}

async function init() {
  // Fast path: already migrated + seeded
  try {
    const rows = await sql`SELECT version, seeded_at FROM schema_meta WHERE id = 1`;
    if (rows[0] && rows[0].version >= SCHEMA_VERSION && rows[0].seeded_at) return;
  } catch {
    /* table doesn't exist yet */
  }
  await sql.begin(async (tx: Sql) => {
    await tx`SELECT pg_advisory_xact_lock(884422)`;
    const meta = await tx`SELECT to_regclass('public.schema_meta') AS t`;
    let current: any = null;
    if (meta[0].t) {
      current = (await tx`SELECT version, seeded_at FROM schema_meta WHERE id = 1`)[0];
    }
    if (!current || current.version < SCHEMA_VERSION) {
      await tx.unsafe(SCHEMA_SQL);
      await tx`INSERT INTO schema_meta (id, version) VALUES (1, ${SCHEMA_VERSION})
               ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version`;
    }
    const again = (await tx`SELECT seeded_at FROM schema_meta WHERE id = 1`)[0];
    if (!again.seeded_at) {
      const { seed } = await import('./seed');
      await seed(tx);
      await tx`UPDATE schema_meta SET seeded_at = now() WHERE id = 1`;
    }
  });
}

/** Resets the database (used by demo reset + tests). */
export async function resetDatabase() {
  await sql.unsafe(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  globalThis.__mcReady = undefined;
  await ready();
}
