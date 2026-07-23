const https = require('https');

https.get('https://www.bing.com/news/search?q=mattarella&format=rss', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("STATUS:", res.statusCode);
        console.log(data.slice(0, 1500)); // print first 1500 chars to see structure
    });
});
