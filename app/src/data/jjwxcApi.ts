export interface Chapter {
  id: number;
  title: string;
  content: string;
  isVip: boolean;
}

export interface Novel {
  id: string;
  title: string;
  author: string;
  authorId: string;
  summary: string;
  tags: string[];
  chapters: Chapter[];
}

const PROXY_BASE = '/jjwxc';
const PROXY_BASE_MY = '/jjwxc-my';
const COOKIE_KEY = 'jjwxc_cookie';

export function getJjwxcCookie(): string {
  return localStorage.getItem(COOKIE_KEY) || '';
}

export function setJjwxcCookie(cookie: string): void {
  localStorage.setItem(COOKIE_KEY, cookie);
}

export function clearJjwxcCookie(): void {
  localStorage.removeItem(COOKIE_KEY);
}

async function fetchHtml(path: string, useMy = false): Promise<{ doc: Document; htmlText: string }> {
  const url = `${useMy ? PROXY_BASE_MY : PROXY_BASE}${path}`;
  const headers: Record<string, string> = {};
  const cookie = getJjwxcCookie();
  if (cookie) {
    headers['X-JJWXC-Cookie'] = cookie;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: 无法加载页面`);
  }
  const buffer = await res.arrayBuffer();
  const decoder = new TextDecoder('gb18030');
  const html = decoder.decode(buffer);
  const parser = new DOMParser();
  return { doc: parser.parseFromString(html, 'text/html'), htmlText: html };
}

export async function fetchNovelInfo(novelId: string): Promise<Novel> {
  const { doc } = await fetchHtml(`/onebook.php?novelid=${novelId}`);

  // Title
  const titleEl = doc.querySelector('div.noveltitle span.bigtext');
  let title = titleEl?.textContent?.trim() || '';
  title = title.replace(/^《/, '').replace(/》$/, '');

  // Author
  const authorMeta = doc.querySelector('meta[name="Author"]');
  const author = authorMeta?.getAttribute('content')?.trim() || '未知作者';

  // Author ID
  const authorLink = doc.querySelector('a[href*="oneauthor.php"]');
  const authorHref = authorLink?.getAttribute('href') || '';
  const authorIdMatch = authorHref.match(/authorid=(\d+)/);
  const authorId = authorIdMatch ? authorIdMatch[1] : '';

  // Summary from description meta
  const descMeta = doc.querySelector('meta[name="Description"]');
  let summary = '';
  if (descMeta) {
    const desc = descMeta.getAttribute('content') || '';
    summary = desc.split('|')[0]?.trim() || desc;
  }

  // Tags from keywords meta
  const keywordsMeta = doc.querySelector('meta[name="Keywords"]');
  let tags: string[] = [];
  if (keywordsMeta) {
    const keywords = keywordsMeta.getAttribute('content') || '';
    const parts = keywords.split(',');
    if (parts.length >= 3) {
      tags = parts[2].split(/\s+/).filter(Boolean);
    }
  }

  // Chapters
  const chapters: Chapter[] = [];
  const chapterRows = doc.querySelectorAll('tr[itemprop="chapter"]');

  chapterRows.forEach((row) => {
    const link = row.querySelector('a[itemprop="url"]');
    const href = link?.getAttribute('href') || '';
    const idMatch = href.match(/chapterid=(\d+)/);
    const id = idMatch ? parseInt(idMatch[1], 10) : 0;
    const chapterTitle = link?.textContent?.trim() || '';
    const isVip = row.textContent?.includes('[VIP]') || false;

    if (id > 0) {
      chapters.push({
        id,
        title: chapterTitle,
        content: '',
        isVip,
      });
    }
  });

  return {
    id: novelId,
    title,
    author,
    authorId,
    summary,
    tags,
    chapters,
  };
}

function extractChapterContent(doc: Document, htmlText: string): { title: string; content: string } | null {
  // Try multiple extraction methods

  // Method 1: Try to find content in the novelbody div with onselectstart
  let container = doc.querySelector('div.novelbody > div[onselectstart="return false"]');

  // Method 2: Try just novelbody
  if (!container) {
    container = doc.querySelector('div.novelbody');
  }

  // Method 3: Try the noveltext class (sometimes used for content)
  if (!container) {
    container = doc.querySelector('.noveltext');
  }

  if (!container) {
    return null;
  }

  const root = container.cloneNode(true) as HTMLElement;

  // Remove UI elements
  const selectorsToRemove = [
    'script',
    'style',
    '#mongolia_layer',
    '#float_favorite',
    '.float_favorite',
    '#report_box',
    '[id^="favoriteshow_"]',
    'span#favorite_',
    'span#report_action',
    'span#yrt3',
    'span#chapterJurisdiction',
    'div[align="right"]',
    '#note_danmu_wrapper',
    '#copyrightlist',
    '.recommend_novel_box',
    '.rec_novel',
    '.recommend_novel_tip',
    'div[style*="width:710px;height:70px"]',
    'div[style*="width:720px;height:40px"]',
    '.new_vip_notice',
    '.redbag_wrapper',
    '.float_title',
    '.float_message',
    '.float_comment',
    '#addFavoritClassDiv',
    '.float_foot',
  ];

  selectorsToRemove.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el) => el.remove());
  });

  // Extract title from h2
  const h2 = root.querySelector('h2');
  const title = h2?.textContent?.trim() || '';
  if (h2) h2.remove();

  // Remove clear:both divs
  root.querySelectorAll('div').forEach((div) => {
    const style = div.getAttribute('style') || '';
    if (style.replace(/\s+/g, '') === 'clear:both;') {
      div.remove();
    }
  });

  // Replace <br> tags with newlines
  let html = root.innerHTML;
  html = html.replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  let text = tmp.textContent || '';

  // Clean up: remove URLs, normalize whitespace
  text = text.replace(/https?:\/\/[^\s]+/g, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  // Clean up whitespace and full-width spaces at line start
  const paragraphs = text
    .split('\n')
    .map((line) => line.trim().replace(/^\u3000+/, ''))
    .filter((line) => line.length > 0);

  const content = paragraphs.join('\n\n');

  if (content.length < 50) {
    return null;
  }

  return { title, content };
}

export async function fetchChapter(novelId: string, chapterId: number, isVip = false): Promise<Chapter> {
  // Always try www.jjwxc.net first - some chapters marked as VIP may actually be free previews,
  // and free chapter pages can contain "购买"/"充值" in ads/navigation causing false positives.
  const wwwResult = await fetchHtml(`/onebook.php?novelid=${novelId}&chapterid=${chapterId}`, false);
  let extracted = extractChapterContent(wwwResult.doc, wwwResult.htmlText);

  if (extracted) {
    return {
      id: chapterId,
      title: extracted.title || `第${chapterId}章`,
      content: extracted.content,
      isVip,
    };
  }

  // Content extraction failed - determine why and handle VIP chapters
  const htmlText = wwwResult.htmlText;

  if (htmlText.includes('用户登入') || htmlText.includes('晋江文学城[用户登入]')) {
    throw new Error('需要登录：该章节为 VIP 章节，请在设置中粘贴晋江文学城的登录 Cookie');
  }

  const isVipRedirect = htmlText.includes('onebook_vip.php') || htmlText.includes('jjwxc.net/backend/buynovel');

  if (isVipRedirect && getJjwxcCookie()) {
    try {
      const vipResult = await fetchHtml(`/onebook_vip.php?novelid=${novelId}&chapterid=${chapterId}`, true);
      const vipExtracted = extractChapterContent(vipResult.doc, vipResult.htmlText);
      if (vipExtracted) {
        return {
          id: chapterId,
          title: vipExtracted.title || `第${chapterId}章`,
          content: vipExtracted.content,
          isVip,
        };
      }
      if (vipResult.htmlText.includes('用户登入') || vipResult.htmlText.includes('晋江文学城[用户登入]')) {
        throw new Error('需要登录：该章节为 VIP 章节，请在设置中粘贴晋江文学城的登录 Cookie');
      }
      if (vipResult.htmlText.includes('购买') && (vipResult.htmlText.includes('充值') || vipResult.htmlText.includes('订阅'))) {
        throw new Error('需要购买：该章节为 VIP 章节，请在官网购买后重试');
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('HTTP')) {
        throw new Error('VIP 章节加载失败：' + err.message);
      }
      throw err;
    }
  }

  if (isVipRedirect) {
    throw new Error('VIP 章节：请在官网购买此章节，然后在设置中粘贴 Cookie 后阅读');
  }

  if (htmlText.includes('购买') && (htmlText.includes('充值') || htmlText.includes('订阅'))) {
    throw new Error('需要购买：该章节为 VIP 章节，请在官网购买后重试');
  }

  throw new Error('无法解析章节内容，页面结构可能已更改');
}
