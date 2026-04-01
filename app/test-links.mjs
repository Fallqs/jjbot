import * as cheerio from 'cheerio';

const id = process.argv[2] || '5484954';
const url = `https://www.jjwxc.net/onebook.php?novelid=${id}`;
const res = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  },
});
const html = new TextDecoder('gb18030').decode(await res.arrayBuffer());
const $ = cheerio.load(html, { decodeEntities: false });

// Find all links containing score/click/collection/rating
const links = [];
$('a').each((i, el) => {
  const href = $(el).attr('href') || '';
  const text = $(el).text().trim();
  if (href.includes('score') || href.includes('click') || href.includes('collection') || href.includes('rating') || href.includes('stat') ||
      text.includes('评分') || text.includes('收藏') || text.includes('点击')) {
    links.push({ href, text: text.slice(0, 30) });
  }
});
console.log('Relevant links:', links.slice(0, 20));

// Also look for iframes
const iframes = [];
$('iframe').each((i, el) => {
  iframes.push($(el).attr('src'));
});
console.log('Iframes:', iframes);
