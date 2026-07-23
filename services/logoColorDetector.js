const zlib = require('zlib');

/**
 * Quick PNG pixel analyzer: returns { isLight, r, g, b }
 * Works only for PNG (most logo formats). Falls back to isLight=false for other formats.
 * Only reads the first IDAT chunk for performance.
 */
function analyzePngBase64(base64Data) {
    try {
        // Strip data URL prefix
        const raw = base64Data.replace(/^data:[^;]+;base64,/, '');
        const buf = Buffer.from(raw, 'base64');

        // Verify PNG signature
        if (buf.slice(0, 4).toString('hex') !== '89504e47') {
            return { isLight: false }; // Not a PNG (SVG, JPEG etc.) — skip detection
        }

        // Parse chunks to find IHDR and IDAT
        let width = 0, height = 0, bitDepth = 0, colorType = 0;
        let idatBuffers = [];
        let pos = 8; // skip signature

        while (pos < buf.length - 8) {
            const chunkLen = buf.readUInt32BE(pos);
            const chunkType = buf.slice(pos + 4, pos + 8).toString('ascii');

            if (chunkType === 'IHDR') {
                width     = buf.readUInt32BE(pos + 8);
                height    = buf.readUInt32BE(pos + 12);
                bitDepth  = buf[pos + 16];
                colorType = buf[pos + 17];
            } else if (chunkType === 'IDAT') {
                idatBuffers.push(buf.slice(pos + 8, pos + 8 + chunkLen));
            } else if (chunkType === 'IEND') {
                break;
            }
            pos += 12 + chunkLen;
        }

        if (!width || !height || idatBuffers.length === 0) return { isLight: false };

        // Supported color types: 2 = RGB, 6 = RGBA
        if (colorType !== 2 && colorType !== 6) return { isLight: false };
        if (bitDepth !== 8) return { isLight: false };

        // Decompress IDAT
        const compressed = Buffer.concat(idatBuffers);
        let raw2;
        try { raw2 = zlib.inflateSync(compressed); } catch { return { isLight: false }; }

        const bytesPerPixel = colorType === 6 ? 4 : 3;
        const stride = 1 + width * bytesPerPixel; // +1 for filter byte

        // Sample ~200 pixels spread across the image
        const sampleStep = Math.max(1, Math.floor(height / 15));
        let sumR = 0, sumG = 0, sumB = 0, sumA = 0, count = 0;

        for (let row = 0; row < height; row += sampleStep) {
            const rowStart = row * stride + 1; // +1 to skip filter byte
            const colStep = Math.max(1, Math.floor(width / 15));
            for (let col = 0; col < width; col += colStep) {
                const pixelStart = rowStart + col * bytesPerPixel;
                if (pixelStart + bytesPerPixel > raw2.length) continue;
                const r = raw2[pixelStart];
                const g = raw2[pixelStart + 1];
                const b = raw2[pixelStart + 2];
                const a = bytesPerPixel === 4 ? raw2[pixelStart + 3] : 255;
                // Skip fully transparent pixels
                if (a < 30) continue;
                sumR += r; sumG += g; sumB += b; sumA += a;
                count++;
            }
        }

        if (count === 0) return { isLight: false };

        const avgR = Math.round(sumR / count);
        const avgG = Math.round(sumG / count);
        const avgB = Math.round(sumB / count);

        // Luminance (perceptual)
        const luminance = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;

        // "Light" = very pale or white-ish (luminance > 210 and all channels close)
        const isLight = luminance > 205 &&
            Math.abs(avgR - avgG) < 30 &&
            Math.abs(avgG - avgB) < 30;

        return { isLight, r: avgR, g: avgG, b: avgB, luminance };
    } catch {
        return { isLight: false };
    }
}

/**
 * For a light (white) logo, return appropriate header CSS:
 * a dark background so the logo remains visible.
 */
function getHeaderStyleForLogo(logoBase64) {
    if (!logoBase64) return null;

    // SVG: check for white fill in text
    if (logoBase64.includes('data:image/svg')) {
        const decoded = Buffer.from(
            logoBase64.replace(/^data:[^;]+;base64,/, ''), 'base64'
        ).toString('utf8');
        const whiteFillCount = (decoded.match(/fill\s*[=:]\s*["']?\s*(#fff|#ffffff|white)\b/gi) || []).length;
        const darkFillCount  = (decoded.match(/fill\s*[=:]\s*["']?\s*(?!white|#fff|#ffffff|none|transparent)[#a-z]/gi) || []).length;
        if (whiteFillCount > 0 && whiteFillCount >= darkFillCount) {
            return {
                background: '#1a1a2e',
                dateColor: '#ccc',
                badgeBg: '#2a2a3e',
                badgeColor: '#aaa',
                borderImage: 'linear-gradient(to right, #7c5cff, #00d4aa)'
            };
        }
        return null;
    }

    const { isLight } = analyzePngBase64(logoBase64);
    if (!isLight) return null;

    return {
        background: '#1a1a2e',
        dateColor: '#ccc',
        badgeBg: '#2a2a3e',
        badgeColor: '#aaa',
        borderImage: 'linear-gradient(to right, #7c5cff, #00d4aa)'
    };
}

module.exports = { getHeaderStyleForLogo };
