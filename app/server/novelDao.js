import db from './db.js';

// Upsert a novel and manage tags
export function upsertNovel(novel) {
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO novels (
      id, title, author, author_id, summary, status,
      word_count, chapter_count, click_count, collection_count,
      score, update_time, cover_url,
      created_at, updated_at, last_synced_at, is_deleted
    ) VALUES (
      @id, @title, @author, @author_id, @summary, @status,
      @word_count, @chapter_count, @click_count, @collection_count,
      @score, @update_time, @cover_url,
      @created_at, @updated_at, @last_synced_at, 0
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      author = excluded.author,
      author_id = excluded.author_id,
      summary = excluded.summary,
      status = excluded.status,
      word_count = excluded.word_count,
      chapter_count = excluded.chapter_count,
      click_count = excluded.click_count,
      collection_count = excluded.collection_count,
      score = excluded.score,
      update_time = excluded.update_time,
      cover_url = excluded.cover_url,
      updated_at = excluded.updated_at,
      last_synced_at = excluded.last_synced_at,
      is_deleted = 0;
  `);

  const existing = db.prepare('SELECT created_at FROM novels WHERE id = ?').get(novel.id);
  const createdAt = existing ? existing.created_at : now;

  stmt.run({
    id: novel.id,
    title: novel.title,
    author: novel.author,
    author_id: novel.author_id,
    summary: novel.summary,
    status: novel.status,
    word_count: novel.word_count ?? null,
    chapter_count: novel.chapter_count ?? null,
    click_count: novel.click_count ?? null,
    collection_count: novel.collection_count ?? null,
    score: novel.score ?? null,
    update_time: novel.update_time ?? null,
    cover_url: novel.cover_url ?? null,
    created_at: createdAt,
    updated_at: now,
    last_synced_at: now,
  });

  // Refresh tags
  if (Array.isArray(novel.tags) && novel.tags.length > 0) {
    syncTags(novel.id, novel.tags);
  }

  return getNovelById(novel.id);
}

function syncTags(novelId, tags) {
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const deleteOld = db.prepare('DELETE FROM novel_tags WHERE novel_id = ?');
  const insertLink = db.prepare('INSERT OR IGNORE INTO novel_tags (novel_id, tag_id) VALUES (?, ?)');

  deleteOld.run(novelId);

  for (const tag of tags) {
    const name = tag.trim();
    if (!name) continue;
    insertTag.run(name);
    const row = getTag.get(name);
    if (row) {
      insertLink.run(novelId, row.id);
    }
  }
}

export function getNovelById(id) {
  const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(id);
  if (!novel) return null;
  novel.tags = getTagsByNovelId(id);
  return novel;
}

function getTagsByNovelId(novelId) {
  const rows = db.prepare(`
    SELECT t.name FROM tags t
    INNER JOIN novel_tags nt ON t.id = nt.tag_id
    WHERE nt.novel_id = ?
    ORDER BY t.name
  `).all(novelId);
  return rows.map(r => r.name);
}

export function listNovels({ keyword, tags, author, status, limit = 50, offset = 0 } = {}) {
  const conditions = ['is_deleted = 0'];
  const params = [];

  if (keyword) {
    conditions.push('(title LIKE ? OR summary LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (author) {
    conditions.push('author LIKE ?');
    params.push(`%${author}%`);
  }

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  let joinClause = '';
  let havingClause = '';

  if (Array.isArray(tags) && tags.length > 0) {
    const placeholders = tags.map(() => '?').join(',');
    joinClause = `
      INNER JOIN (
        SELECT novel_id FROM novel_tags
        INNER JOIN tags ON novel_tags.tag_id = tags.id
        WHERE tags.name IN (${placeholders})
        GROUP BY novel_id
        HAVING COUNT(DISTINCT tags.name) = ${tags.length}
      ) matched ON matched.novel_id = novels.id
    `;
    params.push(...tags);
  }

  const where = conditions.join(' AND ');
  const countSql = `SELECT COUNT(*) as total FROM novels ${joinClause} WHERE ${where}`;
  const { total } = db.prepare(countSql).get(...params);

  const listParams = [...params, limit, offset];
  const sql = `
    SELECT * FROM novels
    ${joinClause}
    WHERE ${where}
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `;

  const novels = db.prepare(sql).all(...listParams);
  for (const novel of novels) {
    novel.tags = getTagsByNovelId(novel.id);
  }

  return { total, novels, limit, offset };
}

export function deleteNovel(id) {
  db.prepare('UPDATE novels SET is_deleted = 1 WHERE id = ?').run(id);
}

export function getNovelStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM novels WHERE is_deleted = 0').get().count;
  const lastSynced = db.prepare('SELECT MAX(last_synced_at) as ts FROM novels WHERE is_deleted = 0').get().ts;
  return { total, lastSynced };
}

export function getAllNovelIds() {
  return db.prepare('SELECT id FROM novels WHERE is_deleted = 0').all().map(r => r.id);
}

export function getNovelIdsMissingDetails(limit = 100) {
  return db.prepare(`
    SELECT id FROM novels
    WHERE is_deleted = 0 AND (summary = '' OR summary IS NULL)
    ORDER BY updated_at ASC
    LIMIT ?
  `).all(limit).map(r => r.id);
}

export function countMissingDetails() {
  return db.prepare(`
    SELECT COUNT(*) as count FROM novels
    WHERE is_deleted = 0 AND (summary = '' OR summary IS NULL)
  `).get().count;
}

export function getPopularTags(limit = 20) {
  return db.prepare(`
    SELECT t.name, COUNT(nt.novel_id) as count
    FROM tags t
    INNER JOIN novel_tags nt ON t.id = nt.tag_id
    INNER JOIN novels n ON nt.novel_id = n.id AND n.is_deleted = 0
    GROUP BY t.id
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);
}

// Reading history
export function recordReading(novelId, chapterId) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO reading_history (novel_id, last_chapter_id, last_read_at)
    VALUES (?, ?, ?)
    ON CONFLICT(novel_id) DO UPDATE SET
      last_chapter_id = excluded.last_chapter_id,
      last_read_at = excluded.last_read_at
  `).run(novelId, chapterId, now);
}

export function getReadingHistory(limit = 10) {
  const rows = db.prepare(`
    SELECT n.*, r.last_chapter_id, r.last_read_at
    FROM reading_history r
    INNER JOIN novels n ON r.novel_id = n.id
    WHERE n.is_deleted = 0
    ORDER BY r.last_read_at DESC
    LIMIT ?
  `).all(limit);
  for (const row of rows) {
    row.tags = getTagsByNovelId(row.id);
  }
  return rows;
}

// Config
export function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setConfig(key, value) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
