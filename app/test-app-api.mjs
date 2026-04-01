const id = process.argv[2] || '5484954';

// Try a few known JJWXC app API endpoints without sign first
const endpoints = [
  `https://android.jjwxc.net/app.jjwxc/android/novelbasicinfo?novelId=${id}`,
  `https://android.jjwxc.net/app.jjwxc/android/novelDetail?novelId=${id}`,
  `https://android.jjwxc.net/app.jjwxc/android/reading/NovelDetail?novelId=${id}`,
  `https://android.jjwxc.net/app.jjwxc/android/search/novelDetail?novelId=${id}`,
  `https://android.jjwxc.net/app.jjwxc/android/novelinfo?novelId=${id}`,
];

for (const url of endpoints) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Version/4.0',
        'Accept': 'application/json',
      },
    });
    console.log(`\n${url} => ${r.status}`);
    const text = await r.text();
    if (text.length < 300) {
      console.log(text);
    } else {
      try {
        const data = JSON.parse(text);
        console.log('JSON keys:', Object.keys(data).slice(0, 20));
        if (data.data && typeof data.data === 'object') {
          console.log('data keys:', Object.keys(data.data).slice(0, 30));
        }
      } catch {
        console.log('Not JSON, snippet:', text.slice(0, 200));
      }
    }
  } catch (e) {
    console.log(`\n${url} => ERROR ${e.message}`);
  }
}
