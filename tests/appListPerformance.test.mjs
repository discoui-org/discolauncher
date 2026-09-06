import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadModule(path, globals = {}) {
    const module = new vm.SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
        context: vm.createContext(globals)
    });
    await module.link(() => { throw new Error('Unexpected import'); });
    await module.evaluate();
    return module.namespace;
}

function imageEnvironment() {
    const images = [];
    let readbacks = 0;
    let failReadback = false;
    return {
        images,
        get readbacks() { return readbacks; },
        set failReadback(value) { failReadback = value; },
        globals: {
            Image: class {
                constructor() { images.push(this); }
            },
            document: {
                createElement: () => ({
                    getContext: () => ({
                        drawImage() {},
                        getImageData() {
                            readbacks++;
                            if (failReadback) throw new Error('Readback failed');
                            return { data: new Uint8ClampedArray(36).fill(255) };
                        }
                    })
                })
            }
        }
    };
}

test('repeated and concurrent icon requests share one image load and canvas readback', async () => {
    const env = imageEnvironment();
    const { getAverageColor, clearAverageColorCache } = await loadModule('../src/scripts/colorContrastDetector.js', env.globals);
    const first = getAverageColor('/icon?size=156');
    assert.equal(getAverageColor('/icon?size=156'), first);
    assert.equal(env.images.length, 1);
    env.images[0].onload();
    const color = await first;
    assert.equal(color.a, 255);
    assert.equal(color.hasLightEdges, true);
    assert.equal(color.hasDarkEdges, false);
    assert.equal(await getAverageColor('/icon?size=156'), color);
    assert.equal(env.readbacks, 1);
    assert.equal(env.images[0].onload, null);
    clearAverageColorCache();
    const refreshed = getAverageColor('/icon?size=156');
    assert.equal(env.images.length, 2);
    env.images[1].onload();
    await refreshed;
    assert.equal(env.readbacks, 2);
});

test('image errors and canvas errors are retryable, including invalidation during a pending load', async () => {
    const env = imageEnvironment();
    const { getAverageColor, clearAverageColorCache } = await loadModule('../src/scripts/colorContrastDetector.js', env.globals);
    const first = getAverageColor('/icon');
    clearAverageColorCache();
    const second = getAverageColor('/icon');
    env.images[0].onerror(new Error('Image failed'));
    await assert.rejects(first, /Image failed/);
    assert.equal(getAverageColor('/icon'), second);
    env.failReadback = true;
    env.images[1].onload();
    await assert.rejects(second, /Readback failed/);
    env.failReadback = false;
    const third = getAverageColor('/icon');
    env.images[2].onload();
    await third;
    assert.equal(env.images.length, 3);
});

test('color cache is bounded and evicts the least recently used result', async () => {
    const env = imageEnvironment();
    const { getAverageColor } = await loadModule('../src/scripts/colorContrastDetector.js', env.globals);
    for (let i = 0; i < 512; i++) {
        const result = getAverageColor(`/icon/${i}`);
        env.images.at(-1).onload();
        await result;
    }
    await getAverageColor('/icon/0');
    const extra = getAverageColor('/extra');
    env.images.at(-1).onload();
    await extra;
    await getAverageColor('/icon/0');
    assert.equal(env.images.length, 513);
    const evicted = getAverageColor('/icon/1');
    assert.equal(env.images.length, 514);
    env.images.at(-1).onload();
    await evicted;
});

test('visible range matches viewport intersections for empty, filtered and two-column lists', async () => {
    const { visibleEntryRange } = await loadModule('../src/scripts/virtualListRange.js');
    const layouts = [
        [],
        [21],
        [21, 85, 149, 213],
        [21, 85, 85, 149, 149, 213, 277, 277],
        Array.from({ length: 1000 }, (_, index) => Math.floor(index / 2) * 64 + 83)
    ];
    for (const tops of layouts) {
        const entries = tops.map(top => ({ top }));
        for (const top of [-512, 21, 85, 85.5, 213, 1000, 32083, 100000]) {
            for (const height of [0, 64, 640, 1700]) {
                const bottom = top + height;
                const { start, end } = visibleEntryRange(entries, top, bottom);
                assert.deepEqual(entries.slice(start, end), entries.filter(entry => entry.top + 64 >= top && entry.top <= bottom));
            }
        }
    }
});

test('locating the viewport does not scan a large app inventory', async () => {
    const { visibleEntryRange } = await loadModule('../src/scripts/virtualListRange.js');
    let reads = 0;
    const entries = Array.from({ length: 10000 }, (_, i) => ({
        get top() { reads++; return i * 64; }
    }));
    const { start, end } = visibleEntryRange(entries, 320000, 320640);
    assert.equal(start, 4999);
    assert.equal(end, 5011);
    assert.ok(reads < 40, `Expected logarithmic lookup, got ${reads} reads`);
});

test('app list recycles the viewport correctly through scrolling, filtering and resizing', async () => {
    class Node {
        children = [];
        style = {};
        clientWidth = 400;
        isConnected = true;
        classList = { contains: () => false, toggle() {} };
        setAttribute() {}
        append(...nodes) {
            this.children.push(...nodes);
            nodes.forEach(node => { node.parent = this; node.isConnected = true; });
        }
        remove() {
            this.isConnected = false;
            if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
        }
        replaceChildren(...nodes) {
            this.children.forEach(node => { node.isConnected = false; });
            this.children = [];
            this.append(...nodes);
        }
    }
    const nodes = new Map();
    const select = selector => {
        if (!nodes.has(selector)) nodes.set(selector, new Node());
        return nodes.get(selector);
    };
    const container = select('div.app-list-container');
    let creations = 0;
    const makeTile = entry => {
        creations++;
        const node = new Node();
        node.title = entry.title;
        container.append(node);
        return node;
    };
    const scroller = { y: 0, maxScrollY: -64000, wrapper: { clientHeight: 640 }, refresh() {} };
    const context = vm.createContext({
        console,
        document: { querySelector: select, body: new Node(), createElement: () => new Node(), createDocumentFragment: () => new Node(), createTextNode: () => new Node() },
        MutationObserver: class { observe() {} },
        addEventListener() {},
        getComputedStyle: () => ({ paddingTop: '21' }),
        innerWidth: 400,
        normalizeDiacritics: value => value,
        scrollers: { app_page_scroller: scroller },
        Disco: { getWorkProfileState: () => '{}' },
        DiscoBoard: { boardMethods: { createAppTile: makeTile, createLetterTile: icon => makeTile({ title: icon }) } }
    });
    vm.runInContext('window = globalThis', context);
    const module = new vm.SourceTextModule(await readFile(new URL('../src/scripts/pages/appList.js', import.meta.url), 'utf8'), { context });
    await module.link(async specifier => {
        if (specifier === '../virtualListRange') {
            return new vm.SourceTextModule(await readFile(new URL('../src/scripts/virtualListRange.js', import.meta.url), 'utf8'), { context });
        }
        const value = specifier === '../dom'
            ? selector => ({ 0: select(selector), on() { return this; }, hasClass: () => false, val: () => '', attr() {} })
            : specifier === 'lodash' ? { debounce: callback => callback }
            : { t: () => 'Search', toLowerCase: value => value.toLowerCase() };
        return new vm.SyntheticModule(['default'], function () { this.setExport('default', value); }, { context });
    });
    await module.evaluate();
    const list = context.appListVirtualizer;
    const entries = Array.from({ length: 1000 }, (_, i) => ({ type: 'app', title: `App ${i}`, searchTitle: `app ${i}` }));
    list.setEntries(entries);
    assert.ok(list.rendered.size < 30);
    scroller.y = -6400;
    list.render();
    const afterScroll = creations;
    scroller.y--;
    list.render();
    assert.equal(creations, afterScroll);
    scroller.y = 0;
    list.render();
    assert.equal(list.getRenderedElementsInLayoutOrder()[0].title, 'App 0');
    list.setSearchMode(true);
    list.setFilter('app 999');
    assert.equal(list.rendered.size, 1);
    assert.equal(list.getRenderedElementsInLayoutOrder()[0].title, 'App 999');
    list.setFilter('no results');
    assert.equal(list.rendered.size, 0);
    list.setSearchMode(false);
    context.innerWidth = container.clientWidth = 800;
    list.relayout();
    assert.equal(list.visibleEntries[0].top, list.visibleEntries[1].top);
    assert.equal(list.getRenderedElementsInLayoutOrder()[1].title, 'App 1');
    list.setEntries([{ type: 'app', title: 'Replacement', searchTitle: 'replacement' }]);
    assert.equal(list.rendered.size, 1);
    assert.equal(list.getRenderedElementsInLayoutOrder()[0].title, 'Replacement');
});
