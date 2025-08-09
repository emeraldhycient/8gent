// Async sqlite3 implementation
// @ts-ignore
import sqlite3 from 'sqlite3';
sqlite3.verbose();

let dbPromise: Promise<sqlite3.Database> | null = null;

function getDb(): Promise<sqlite3.Database> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const db = new sqlite3.Database('data.sqlite', (err: Error | null) => {
        if (err) return reject(err);
        db.serialize(() => {
          db.run(`CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE,
            parent_url TEXT,
            depth INTEGER DEFAULT 0,
            discovered_at INTEGER DEFAULT (strftime('%s','now')),
            crawled INTEGER DEFAULT 0
          )`);
          db.run(`CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            url TEXT UNIQUE,
            company TEXT,
            location TEXT,
            description TEXT,
            summary TEXT,
            metadata TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now'))
          )`);
          resolve(db);
        });
      });
    });
  }
  return dbPromise;
}

export async function upsertLink(url: string, parent_url: string | null, depth: number) {
  const db = await getDb();
  return new Promise<void>((resolve) => {
    db.run(`INSERT OR IGNORE INTO links (url, parent_url, depth) VALUES (?,?,?)`, [url, parent_url, depth], () => resolve());
  });
}

export async function markCrawled(url: string) {
  const db = await getDb();
  return new Promise<void>((resolve) => {
    db.run(`UPDATE links SET crawled=1 WHERE url=?`, [url], () => resolve());
  });
}

export async function getUncrawledBatch(limit=20): Promise<{url:string; depth:number}[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.all(`SELECT url, depth FROM links WHERE crawled=0 ORDER BY id LIMIT ?`, [limit], (err: Error | null, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows as {url:string; depth:number}[]);
    });
  });
}

export async function upsertJob(job: {title?:string|null; url:string; company?:string|null; location?:string|null; description?:string|null; summary?: string | null; metadata?: any;}) {
  const db = await getDb();
  return new Promise<void>((resolve) => {
    db.run(`INSERT INTO jobs (title,url,company,location,description,summary,metadata)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(url) DO UPDATE SET title=excluded.title, company=excluded.company, location=excluded.location, description=excluded.description, summary=excluded.summary, metadata=excluded.metadata`,
      [job.title, job.url, job.company, job.location, job.description, job.summary, job.metadata ? JSON.stringify(job.metadata) : null],
      () => resolve());
  });
}

export async function listJobs(limit=50) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM jobs ORDER BY id DESC LIMIT ?`, [limit], (err: Error | null, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}
