// Entries have fixed-height rows and nondecreasing tops. Multiple columns
// share a top, so both searches must include every entry at either boundary.
export function visibleEntryRange(entries, top, bottom, rowHeight = 64) {
    let low = 0;
    let high = entries.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (entries[middle].top + rowHeight < top) low = middle + 1;
        else high = middle;
    }
    const start = low;
    high = entries.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (entries[middle].top <= bottom) low = middle + 1;
        else high = middle;
    }
    return { start, end: low };
}
