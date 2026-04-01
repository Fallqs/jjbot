import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import opentype from 'opentype.js';
import { fetchNovelMeta, crawlNovels, crawlBookbase } from './server/crawler.js';
import * as dao from './server/novelDao.js';
import * as kimi from './server/kimiService.js';

// Enable stealth mode to avoid detection
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Cache for browser instance and font mappings
let browser = null;
const fontCache = new Map(); // Cache parsed font mappings

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
    });
  }
  return browser;
}

// Fetch and parse font to create character mapping
async function parseFontFromUrl(fontUrl) {
  // Note: JJWXC uses WOFF2 format which requires special handling
  // The font files are at: https://static.jjwxc.net/tmp/fonts/{fontName}.woff2
  // We can't easily parse WOFF2 without additional dependencies,
  // so we rely on community-maintained font tables instead.
  
  // Extract font name from URL
  const fontNameMatch = fontUrl.match(/jjwxcfont_[\w\d]+/);
  if (!fontNameMatch) {
    console.log('Could not extract font name from URL');
    return null;
  }
  
  const fontName = fontNameMatch[0];
  console.log(`Font ${fontName} is WOFF2 format, using community table`);
  
  // Try community font table
  return await fetchFontTable(fontName);
}

// Font decryption for VIP chapter content
async function fetchFontTable(fontName) {
  const url = `https://fastly.jsdelivr.net/gh/404-novel-project/jinjiang_font_tables@master/${fontName}.woff2.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Failed to fetch font table:', e.message);
    return null;
  }
}

function decryptVipText(text, fontTable) {
  let output = text;
  for (const [encrypted, normal] of Object.entries(fontTable)) {
    output = output.split(encrypted).join(normal);
  }
  // Remove zero-width characters
  output = output.replace(/\u200c/g, '');
  output = output.replace(/&zwnj;/g, '');
  return output;
}

// Parse cookie string into Puppeteer cookie format
function parseCookies(cookieStr, domain) {
  const cookies = [];
  const pairs = cookieStr.split(';');
  
  // Important cookies for VIP access
  const importantCookies = ['JJEVER', 'token', 'bbstoken', 'testcookie', 'JJSESS', 'reader_nickname'];
  
  for (const pair of pairs) {
    const [name, ...valueParts] = pair.trim().split('=');
    if (name && valueParts.length > 0) {
      const value = valueParts.join('='); // Handle values with = in them
      const trimmedName = name.trim();
      const trimmedValue = value.trim();
      
      // Only include important cookies
      if (importantCookies.includes(trimmedName)) {
        cookies.push({
          name: trimmedName,
          value: trimmedValue,
          domain: domain,
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax'
        });
        console.log(`  Cookie: ${trimmedName} = ${trimmedValue.substring(0, 30)}...`);
      }
    }
  }
  
  return cookies;
}

// Proxy endpoint for font files
app.use('/proxy-font/', async (req, res) => {
  const fontPath = req.path.substring(1); // Remove leading slash
  const fontUrl = `https://static.jjwxc.net/tmp/fonts/${fontPath}`;
  
  console.log(`Proxying font: ${fontPath}`);
  
  try {
    const response = await fetch(fontUrl);
    if (!response.ok) {
      return res.status(response.status).send('Font not found');
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = fontPath.endsWith('.woff2') ? 'font/woff2' : 
                       fontPath.endsWith('.woff') ? 'font/woff' : 
                       'application/octet-stream';
    
    res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(buffer);
  } catch (e) {
    console.error('Font proxy error:', e.message);
    res.status(500).send('Font fetch failed');
  }
});

// New endpoint: Render VIP chapter with font support
app.get('/api/vip-render', async (req, res) => {
  const { novelId, chapterId, cookie } = req.query;
  
  if (!novelId || !chapterId || !cookie) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  
  const decodedCookie = decodeURIComponent(cookie);
  let page = null;
  
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set cookies
    const cookies = parseCookies(decodedCookie, '.jjwxc.net');
    await page.goto('https://my.jjwxc.net', { waitUntil: 'domcontentloaded' });
    for (const c of cookies) {
      try { await page.setCookie(c); } catch (e) {}
    }
    
    // Navigate to chapter
    const url = `https://my.jjwxc.net/onebook_vip.php?novelid=${novelId}&chapterid=${chapterId}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // Extract all necessary data for rendering
    const renderData = await page.evaluate(() => {
      const contentDiv = document.querySelector('div[id^="content_"]');
      const noveltext = document.querySelector('.noveltext');
      const novelbody = document.querySelector('.novelbody');
      const titleEl = document.querySelector('h2');
      
      // Get all style tags
      const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\n');
      
      // Get font class
      let fontClass = '';
      if (noveltext) {
        fontClass = Array.from(noveltext.classList).find(c => c.startsWith('jjwxcfont_')) || '';
      }
      
      // Get content HTML (with PUA characters)
      let contentHtml = '';
      if (contentDiv) {
        contentHtml = contentDiv.innerHTML;
      } else if (noveltext) {
        contentHtml = noveltext.innerHTML;
      }
      
      return {
        title: titleEl?.textContent?.trim() || '',
        contentHtml: contentHtml,
        styles: styles,
        fontClass: fontClass,
        bodyClass: novelbody?.className || '',
        textClass: noveltext?.className || ''
      };
    });
    
    // Modify styles to proxy fonts through our server
    let modifiedStyles = renderData.styles;
    modifiedStyles = modifiedStyles.replace(
      /url\(["\']?\/\/static\.jjwxc\.net\/tmp\/fonts\/([^"\')]+)["\']?\)/g,
      'url(/proxy-font/$1)'
    );
    modifiedStyles = modifiedStyles.replace(
      /url\(["\']?https:\/\/static\.jjwxc\.net\/tmp\/fonts\/([^"\')]+)["\']?\)/g,
      'url(/proxy-font/$1)'
    );
    
    // Wrap content with font class if available
    let wrappedContent = renderData.contentHtml;
    if (renderData.fontClass && !renderData.contentHtml.includes(renderData.fontClass)) {
      // The font class is not on the content itself, wrap it
      wrappedContent = `<div class="noveltext ${renderData.fontClass}" style="font-family: '${renderData.fontClass}', 'Microsoft YaHei', serif; font-size: 16px; line-height: 1.8;">${renderData.contentHtml}</div>`;
    }
    
    res.json({
      success: true,
      title: renderData.title,
      contentHtml: wrappedContent,
      styles: modifiedStyles,
      fontClass: renderData.fontClass
    });
    
  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (page) await page.close();
  }
});

// API endpoint to fetch VIP chapter content
app.get('/api/vip-chapter', async (req, res) => {
  const { novelId, chapterId, cookie } = req.query;
  
  if (!novelId || !chapterId || !cookie) {
    return res.status(400).json({ error: 'Missing required parameters: novelId, chapterId, cookie' });
  }

  // Decode the cookie string (it's URL-encoded)
  const decodedCookie = decodeURIComponent(cookie);
  console.log(`Fetching VIP chapter ${chapterId} for novel ${novelId}`);
  console.log(`Cookie length: ${decodedCookie.length}`);

  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    // Set viewport to look like a real desktop browser
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Enable console logging
    page.on('console', msg => console.log('PAGE CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.0 Edg/134.0.0.0');
    
    // Parse and set all cookies
    const cookies = parseCookies(decodedCookie, '.jjwxc.net');
    console.log(`Parsed ${cookies.length} cookies`);
    
    if (cookies.length === 0) {
      return res.status(400).json({ error: 'Invalid cookie format' });
    }
    
    // Set cookies before navigating (need to go to domain first)
    await page.goto('https://my.jjwxc.net', { waitUntil: 'domcontentloaded' });
    
    // Set cookies one by one to handle errors
    for (const cookie of cookies) {
      try {
        await page.setCookie(cookie);
      } catch (e) {
        console.log(`Failed to set cookie ${cookie.name}: ${e.message}`);
      }
    }
    
    // Verify cookies were set
    const setCookies = await page.cookies('https://my.jjwxc.net');
    console.log(`Cookies set: ${setCookies.map(c => c.name).join(', ')}`);
    
    // Check for essential cookies
    const hasJjever = setCookies.some(c => c.name === 'JJEVER');
    const hasToken = setCookies.some(c => c.name === 'token');
    console.log(`Has JJEVER: ${hasJjever}, Has token: ${hasToken}`);
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.0 Edg/134.0.0.0');
    
    // Navigate to VIP chapter page
    const url = `https://my.jjwxc.net/onebook_vip.php?novelid=${novelId}&chapterid=${chapterId}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Check if we got redirected (session expired, etc.)
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    if (!currentUrl.includes('onebook_vip.php')) {
      console.log('WARNING: Redirected away from VIP page, session may be invalid');
    }
    
    // Wait a bit for initial JS to load
    await new Promise(r => setTimeout(r, 3000));
    
    // Check what's on the page
    const pageState = await page.evaluate(() => {
      const contentDiv = document.querySelector('div[id^="content_"]');
      const loading = document.querySelector('.loading');
      const fallback = document.querySelector('.fallbackinfo');
      const noveltext = document.querySelector('.noveltext');
      const bodyText = document.body.innerText.substring(0, 1000);
      const htmlPreview = document.body.innerHTML.substring(0, 500);
      
      // Check for specific error messages
      const hasError = bodyText.includes('浏览器标识异常') || 
                       bodyText.includes('加载失败') || 
                       bodyText.includes('系统检测到vip内容加载失败');
      
      return {
        hasContentDiv: !!contentDiv,
        hasLoading: !!loading,
        hasFallback: !!fallback,
        hasNoveltext: !!noveltext,
        hasError,
        contentText: contentDiv ? (contentDiv.innerText || '').substring(0, 300) : '',
        bodyPreview: bodyText,
        htmlPreview,
        url: window.location.href
      };
    });
    
    console.log('Page state:', JSON.stringify(pageState, null, 2));
    
    // If we see the fallback/error message, the decryption failed
    if (pageState.hasFallback || pageState.hasError) {
      // Take a screenshot for debugging
      await page.screenshot({ path: `error-${novelId}-${chapterId}.png`, fullPage: true });
      return res.status(500).json({ 
        success: false, 
        error: 'VIP 内容解密失败，Cookie 可能已过期或无效，或被检测到异常',
        debug: pageState
      });
    }
    
    // Wait for decryption to complete
    let decryptionSuccess = false;
    let manualContent = null;
    
    try {
      await page.waitForFunction(() => {
        const contentDiv = document.querySelector('div[id^="content_"]');
        if (!contentDiv) return false;
        
        const text = contentDiv.innerText || '';
        // Check if loading message is gone and we have actual content
        return !text.includes('vip内容加载中') && text.trim().length > 500;
      }, { timeout: 20000 }); // 20 seconds timeout
      
      decryptionSuccess = true;
      console.log('Decryption completed successfully');
    } catch (waitErr) {
      console.log('Wait timeout, checking what we have...');
      
      // Take screenshot to see what's happening
      await page.screenshot({ path: `timeout-${novelId}-${chapterId}.png`, fullPage: true });
    }
    
    // Even if wait timed out, try to get whatever content is available
    // The page might have font-encrypted content that we can decrypt
    
    // Additional wait for fonts to render
    await new Promise(r => setTimeout(r, 1000));
    
    // Try to get the decrypted content
    const result = await page.evaluate(() => {
      // Method 1: Try to get content from the content div
      const contentDiv = document.querySelector('div[id^="content_"]');
      if (contentDiv) {
        // Clone the div to avoid modifying the actual page
        const clone = contentDiv.cloneNode(true);
        
        // Remove loading and fallback elements
        const loading = clone.querySelector('.loading');
        if (loading) loading.remove();
        const fallback = clone.querySelector('.fallbackinfo');
        if (fallback) fallback.remove();
        
        // Get text content
        let text = clone.innerText || '';
        
        // Clean up
        text = text.replace(/vip内容加载中\.\.\./g, '');
        text = text.replace(/很抱歉，系统检测到vip内容加载失败[\s\S]*/g, '');
        text = text.trim();
        
        if (text.length > 200) {
          return { success: true, content: text, source: 'content_div' };
        }
      }
      
      // Method 2: Try noveltext div
      const noveltext = document.querySelector('.noveltext');
      if (noveltext) {
        let text = noveltext.innerText || '';
        text = text.replace(/vip内容加载中\.\.\./g, '');
        text = text.trim();
        if (text.length > 200) {
          return { success: true, content: text, source: 'noveltext' };
        }
      }
      
      return { success: false, error: 'Could not extract content' };
    });
    
    if (result.success) {
      // Get title
      const title = await page.evaluate(() => {
        const h2 = document.querySelector('div.novelbody h2, .noveltext h2, h2');
        return h2 ? h2.innerText.trim() : '';
      });
      
      // Detect font and decrypt content
      let decryptedContent = result.content;
      let fontUrl = null;
      
      const fontInfo = await page.evaluate(() => {
        // Check for font class on noveltext
        const noveltext = document.querySelector('.noveltext');
        let fontClass = null;
        if (noveltext) {
          fontClass = Array.from(noveltext.classList).find(c => c.startsWith('jjwxcfont_'));
        }
        
        // Check style tags for font-face
        let fontUrl = null;
        const styles = document.querySelectorAll('style');
        for (const style of styles) {
          const cssText = style.textContent || '';
          const fontMatch = cssText.match(/jjwxcfont_[\d\w]+/);
          if (fontMatch && !fontClass) fontClass = fontMatch[0];
          
          // Extract font URL
          const urlMatch = cssText.match(/url\(["\']?([^"\')]+\.(?:woff2?|ttf))["\']?\)/i);
          if (urlMatch) fontUrl = urlMatch[1];
        }
        
        return { fontClass, fontUrl };
      });
      
      const fontName = fontInfo.fontClass;
      fontUrl = fontInfo.fontUrl;
      
      if (fontName) {
        // Construct font URL if not found in CSS
        if (!fontUrl) {
          fontUrl = `https://static.jjwxc.net/tmp/fonts/${fontName}.woff2`;
        }
        console.log(`Detected font: ${fontName}, URL: ${fontUrl}`);
        
        // Try community font table first
        const fontTable = await fetchFontTable(fontName);
        if (fontTable) {
          decryptedContent = decryptVipText(result.content, fontTable);
          console.log('Font decryption applied from community table');
        } else {
          console.log(`Font table not found for ${fontName}`);
          decryptedContent = `[字体解密: 字体表 ${fontName} 暂不可用，部分内容显示为乱码]\n\n${result.content}`;
        }
      }
      
      res.json({ 
        success: true, 
        title,
        content: decryptedContent,
        source: result.source,
        font: fontName || null,
        fontUrl: fontUrl || null
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }
    
  } catch (error) {
    console.error('Puppeteer error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    if (page) {
      await page.close();
    }
  }
});

// =====================
// Novel Library & Crawler APIs
// =====================

// Batch crawl
app.post('/api/crawl', async (req, res) => {
  try {
    const { ids, range, delayMs = 200 } = req.body;
    let targetIds = [];

    if (Array.isArray(ids)) {
      targetIds = ids.map(String).filter(Boolean);
    } else if (range && typeof range.start === 'number' && typeof range.end === 'number') {
      for (let i = range.start; i <= range.end; i++) {
        targetIds.push(String(i));
      }
    }

    if (targetIds.length === 0) {
      return res.status(400).json({ error: '请提供 ids 或 range' });
    }

    if (targetIds.length > 500) {
      return res.status(400).json({ error: '单次爬取数量不能超过 500' });
    }

    const progress = [];
    const { results, errors } = await crawlNovels(targetIds, {
      delayMs: Math.max(500, Number(delayMs) || 1000),
      onProgress: (p) => {
        progress.push({ current: p.current, total: p.total, id: p.id, success: p.success });
      },
    });

    // Save to DB
    const saved = [];
    for (const meta of results) {
      if (meta.title) {
        dao.upsertNovel(meta);
        saved.push(meta.id);
      }
    }

    res.json({
      total: targetIds.length,
      saved: saved.length,
      failed: errors.length,
      savedIds: saved,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error('Crawl error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Crawl from bookbase list pages
app.post('/api/crawl/bookbase', async (req, res) => {
  try {
    const { startPage, endPage, filters, delayMs = 200, autoCrawlDetails = true } = req.body;
    const sp = Math.max(1, parseInt(startPage, 10) || 1);
    const ep = Math.max(sp, parseInt(endPage, 10) || sp);
    if (ep - sp + 1 > 100) {
      return res.status(400).json({ error: '单次翻页数量不能超过 100 页' });
    }

    // 1. collect metadata from list pages (fast path: list page already has author/tags/status/word_count)
    const { collected, errors: listErrors } = await crawlBookbase({
      startPage: sp,
      endPage: ep,
      filters,
      delayMs: Math.max(0, Number(delayMs) || 200),
    });

    if (!autoCrawlDetails) {
      return res.json({
        mode: 'list-only',
        totalPages: ep - sp + 1,
        collected: collected.length,
        ids: collected.map(n => n.id),
        listErrors: listErrors.slice(0, 20),
      });
    }

    // 2. save directly (bookbase list page provides sufficient metadata for search/recommend)
    const saved = [];
    for (const meta of collected) {
      if (meta.title) {
        dao.upsertNovel(meta);
        saved.push(meta.id);
      }
    }

    res.json({
      mode: 'full',
      totalPages: ep - sp + 1,
      collected: collected.length,
      saved: saved.length,
      failed: listErrors.length,
      savedIds: saved,
      listErrors: listErrors.slice(0, 20),
    });
  } catch (err) {
    console.error('Bookbase crawl error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Single novel sync
app.post('/api/novels/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const meta = await fetchNovelMeta(id);
    if (!meta.title) {
      return res.status(404).json({ error: '小说不存在或页面解析失败' });
    }
    dao.upsertNovel(meta);
    res.json({ success: true, novel: dao.getNovelById(id) });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Sync all novels
app.post('/api/sync/all', async (req, res) => {
  try {
    const ids = dao.getAllNovelIds();
    const delayMs = Math.max(0, Number(req.body.delayMs) || 200);
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < ids.length; i++) {
      try {
        const meta = await fetchNovelMeta(ids[i]);
        if (meta.title) {
          dao.upsertNovel(meta);
          updated++;
        }
      } catch (e) {
        failed++;
      }
      if (delayMs > 0 && i < ids.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    res.json({ total: ids.length, updated, failed });
  } catch (err) {
    console.error('Sync all error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Sync missing details (summary + stats)
app.post('/api/sync/details', async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.body.limit, 10) || 100));
    const delayMs = Math.max(0, Number(req.body.delayMs) || 200);
    const ids = dao.getNovelIdsMissingDetails(limit);
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < ids.length; i++) {
      try {
        const meta = await fetchNovelMeta(ids[i]);
        if (meta.title) {
          dao.upsertNovel(meta);
          updated++;
        }
      } catch (e) {
        failed++;
      }
      if (delayMs > 0 && i < ids.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    res.json({ total: ids.length, updated, failed });
  } catch (err) {
    console.error('Sync details error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List novels
app.get('/api/novels', (req, res) => {
  try {
    const { keyword, tags, author, status, limit, offset } = req.query;
    const tagArray = tags ? String(tags).split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const result = dao.listNovels({
      keyword: keyword || undefined,
      tags: tagArray,
      author: author || undefined,
      status: status || undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get novel detail
app.get('/api/novels/:id', (req, res) => {
  try {
    const novel = dao.getNovelById(req.params.id);
    if (!novel) return res.status(404).json({ error: 'Not found' });
    res.json(novel);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete novel (soft)
app.delete('/api/novels/:id', (req, res) => {
  try {
    dao.deleteNovel(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats
app.get('/api/stats', (req, res) => {
  try {
    res.json(dao.getNovelStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Popular tags
app.get('/api/tags/popular', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    res.json(dao.getPopularTags(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reading history
app.post('/api/reading-history', (req, res) => {
  try {
    const { novelId, chapterId } = req.body;
    if (!novelId) return res.status(400).json({ error: 'novelId required' });
    dao.recordReading(String(novelId), chapterId ? parseInt(chapterId, 10) : 1);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reading-history', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
    res.json(dao.getReadingHistory(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kimi config
app.get('/api/config/kimi', (req, res) => {
  try {
    const key = dao.getConfig('kimi_api_key');
    res.json({ configured: !!key, key: key ? `${key.slice(0, 6)}...` : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/kimi', (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
    dao.setConfig('kimi_api_key', String(apiKey).trim());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kimi search
app.post('/api/search/kimi', async (req, res) => {
  try {
    const { query, candidateLimit = 20 } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });

    // 1. coarse filter by keyword from local DB
    const { novels } = dao.listNovels({ keyword: query, limit: candidateLimit });
    // If too few keyword matches, pad with recent novels
    let candidates = novels;
    if (candidates.length < 10) {
      const { novels: recent } = dao.listNovels({ limit: candidateLimit });
      const seen = new Set(candidates.map(n => n.id));
      for (const n of recent) {
        if (!seen.has(n.id)) candidates.push(n);
        if (candidates.length >= candidateLimit) break;
      }
    }

    const result = await kimi.searchNovels(query, candidates);
    res.json({ ...result, candidatesCount: candidates.length });
  } catch (err) {
    console.error('Kimi search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Kimi recommend
app.post('/api/recommend/kimi', async (req, res) => {
  try {
    const { candidateLimit = 20 } = req.body;
    const history = dao.getReadingHistory(5);
    const excludeIds = new Set(history.map(h => h.id));

    const { novels } = dao.listNovels({ limit: candidateLimit * 2 });
    const candidates = novels.filter(n => !excludeIds.has(n.id)).slice(0, candidateLimit);

    if (history.length === 0) {
      return res.status(400).json({ error: '暂无阅读历史，无法生成推荐' });
    }
    if (candidates.length === 0) {
      return res.status(400).json({ error: '书库为空，无法生成推荐' });
    }

    const result = await kimi.recommendNovels(history, candidates);
    res.json({ ...result, candidatesCount: candidates.length });
  } catch (err) {
    console.error('Kimi recommend error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
