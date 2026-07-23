const https = require('https');

const url = 'https://news.google.com/rss/articles/CBMirAJBVV95cUxOc3VCNUY0SnZwQ3lHX2c0VVhIdDgwUG0wNnpkMGF5SEttdFVRVG9NLVBrUXkyQ2J5QUlPcHA5S19tRlVOYVhoY29TRHNMRW9Fbmw4bmtVQnVaX1Q3cEF4a0Z0NGJMOWtGN3hBVUFIb3ktanhOX2djOVROU3A4ZU9SRWNyTG1NaXlPZ2NtanIwa1dMR0ZubjJLLXJpaU1xcE9pMDkzU01lWEhrUDZHdFNNS2FFZDZtU281UU96b3N5ZlloTEI4OHVGdFhaQVJrdERpemNVWVhPSmNJTjJQWHV4LVIyX1ZpQnBJMnRxbDNBbzdodm9xOGRVTmJLNzQyR0pnRl9XTmI4NlZUajJMaFJWcTh1ZFd4NWUzS2ZPRVVseVZhcmJNZVJrTGU3VnE?oc=5';

https.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
}, (res) => {
    console.log("STATUS:", res.statusCode);
    console.log("HEADERS:", res.headers);
    let data = '';
    res.on('data', chunk => data += chunk.toString('utf8'));
    res.on('end', () => {
        console.log("DATA LENGTH:", data.length);
        console.log("FIRST 2000 CHARS:", data.substring(0, 2000));
        
        // Let's test the regexes
        let m = data.match(/content="[^"]*url=([^"]+)"/i);
        console.log("Regex 1 (meta refresh):", m ? m[1] : null);
        m = data.match(/data-n-v-u="([^"]+)"/i);
        console.log("Regex 2 (data-n-v-u):", m ? m[1] : null);
        m = data.match(/data-url="([^"]+)"/i);
        console.log("Regex 3 (data-url):", m ? m[1] : null);
    });
}).on('error', console.error);
