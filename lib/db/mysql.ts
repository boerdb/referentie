import mysql from "mysql2/promise";

/** Zelfde patroon als med-track-pwa / dash-next-app */
let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = mysql.createPool({
      uri: url,
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
    });
  }
  return pool;
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Voert `fn` uit binnen één transactie; bij een fout wordt alles teruggedraaid. */
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}
