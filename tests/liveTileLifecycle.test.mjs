import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function launcher() {
    const tile = {
        classList: { remove() {} },
        querySelector: () => null,
        getBoundingClientRect: () => ({ width: 100, height: 100 })
    };
    const context = vm.createContext({
        console, setTimeout, clearTimeout, Date, Map, Set,
        document: { querySelector: () => tile, querySelectorAll: () => [] },
        getComputedStyle: () => ({ getPropertyValue: () => '1' }),
        ResizeObserver: class { disconnect() {} observe() {} },
        Worker: class {
            listeners = new Set();
            messages = [];
            postMessage(message) { this.messages.push(message); }
            addEventListener(name, callback) { this.listeners.add(callback); }
            removeEventListener(name, callback) { this.listeners.delete(callback); }
            terminate() { this.terminated = true; }
        },
        DiscoRole: 'main',
        addEventListener() {},
        liveTileProviders: [{ id: 'photos', script: '/photos.js', metadata: { provide: ['gallery'] } }]
    });
    vm.runInContext('window = globalThis; window.parent = window', context);
    const module = new vm.SourceTextModule(await readFile(new URL('../src/scripts/liveTileManager.js', import.meta.url), 'utf8'), { context });
    await module.link(specifier => new vm.SyntheticModule(
        specifier === 'dompurify' ? ['default'] : ['TileType', 'AnimationType'],
        function () {
            if (specifier === 'dompurify') this.setExport('default', {});
            else {
                this.setExport('TileType', { STATIC: 'static' });
                this.setExport('AnimationType', { SLIDE: 'slide' });
            }
        }, { context }
    ));
    await module.evaluate();
    return { manager: module.namespace.default, context };
}

test('background releases workers and pending draws; return permits one fresh registration', async () => {
    const { manager, context } = await launcher();
    const worker = manager.registerLiveTileWorker('gallery', 'photos');
    const controller = context.liveTiles.gallery.controller;
    const pendingDraw = controller.draw();
    assert.equal(worker.listeners.size, 1);
    manager.suspend();
    await pendingDraw;
    assert.equal(worker.terminated, true);
    assert.equal(worker.listeners.size, 0);
    assert.equal(Object.keys(context.liveTiles).length, 0);
    assert.equal(manager.registerLiveTileWorker('gallery', 'photos'), undefined);
    manager.suspend();
    assert.equal(manager.resume(), true);
    assert.equal(manager.resume(), false);
    const replacement = manager.registerLiveTileWorker('gallery', 'photos');
    assert.notEqual(replacement, worker);
    assert.equal(replacement.messages[0].action, 'init');
    manager.suspend();
});

test('queued redraw cannot run after suspension', async () => {
    const { manager, context } = await launcher();
    const worker = manager.registerLiveTileWorker('gallery', 'photos');
    context.liveTiles.gallery.controller.requestDraw();
    manager.suspend();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(worker.messages.filter(message => message.action === 'draw').length, 0);
});
