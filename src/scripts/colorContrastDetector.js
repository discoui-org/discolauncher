const averageColorCache = new Map();
const MAX_CACHED_COLORS = 512;

export function clearAverageColorCache() {
    averageColorCache.clear();
}

export function getAverageColor(imageUrl) {
    const key = String(imageUrl);
    if (averageColorCache.has(key)) {
        const result = averageColorCache.get(key);
        averageColorCache.delete(key);
        averageColorCache.set(key, result);
        return result;
    }
    // Cache the pending promise too: rows entering the viewport together can
    // share one load/readback. Retain only the result, never a bitmap or canvas.
    const result = readAverageColor(key).catch(error => {
        if (averageColorCache.get(key) === result) averageColorCache.delete(key);
        throw error;
    });
    averageColorCache.set(key, result);
    if (averageColorCache.size > MAX_CACHED_COLORS) {
        averageColorCache.delete(averageColorCache.keys().next().value);
    }
    return result;
}

function readAverageColor(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Allows loading images from other domains if CORS headers are set

        img.onload = () => {
            try {
                // A 3x3 sample lets us inspect the image perimeter separately from its centre.
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = 3;
                canvas.height = 3;

                ctx.drawImage(img, 0, 0, 3, 3);

                const pixels = ctx.getImageData(0, 0, 3, 3).data;
                const average = [0, 0, 0, 0];
                let lightEdgePixels = 0;
                let darkEdgePixels = 0;

                for (let pixelIndex = 0; pixelIndex < 9; pixelIndex++) {
                    const offset = pixelIndex * 4;
                    const r = pixels[offset];
                    const g = pixels[offset + 1];
                    const b = pixels[offset + 2];
                    const a = pixels[offset + 3];

                    average[0] += r;
                    average[1] += g;
                    average[2] += b;
                    average[3] += a;

                    // Index 4 is the centre pixel.  Only the eight outer pixels
                    // determine whether a subtle border is needed.
                    if (pixelIndex !== 4) {
                        const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
                        if (a >= 230 && lightness >= 245) lightEdgePixels++;
                        if (a >= 230 && lightness <= 10) darkEdgePixels++;
                    }
                }

                resolve({
                    r: Math.round(average[0] / 9),
                    g: Math.round(average[1] / 9),
                    b: Math.round(average[2] / 9),
                    a: Math.round(average[3] / 9),
                    hasLightEdges: lightEdgePixels >= 6,
                    hasDarkEdges: darkEdgePixels >= 6
                });
            } catch (error) {
                reject(error);
            } finally {
                img.onload = img.onerror = null;
            }
        };

        img.onerror = error => {
            img.onload = img.onerror = null;
            reject(error);
        };
        img.src = imageUrl;
    });
}
export function getTextColor({ r, g, b, a }) {
    // Calculate the relative luminance
    // Formula: 0.2126 * R + 0.7152 * G + 0.0722 * B
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // If luminance is high, return dark text color, else return light text color
    return a <= 128 ? '#FFFFFF' : luminance > 255 * (5 / 6) ? '#000000' : '#FFFFFF'; // Black or White
}
