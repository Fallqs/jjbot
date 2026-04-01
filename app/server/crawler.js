import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.jjwxc.net';

export async function fetchNovelMeta(novelId) {
  const url = `${BASE_URL}/onebook.php?novelid=${novelId}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: 无法加载页面`);
  }

  const buffer = await res.arrayBuffer();
  const html = new TextDecoder('gb18030').decode(buffer);
  return parseNovelPage(novelId, html);
}

function parseNovelPage(novelId, html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Title
  let title = '';
  const titleEl = $('div.noveltitle span.bigtext');
  if (titleEl.length) {
    title = titleEl.text().trim().replace(/^《/, '').replace(/》$/, '');
  }
  if (!title) {
    title = $('h1').first().text().trim().replace(/^《/, '').replace(/》$/, '');
  }

  // Author
  let author = '';
  const authorMeta = $('meta[name="Author"]');
  if (authorMeta.length) {
    author = authorMeta.attr('content')?.trim() || '';
  }
  if (!author) {
    const authorLink = $('a[href*="oneauthor.php"]');
    if (authorLink.length) {
      author = authorLink.first().text().trim();
    }
  }

  // Author ID
  let authorId = '';
  const authorHref = $('a[href*="oneauthor.php"]').first().attr('href') || '';
  const authorIdMatch = authorHref.match(/authorid=(\d+)/);
  if (authorIdMatch) authorId = authorIdMatch[1];

  // Summary
  let summary = '';
  const descMeta = $('meta[name="Description"]');
  if (descMeta.length) {
    const desc = descMeta.attr('content') || '';
    summary = desc.split('|')[0]?.trim() || desc;
  }
  if (!summary) {
    summary = $('div.novelintro, div#novelintro, div.intro').first().text().trim();
  }

  // Tags
  let tags = [];
  const keywordsMeta = $('meta[name="Keywords"]');
  if (keywordsMeta.length) {
    const keywords = keywordsMeta.attr('content') || '';
    const parts = keywords.split(',');
    if (parts.length >= 3) {
      tags = parts[2].split(/\s+/).filter(Boolean);
    }
  }

  // Cover
  let coverUrl = '';
  const coverMeta = $('meta[property="og:image"]');
  if (coverMeta.length) {
    coverUrl = coverMeta.attr('content') || '';
  }
  if (!coverUrl) {
    // Method 1: Look for large cover image (width=200 is typical for JJWXC covers)
    $('img').each((i, el) => {
      if (coverUrl) return;
      const src = $(el).attr('src') || '';
      const width = $(el).attr('width');
      if (src && (width === '200' || /authorspace|novelimage|tmp\/backend/.test(src))) {
        coverUrl = src;
      }
    });
  }
  if (!coverUrl) {
    // Method 2: Regex fallback on raw HTML for cover link pattern
    const coverMatch = html.match(/novelid=\d+&coverid=\d+&ver=[^"]+"\s+src="([^"]+)"/);
    if (coverMatch) coverUrl = coverMatch[1];
  }

  // Chapters
  const chapterRows = $('tr[itemprop="chapter"]');
  const chapterCount = chapterRows.length;

  // Try to extract status, word count, update time from page text
  const pageText = $('body').text();

  let status = '';
  let wordCount = null;
  let updateTime = '';
  let score = null;
  let collectionCount = null;
  let clickCount = null;

  // Status
  const statusMatch = pageText.match(/文章进度[：:]\s*(连载中|已完成|已完结|暂停)/);
  if (statusMatch) {
    status = statusMatch[1].replace('已完成', '完结').replace('已完结', '完结');
  } else if (pageText.includes('连载中')) {
    status = '连载中';
  } else if (pageText.includes('已完结') || pageText.includes('已完成')) {
    status = '完结';
  }

  // Word count
  const wcMatch = pageText.match(/全文字数[：:]\s*([\d,]+)/);
  if (wcMatch) {
    wordCount = parseInt(wcMatch[1].replace(/,/g, ''), 10);
  }

  // Update time
  const utMatch = pageText.match(/最新更新[：:]\s*(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2})/);
  if (utMatch) {
    updateTime = utMatch[1];
  }

  // Stats
  const collMatch = pageText.match(/文章收藏[：:]\s*([\d,]+)/) || pageText.match(/收藏[：:]\s*([\d,]+)/);
  if (collMatch) {
    collectionCount = parseInt(collMatch[1].replace(/,/g, ''), 10);
  }

  const clickMatch = pageText.match(/文章点击[：:]\s*([\d,]+)/) || pageText.match(/点击[：:]\s*([\d,]+)/);
  if (clickMatch) {
    clickCount = parseInt(clickMatch[1].replace(/,/g, ''), 10);
  }

  const scoreMatch = pageText.match(/评分[：:]\s*([\d.]+)/);
  if (scoreMatch) {
    score = parseFloat(scoreMatch[1]);
  }

  return {
    id: String(novelId),
    title,
    author,
    author_id: authorId,
    summary,
    tags,
    status,
    word_count: wordCount,
    chapter_count: chapterCount,
    click_count: clickCount,
    collection_count: collectionCount,
    score,
    update_time: updateTime,
    cover_url: coverUrl,
  };
}

function parseBookbaseRow($, tr) {
  const tds = $(tr).find('td');
  if (tds.length < 7) return null;

  const author = $(tds[0]).text().trim();
  const titleLink = $(tds[1]).find('a[href*="onebook.php"]');
  const title = titleLink.text().trim().replace(/^《/, '').replace(/》$/, '');
  const href = titleLink.attr('href') || '';
  const m = href.match(/novelid=(\d+)/);
  const id = m ? m[1] : null;

  const typeText = $(tds[2]).text().trim();
  const status = $(tds[3]).text().trim();
  const wordCountText = $(tds[4]).text().trim().replace(/,/g, '');
  const wordCount = parseInt(wordCountText, 10) || null;
  const updateTime = $(tds[6]).text().trim();

  if (!id || !title) return null;

  const tags = typeText ? typeText.split('-').map(s => s.trim()).filter(Boolean) : [];

  return {
    id,
    title,
    author,
    author_id: '',
    summary: '',
    tags,
    status,
    word_count: wordCount,
    chapter_count: null,
    click_count: null,
    collection_count: null,
    score: null,
    update_time: updateTime,
    cover_url: '',
  };
}

export async function fetchBookbasePage(page, filters = {}) {
  const defaultParams = {
    fw: 0,
    yc: 0,
    xx: 0,
    mainview: 0,
    sd: 0,
    lx: 0,
    bq: -1,
    sortType: 0,
    isfinish: 0,
    collectiontypes: '',
    searchkeywords: '',
    ...filters,
    page,
  };

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(defaultParams)) {
    qs.set(k, String(v));
  }

  const url = `${BASE_URL}/bookbase.php?${qs.toString()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: 无法加载页面`);
  }

  const buffer = await res.arrayBuffer();
  const html = new TextDecoder('gb18030').decode(buffer);
  const $ = cheerio.load(html, { decodeEntities: false });

  const novels = [];
  const seen = new Set();
  $('tr').each((i, el) => {
    const novel = parseBookbaseRow($, el);
    if (novel && !seen.has(novel.id)) {
      seen.add(novel.id);
      novels.push(novel);
    }
  });

  return novels;
}

export async function crawlBookbase({ startPage, endPage, filters = {}, delayMs = 200, onProgress } = {}) {
  const collected = [];
  const errors = [];
  const pageCount = endPage - startPage + 1;

  for (let p = startPage; p <= endPage; p++) {
    try {
      const novels = await fetchBookbasePage(p, filters);
      collected.push(...novels);
      if (onProgress) onProgress({ type: 'list', currentPage: p, totalPages: pageCount, pageNovels: novels.length, totalCollected: collected.length });
    } catch (err) {
      errors.push({ page: p, error: err.message });
      if (onProgress) onProgress({ type: 'list', currentPage: p, totalPages: pageCount, error: err.message });
    }
    if (delayMs > 0 && p < endPage) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { collected, errors };
}

export async function crawlNovels(ids, { delayMs = 200, onProgress } = {}) {
  const results = [];
  const errors = [];

  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i]).trim();
    if (!id) continue;

    try {
      const meta = await fetchNovelMeta(id);
      results.push(meta);
      if (onProgress) onProgress({ current: i + 1, total: ids.length, id, success: true, meta });
    } catch (err) {
      errors.push({ id, error: err.message });
      if (onProgress) onProgress({ current: i + 1, total: ids.length, id, success: false, error: err.message });
    }

    if (delayMs > 0 && i < ids.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { results, errors };
}
