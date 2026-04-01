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
  coverUrl?: string;
  status?: string;
  word_count?: number;
  chapter_count?: number;
  click_count?: number;
  collection_count?: number;
  score?: number;
  update_time?: string;
}

const PROXY_BASE = '/jjwxc/';
const PROXY_BASE_MY = '/jjwxc-my/';
const COOKIE_KEY = 'jjwxc_cookie';

// AES decryption for VIP chapter content
async function decryptVipContent(encryptedContent: string, key: string): Promise<string> {
  try {
    // Decode base64
    const encryptedData = Uint8Array.from(atob(encryptedContent), c => c.charCodeAt(0));
    const keyData = Uint8Array.from(atob(key), c => c.charCodeAt(0));
    
    // Import key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );
    
    // Extract IV (first 16 bytes) and ciphertext
    const iv = encryptedData.slice(0, 16);
    const ciphertext = encryptedData.slice(16);
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      ciphertext
    );
    
    return new TextDecoder('utf-8').decode(decrypted);
  } catch (e) {
    console.error('Decryption failed:', e);
    return '';
  }
}

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
  const { doc, htmlText } = await fetchHtml(`/onebook.php?novelid=${novelId}`);

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

  // Cover
  let coverUrl = '';
  const coverMeta = doc.querySelector('meta[property="og:image"]');
  if (coverMeta) {
    coverUrl = coverMeta.getAttribute('content')?.trim() || '';
  }
  if (!coverUrl) {
    const imgs = doc.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.getAttribute('src') || '';
      const width = img.getAttribute('width');
      if (src && (width === '200' || /authorspace|novelimage|tmp\/backend/.test(src))) {
        coverUrl = src;
        break;
      }
    }
  }
  if (!coverUrl) {
    const coverMatch = htmlText.match(/novelid=\d+&coverid=\d+&ver=[^"]+"\s+src="([^"]+)"/);
    if (coverMatch) coverUrl = coverMatch[1];
  }

  // Stats from page text
  const pageText = doc.body?.textContent || '';

  let status = '';
  let wordCount: number | undefined;
  let updateTime = '';
  let score: number | undefined;
  let clickCount: number | undefined;
  let collectionCount: number | undefined;

  const statusMatch = pageText.match(/文章进度[：:]\s*(连载中|已完成|已完结|暂停)/);
  if (statusMatch) {
    status = statusMatch[1].replace('已完成', '完结').replace('已完结', '完结');
  } else if (pageText.includes('连载中')) {
    status = '连载中';
  } else if (pageText.includes('已完结') || pageText.includes('已完成')) {
    status = '完结';
  }

  const wcMatch = pageText.match(/全文字数[：:]\s*([\d,]+)/);
  if (wcMatch) {
    wordCount = parseInt(wcMatch[1].replace(/,/g, ''), 10);
  }

  const utMatch = pageText.match(/最新更新[：:]\s*(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2})/);
  if (utMatch) {
    updateTime = utMatch[1];
  }

  const scoreMatch = pageText.match(/评分[：:]\s*([\d.]+)/);
  if (scoreMatch) {
    score = parseFloat(scoreMatch[1]);
  }

  const collMatch = pageText.match(/文章收藏[：:]\s*([\d,]+)/) || pageText.match(/收藏[：:]\s*([\d,]+)/);
  if (collMatch) {
    collectionCount = parseInt(collMatch[1].replace(/,/g, ''), 10);
  }

  const clickMatchText = pageText.match(/文章点击[：:]\s*([\d,]+)/) || pageText.match(/点击[：:]\s*([\d,]+)/);
  if (clickMatchText) {
    clickCount = parseInt(clickMatchText[1].replace(/,/g, ''), 10);
  }

  // Chapters
  const chapters: Chapter[] = [];
  const chapterRows = doc.querySelectorAll('tr[itemprop="chapter"]');

  chapterRows.forEach((row) => {
    const link = row.querySelector('a[itemprop="url"]');
    const href = link?.getAttribute('href') || link?.getAttribute('rel') || '';
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
    coverUrl,
    status,
    word_count: wordCount,
    chapter_count: chapters.length,
    click_count: clickCount,
    collection_count: collectionCount,
    score,
    update_time: updateTime,
  };
}

function detectVipFont(doc: Document, htmlText: string): string | null {
  // Method 1: Check div.noveltext classes
  const noveltextDiv = doc.querySelector('div.noveltext');
  if (noveltextDiv) {
    const fontClass = Array.from(noveltextDiv.classList).find((c) => c.startsWith('jjwxcfont_'));
    if (fontClass) return fontClass;
  }

  // Method 2: Check inline style tags
  const styles = doc.querySelectorAll('style');
  for (const style of styles) {
    const cssText = style.textContent || '';
    const match = cssText.match(/jjwxcfont_[\d\w]+/);
    if (match) return match[0];
  }

  // Method 3: Regex on raw HTML
  const match = htmlText.match(/jjwxcfont_[\d\w]+/);
  if (match) return match[0];

  return null;
}

async function fetchFontTable(fontName: string): Promise<Record<string, string> | null> {
  const url = `https://fastly.jsdelivr.net/gh/404-novel-project/jinjiang_font_tables@master/${fontName}.woff2.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, string>;
  } catch {
    return null;
  }
}

function decryptVipText(text: string, fontTable: Record<string, string>): string {
  let output = text;
  for (const [encrypted, normal] of Object.entries(fontTable)) {
    output = output.split(encrypted).join(normal);
  }
  output = output.replace(/\u200c/g, '');
  output = output.replace(/&zwnj;/g, '');
  return output;
}

async function extractChapterContent(doc: Document, htmlText: string): Promise<{ title: string; content: string } | null> {
  // Special handling for VIP chapters: check for encrypted content in hidden inputs
  const encryptedInput = doc.querySelector('input[name="content"]') as HTMLInputElement | null;
  const keyInput = doc.querySelector('input[name="e_key"]') as HTMLInputElement | null;
  
  if (encryptedInput?.value && keyInput?.value) {
    // Decrypt VIP content
    const decrypted = await decryptVipContent(encryptedInput.value, keyInput.value);
    if (decrypted) {
      // Extract title from h2 in novelbody or use default
      const h2 = doc.querySelector('div.novelbody h2, .noveltext h2');
      const title = h2?.textContent?.trim() || '';
      return { title, content: decrypted };
    }
  }

  // Try multiple extraction methods for non-VIP or fallback

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

  // Method 4: Try VIP content container
  if (!container) {
    container = doc.querySelector('div[id^="content_"]');
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

  let content = paragraphs.join('\n\n');

  if (content.length < 50) {
    return null;
  }

  // VIP font decryption
  const fontName = detectVipFont(doc, htmlText);
  if (fontName) {
    const fontTable = await fetchFontTable(fontName);
    if (fontTable) {
      content = decryptVipText(content, fontTable);
    } else {
      // Fallback: replace encrypted chars (char + ZWNJ) with placeholder
      content = content.replace(/.\u200c/g, '[加密字符]');
    }
  }

  return { title, content };
}

// Fetch VIP chapter using Puppeteer backend (for encrypted content)
async function fetchVipChapterWithPuppeteer(novelId: string, chapterId: number): Promise<{ title: string; content: string } | null> {
  const cookie = getJjwxcCookie();
  if (!cookie) return null;
  
  // Try the new render endpoint first (proper font rendering)
  try {
    const renderUrl = `/api/vip-render?novelId=${novelId}&chapterId=${chapterId}&cookie=${encodeURIComponent(cookie)}`;
    console.log('Fetching VIP render:', renderUrl);
    const res = await fetch(renderUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log('VIP render response:', { success: data.success, hasHtml: !!data.contentHtml, title: data.title });
      if (data.success && data.contentHtml) {
        // Store the render data for the Reader component to use
        (window as Window & { __vipRenderData?: { contentHtml: string; styles: string; title: string } }).__vipRenderData = {
          contentHtml: data.contentHtml,
          styles: data.styles,
          title: data.title
        };
        console.log('Stored VIP render data in window');
        return { 
          title: data.title || `第${chapterId}章`, 
          content: '' // Empty content - will be rendered from HTML
        };
      }
    } else {
      console.log('VIP render endpoint returned error:', res.status);
    }
  } catch (e) {
    console.error('Render endpoint failed:', e);
  }
  
  // Fallback to text extraction endpoint
  const apiUrl = `/api/vip-chapter?novelId=${novelId}&chapterId=${chapterId}&cookie=${encodeURIComponent(cookie)}`;
  
  try {
    const res = await fetch(apiUrl, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Puppeteer API error:', res.status, errorText);
      throw new Error(`Puppeteer API error: ${res.status}`);
    }
    
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Puppeteer failed to fetch content');
    }
    
    return { title: data.title, content: data.content };
  } catch (err) {
    if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('Failed'))) {
      console.error('Backend connection failed - is the server running?', err);
      throw new Error('VIP 解密服务未启动。请在另一个终端运行: npm run server (或双击 app/start-server.bat)');
    }
    throw err;
  }
}

export async function fetchChapter(novelId: string, chapterId: number, isVip = false): Promise<Chapter> {
  // Always try www.jjwxc.net first - some chapters marked as VIP may actually be free previews,
  // and free chapter pages can contain "购买"/"充值" in ads/navigation causing false positives.
  const wwwResult = await fetchHtml(`/onebook.php?novelid=${novelId}&chapterid=${chapterId}`, false);
  let extracted = await extractChapterContent(wwwResult.doc, wwwResult.htmlText);

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
    // Try Puppeteer backend first for encrypted VIP content
    try {
      const puppeteerResult = await fetchVipChapterWithPuppeteer(novelId, chapterId);
      if (puppeteerResult) {
        return {
          id: chapterId,
          title: puppeteerResult.title || `第${chapterId}章`,
          content: puppeteerResult.content,
          isVip,
        };
      }
    } catch (err) {
      console.log('Puppeteer failed, falling back to proxy:', err);
    }
    
    // Fallback to direct proxy
    try {
      const vipResult = await fetchHtml(`/onebook_vip.php?novelid=${novelId}&chapterid=${chapterId}`, true);
      const vipExtracted = await extractChapterContent(vipResult.doc, vipResult.htmlText);
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
