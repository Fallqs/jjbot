import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import opentype from 'opentype.js';

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
    
    res.json({
      success: true,
      title: renderData.title,
      contentHtml: renderData.contentHtml,
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
  console.log(`VIP chapter server running on port ${PORT}`);
});
