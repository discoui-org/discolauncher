function overlaps(first, second) {
  return first.x < second.x + second.w
    && first.x + first.w > second.x
    && first.y < second.y + second.h
    && first.y + first.h > second.y;
}

class DiscoTileGrid {
  constructor(container, { column = 4 } = {}) {
    this.el = container;
    this.columnCount = column;
    this.engine = { nodes: [] };
    this.listeners = new Map();
    this.movable = false;
    this.batchMode = false;
    this.drag = null;

    this.el.classList.add("disco-tile-grid", `gs-${column}`);
    this.el.addEventListener("pointerdown", event => {
      const tile = event.target.closest?.(".disco-home-tile");
      if (tile) this.beginDrag(tile, event);
    });
  }

  on(eventName, listener) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
    return this;
  }

  emit(eventName, ...args) {
    (this.listeners.get(eventName) || []).forEach(listener => listener(...args));
  }

  getColumn() {
    return this.columnCount;
  }

  column(column) {
    const previousColumn = this.columnCount;
    this.columnCount = column;
    this.el.classList.remove(`gs-${previousColumn}`);
    this.el.classList.add(`gs-${column}`);

    this.engine.nodes.forEach(node => {
      node.w = Math.min(node.w, column);
      node.x = Math.max(0, Math.min(node.x, column - node.w));
    });
    this.resolveAllCollisions();
    this.render();
    return this;
  }

  enableMove(enabled) {
    this.movable = Boolean(enabled);
    this.el.classList.toggle("disco-tile-grid-editing", this.movable);
    return this;
  }

  batchUpdate(enabled = true) {
    this.batchMode = Boolean(enabled);
    if (!this.batchMode) {
      this.resolveAllCollisions();
      this.render();
    }
    return this;
  }

  clear() {
    this.engine.nodes.forEach(node => {
      delete node.el.gridstackNode;
      node.el.remove();
    });
    this.engine.nodes = [];
    this.render();
    return this;
  }

  addWidget(el, options = {}) {
    const hasPosition = Number.isFinite(options.x) && Number.isFinite(options.y);
    const node = {
      el,
      x: hasPosition ? options.x : 0,
      y: hasPosition ? options.y : 0,
      w: Math.max(1, Math.min(options.w || 1, this.columnCount)),
      h: Math.max(1, options.h || 1)
    };
    node.x = Math.max(0, Math.min(node.x, this.columnCount - node.w));

    if (!hasPosition) Object.assign(node, this.findFirstFit(node.w, node.h));

    el.gridstackNode = node;
    el.classList.add("grid-stack-item");
    this.el.append(el);
    this.engine.nodes.push(node);

    if (!this.batchMode) {
      this.pushCollisionsBelow(node);
      this.render();
    }
    return el;
  }

  removeWidget(el) {
    const node = el?.gridstackNode;
    if (!node) return this;
    this.engine.nodes = this.engine.nodes.filter(candidate => candidate !== node);
    delete el.gridstackNode;
    el.remove();
    this.compactVertically();
    this.render();
    this.emit("change", null, this.engine.nodes);
    return this;
  }

  moveNode(node, changes = {}) {
    if (!node || !this.engine.nodes.includes(node)) return false;
    const previous = { x: node.x, y: node.y, w: node.w, h: node.h };
    node.w = Math.max(1, Math.min(changes.w ?? node.w, this.columnCount));
    node.h = Math.max(1, changes.h ?? node.h);
    node.x = Math.max(0, Math.min(changes.x ?? node.x, this.columnCount - node.w));
    node.y = Math.max(0, changes.y ?? node.y);

    this.pushCollisionsBelow(node);
    this.render();

    const changed = previous.x !== node.x || previous.y !== node.y
      || previous.w !== node.w || previous.h !== node.h;
    if (changed) this.emit("change", null, this.engine.nodes);
    return changed;
  }

  beginDrag(el, event) {
    const pointerEvent = event?.originalEvent || event;
    if (!this.movable || this.drag || !el?.gridstackNode || !pointerEvent) return false;

    pointerEvent.preventDefault?.();
    const node = el.gridstackNode;
    const containerRect = this.el.getBoundingClientRect();
    const scaleX = containerRect.width && this.el.clientWidth
      ? this.el.clientWidth / containerRect.width
      : 1;
    const scaleY = containerRect.height && this.el.clientHeight
      ? this.el.clientHeight / containerRect.height
      : scaleX;
    const placeholder = document.createElement("div");
    placeholder.className = "disco-tile-grid-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    this.el.append(placeholder);
    this.drag = {
      node,
      pointerId: Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : null,
      pointerStartX: pointerEvent.clientX,
      pointerStartY: pointerEvent.clientY,
      tileStartX: node.x * (this.el.clientWidth / this.columnCount),
      tileStartY: node.y * (this.el.clientWidth / this.columnCount),
      scaleX,
      scaleY,
      targetX: node.x,
      targetY: node.y,
      placeholder,
      snapshot: new Map(this.engine.nodes.map(candidate => [candidate, {
        x: candidate.x,
        y: candidate.y,
        w: candidate.w,
        h: candidate.h
      }]))
    };

    el.classList.add("grid-dragging");
    this.renderPlaceholder();
    try {
      el.setPointerCapture?.(pointerEvent.pointerId);
    } catch {
      // Long-press can outlive the original pointer on some engines.
    }

    this.pointerMoveHandler = moveEvent => this.dragTo(moveEvent);
    this.pointerEndHandler = endEvent => this.endDrag(endEvent);
    window.addEventListener("pointermove", this.pointerMoveHandler, { capture: true, passive: false });
    window.addEventListener("pointerup", this.pointerEndHandler, true);
    window.addEventListener("pointercancel", this.pointerEndHandler, true);
    this.emit("dragstart", pointerEvent, el);
    return true;
  }

  dragTo(event) {
    if (!this.drag) return;
    if (this.drag.pointerId !== null && event.pointerId !== this.drag.pointerId) return;
    event.preventDefault();

    const {
      node,
      pointerStartX,
      pointerStartY,
      tileStartX,
      tileStartY,
      scaleX,
      scaleY
    } = this.drag;
    const cell = this.el.clientWidth / this.columnCount;
    if (!cell) return;

    const freeX = tileStartX + (event.clientX - pointerStartX) * scaleX;
    const freeY = tileStartY + (event.clientY - pointerStartY) * scaleY;
    const x = Math.max(0, Math.min(Math.round(freeX / cell), this.columnCount - node.w));
    const y = Math.max(0, Math.round(freeY / cell));

    if (x !== this.drag.targetX || y !== this.drag.targetY) {
      this.restoreDragSnapshot();
      node.x = x;
      node.y = y;
      this.pushCollisionsBelow(node);
      this.drag.targetX = x;
      this.drag.targetY = y;
      this.render();
      this.emit("drag", event, node.el);
    }

    node.el.style.left = `${freeX}px`;
    node.el.style.top = `${freeY}px`;
  }

  endDrag(event) {
    if (!this.drag) return;
    if (this.drag.pointerId !== null && event.pointerId !== this.drag.pointerId) return;

    const { node, placeholder } = this.drag;
    const tile = node.el;
    if (event.type === "pointercancel") this.restoreDragSnapshot();
    const fromLeft = tile.style.left;
    const fromTop = tile.style.top;
    const cell = this.el.clientWidth / this.columnCount;
    const targetLeft = `${node.x * cell}px`;
    const targetTop = `${node.y * cell}px`;
    const shouldAnimate = typeof tile.animate === "function"
      && (fromLeft !== targetLeft || fromTop !== targetTop);
    placeholder.remove();
    tile.classList.remove("grid-dragging");
    if (shouldAnimate) tile.classList.add("disco-tile-grid-settling");
    this.drag = null;
    this.render();

    if (shouldAnimate) {
      const settleAnimation = tile.animate(
        [
          { left: fromLeft, top: fromTop },
          { left: targetLeft, top: targetTop }
        ],
        {
          duration: 220,
          easing: "cubic-bezier(.2, .8, .2, 1)"
        }
      );
      settleAnimation.finished
        .catch(() => {})
        .finally(() => tile.classList.remove("disco-tile-grid-settling"));
    }
    window.removeEventListener("pointermove", this.pointerMoveHandler, true);
    window.removeEventListener("pointerup", this.pointerEndHandler, true);
    window.removeEventListener("pointercancel", this.pointerEndHandler, true);
    this.emit("dragstop", event, tile);
  }

  restoreDragSnapshot() {
    if (!this.drag) return;
    this.drag.snapshot.forEach((position, node) => Object.assign(node, position));
  }

  renderPlaceholder() {
    if (!this.drag) return;
    const cell = this.el.clientWidth / this.columnCount;
    const { node, placeholder } = this.drag;
    placeholder.style.left = `${node.x * cell}px`;
    placeholder.style.top = `${node.y * cell}px`;
    placeholder.style.width = `${node.w * cell}px`;
    placeholder.style.height = `${node.h * cell}px`;
  }

  findFirstFit(w, h) {
    for (let y = 0; ; y += 1) {
      for (let x = 0; x <= this.columnCount - w; x += 1) {
        const candidate = { x, y, w, h };
        if (!this.engine.nodes.some(node => overlaps(candidate, node))) return { x, y };
      }
    }
  }

  pushCollisionsBelow(source) {
    const queue = [source];
    while (queue.length) {
      const current = queue.shift();
      const collisions = this.engine.nodes
        .filter(node => node !== current && overlaps(current, node))
        .sort((first, second) => first.y - second.y || first.x - second.x);

      collisions.forEach(node => {
        node.y = current.y + current.h;
        queue.push(node);
      });
    }
  }

  resolveAllCollisions() {
    [...this.engine.nodes]
      .sort((first, second) => first.y - second.y || first.x - second.x)
      .forEach(node => this.pushCollisionsBelow(node));
  }

  compactVertically() {
    const nodes = [...this.engine.nodes]
      .sort((first, second) => first.y - second.y || first.x - second.x);

    nodes.forEach(node => {
      const originalY = node.y;
      for (let y = 0; y <= originalY; y += 1) {
        node.y = y;
        if (!this.engine.nodes.some(other => other !== node && overlaps(node, other))) break;
      }
    });
    this.resolveAllCollisions();
  }

  render() {
    if (this.batchMode) return;
    const cell = this.el.clientWidth / this.columnCount;
    const rows = this.engine.nodes.reduce((max, node) => Math.max(max, node.y + node.h), 0);
    this.el.setAttribute("gs-current-row", String(rows));
    this.el.style.minHeight = rows && cell ? `${rows * cell}px` : "0px";

    this.engine.nodes.forEach(node => {
      node.el.setAttribute("gs-x", node.x);
      node.el.setAttribute("gs-y", node.y);
      node.el.setAttribute("gs-w", node.w);
      node.el.setAttribute("gs-h", node.h);
      if (node === this.drag?.node) return;
      node.el.style.left = `${node.x * cell}px`;
      node.el.style.top = `${node.y * cell}px`;
      node.el.style.width = `${node.w * cell}px`;
      node.el.style.height = `${node.h * cell}px`;
    });
    this.renderPlaceholder();
  }
}

export default DiscoTileGrid;
