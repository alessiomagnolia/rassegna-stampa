const https = require('https');

const url = 'https://news.google.com/rss/articles/CBMirAJBVV95cUxOc3VCNUY0SnZwQ3lHX2c0VVhIdDgwUG0wNnpkMGF5SEttdFVRVG9NLVBrUXkyQ2J5QUlPcHA5S19tRlVOYVhoY29TRHNMRW9Fbmw4bmtVQnVaX1Q3cEF4a0Z0NGJMOWtGN3hBVUFIb3ktanhOX2djOVROU3A4ZU9SRWNyTG1NaXlPZ2NtanIwa1dMR0ZubjJLLXJpaU1xcE9pMDkzU01lWEhrUDZHdFNNS2FFZDZtU281UU96b3N5ZlloTEI4OHVGdFhaQVJrdERpemNVWVhPSmNJTjJQWHV4LVIyX1ZpQnBJMnRxbDNBbzdodm9xOGRVTmJLNzQyR0pnRl9XTmI4NlZUajJMaFJWcTh1ZFd4NWUzS2ZPRVVseVZhcmJNZVJrTGU3VnE?oc=5';

https.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': 'CONSENT=YES+cb.20230501-14-p0.en+FX+437;'
    }
}, (res) => {
    console.log("STATUS:", res.statusCode);
    console.log("LOCATION:", res.headers.location);
    let html = '';
    res.on('data', chunk => html += chunk.toString('utf8'));
    res.on('end', () => {
        const fs = require('fs');
        fs.writeFileSync('C:\\Users\\magno\\.gemini\\antigravity\\scratch\\rassegna-stampa\\gnews_output.html', html);
        console.log("Done fetching HTML. Length:", html.length);
        
        let m = html.match(/content="[^"]*url=([^"]+)"/i);
        console.log("Regex 1:", m ? m[1] : null);
        
        m = html.match(/data-n-v-u="([^"]+)"/i);
        console.log("Regex 2:", m ? m[1] : null);
        
        m = html.match(/data-url="([^"]+)"/i);
        console.log("Regex 3:", m ? m[1] : null);
        
        let aTags = html.match(/<a[^>]+href="(https?:\/\/[^"]+)"/gi);
        if (aTags) {
            console.log("aTags found:", aTags.length);
            for (let aTag of aTags) {
                let match = aTag.match(/href="(https?:\/\/[^"]+)"/i);
                if (match) {
                    let matchUrl = match[1].replace(/&amp;/g, '&');
                    if (!matchUrl.includes('google.com') && 
                        !matchUrl.includes('googleusercontent.com') && 
                        !matchUrl.includes('gstatic.com') && 
                        !matchUrl.includes('schema.org')) {
                        console.log("Found real URL:", matchUrl);
                    }
                }
            }
        } else {
            console.log("No aTags found!");
        }
    });
});
