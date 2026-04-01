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

const scripts = $('script').map((i, el) => $(el).html()).get().filter(Boolean);
console.log(`Found ${scripts.length} inline scripts.`);

for (let i = 0; i < scripts.length; i++) {
  const s = scripts[i];
  if (s.includes(id) || s.includes('novelid') || s.includes('ajax') || s.includes('$.get') || s.includes('$.post')) {
    console.log(`\n=== Script ${i} ===`);
    console.log(s.slice(0, 1000));
  }
}
