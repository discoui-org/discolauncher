// The wallpaper stays on the home page. Only these empty tile surfaces blend
// with it; the real icons/live content render normally in the sibling page.
// Shadow DOM keeps the visual copies out of launcher/grid/event queries.
const surfaceSelector = '.disco-home-inner-tile, .disco-folder-matrix-cell';
const shellSelector = '.tile-list-page, .tile-list-container, .tile-list-inner-container, '
  + '.disco-home-tile, .disco-folder-open-panel, .disco-folder-open-content, '
  + '.disco-folder-open-bar, .disco-folder-matrix, .app-page-icon-banner';
const surfaceCopies = new WeakMap();

// CSS animations follow the mirrored classes automatically. The two places
// using Web Animations (folder opening and drag settling) share their timeline
// explicitly, including cancellation when a folder closes mid-animation.
export function animateWallpaperElement(element, keyframes, options) {
  const animation = element.animate(keyframes, options);
  queueMicrotask(() => {
    const copy = surfaceCopies.get(element);
    if (!copy || animation.playState === 'idle') return;
    const mirrored = copy.animate(keyframes, options);
    animation.ready.then(() => {
      if (animation.startTime !== null) mirrored.startTime = animation.startTime;
    }).catch(() => mirrored.cancel());
    animation.addEventListener('cancel', () => mirrored.cancel(), { once: true });
  });
  return animation;
}

const surfaceStyles = `
  :host {
    position: absolute; inset: 0; display: flex; justify-content: center;
    pointer-events: none !important; z-index: 0; mix-blend-mode: hard-light;
    perspective: var(--flow-perspective);
  }
  [data-wallpaper-context] {
    display: contents !important; transform: none !important;
    translate: none !important; scale: none !important; rotate: none !important;
    animation: none !important; transition: none !important;
    opacity: 1 !important; visibility: inherit !important;
  }
  /* The scroller's ::after spacer would otherwise become a second flex item
     through display:contents and shrink the surface page to half its width. */
  [data-wallpaper-context]::before, [data-wallpaper-context]::after {
    content: none !important; display: none !important;
  }
  div.tile-list-page {
    position: relative !important; width: 100%; max-width: 768px;
    mix-blend-mode: normal !important;
    background: var(--metro-background) !important;
    box-shadow: 0 0 0 1000px var(--metro-background) !important;
  }
  div.disco-home-inner-tile, div.disco-folder-matrix-cell {
    background: #808080 !important; box-shadow: none !important;
  }
  div.disco-folder-matrix { background: var(--metro-background) !important; }
  div.disco-folder-title-layer { background: transparent !important; }
  /* Headers/separators are painted by the real content layer. The copy has
     no title button, so its full-width gray line would blend under the name. */
  div.disco-folder-open-bar, div.disco-folder-open-bar::after {
    background: transparent !important;
  }
  div.app-page-icon-banner { background: var(--metro-background) !important; }
  *, *::before, *::after { pointer-events: none !important; }
`;

export function createWallpaperSurface(page) {
  const home = page.parentElement;
  const host = document.createElement('disco-wallpaper-surface');
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  const shadow = host.attachShadow({ mode: 'open' });
  const copies = new Map();
  const styles = document.createElement('style');
  const overrides = document.createElement('style');
  overrides.textContent = surfaceStyles;
  shadow.append(styles, overrides);

  function syncStyles() {
    // Reuse the application's layout, press/tilt and keyframes, including themes.
    // No computed-style or geometry reads are needed during scroll or touch.
    styles.textContent = Array.from(document.styleSheets, sheet => {
      if (sheet.disabled) return '';
      try {
        const css = Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
        return sheet.media.mediaText ? `@media ${sheet.media.mediaText} {${css}}` : css;
      } catch {
        // An inaccessible cross-origin theme cannot supply surface animations.
        return '';
      }
    }).join('\n');
  }

  function syncAttributes(source, copy) {
    for (const { name } of Array.from(copy.attributes)) {
      if (!source.hasAttribute(name) && name !== 'data-wallpaper-context') copy.removeAttribute(name);
    }
    for (const { name, value } of source.attributes) {
      if (name.startsWith('on')) continue;
      const next = name === 'class'
        ? value.split(/\s+/).filter(token => token !== 'wallpaper-content-layer').join(' ')
        : value;
      if (copy.getAttribute(name) !== next) copy.setAttribute(name, next);
    }
  }

  function copyShell(source) {
    if (!source.matches(`${shellSelector}, ${surfaceSelector}`)) return null;
    let copy = copies.get(source);
    if (!copy) {
      copy = document.createElement(source.localName);
      copies.set(source, copy);
      surfaceCopies.set(source, copy);
      syncAttributes(source, copy);
      if (!source.matches(surfaceSelector)) syncChildren(source, copy);
    }
    return copy;
  }

  function syncChildren(source, copy) {
    if (source.matches(surfaceSelector)) return;
    const children = Array.from(source.children, copyShell).filter(Boolean);
    const keep = new Set(children);
    for (const child of Array.from(copy.children)) {
      if (!keep.has(child)) child.remove();
    }
    children.forEach((child, index) => {
      if (copy.children[index] !== child) copy.insertBefore(child, copy.children[index] || null);
    });
  }

  // Ancestor shells provide the same CSS selector context, but the real
  // ancestors already provide positioning/perspective, so these have no boxes.
  const ancestors = [];
  for (let node = home; node; node = node.parentElement) ancestors.unshift(node);
  let parent = shadow;
  for (const source of ancestors) {
    const copy = document.createElement(source.localName);
    syncAttributes(source, copy);
    copy.setAttribute('data-wallpaper-context', '');
    copies.set(source, copy);
    parent.append(copy);
    parent = copy;
  }
  parent.append(copyShell(page));
  syncStyles();
  home.append(host);
  page.classList.add('wallpaper-content-layer');

  const observer = new MutationObserver(records => {
    const changedChildren = new Set();
    for (const record of records) {
      const copy = copies.get(record.target);
      if (!copy) continue; // Live-tile text/images are deliberately not mirrored.
      if (record.type === 'attributes') syncAttributes(record.target, copy);
      else if (!record.target.matches(surfaceSelector)) changedChildren.add(record.target);
    }
    for (const source of changedChildren) syncChildren(source, copies.get(source));
    if (changedChildren.size) {
      for (const [source, copy] of copies) {
        if (!ancestors.includes(source) && !page.contains(source)) {
          copy.remove();
          copies.delete(source);
          surfaceCopies.delete(source);
        }
      }
    }
  });
  observer.observe(page, { subtree: true, childList: true, attributes: true });
  for (const ancestor of ancestors) observer.observe(ancestor, { attributes: true });
  const styleObserver = new MutationObserver(syncStyles);
  styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
  document.head.addEventListener('load', syncStyles, true);

  return () => {
    observer.disconnect();
    styleObserver.disconnect();
    document.head.removeEventListener('load', syncStyles, true);
    page.classList.remove('wallpaper-content-layer');
    for (const [source, copy] of copies) {
      surfaceCopies.delete(source);
      copy.getAnimations().forEach(animation => animation.cancel());
    }
    host.remove();
    copies.clear();
  };
}

export function watchWallpaperSurface(page) {
  if (!page) return;
  let dispose;
  const update = () => {
    const enabled = page.parentElement.classList.contains('wallpaper-behind')
      && !document.body.matches('.alternative-wallpaper, .reduced-motion, .high-contrast');
    if (enabled && !dispose) dispose = createWallpaperSurface(page);
    else if (!enabled && dispose) {
      dispose();
      dispose = undefined;
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(page.parentElement, { attributes: true, attributeFilter: ['class'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  update();
  return () => { observer.disconnect(); dispose?.(); };
}
