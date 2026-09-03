function overlaps(first, second) {
  return first.x < second.x + second.w
    && first.x + first.w > second.x
    && first.y < second.y + second.h
    && first.y + first.h > second.y;
}

const FOLDER_INTENT_DELAY = 500;

function folderMatrixDimensions(width, height) {
  return {
    columns: Math.max(2, Math.round(width * 1.5)),
    rows: Math.max(2, Math.round(height * 1.5))
  };
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
    this.extraHeight = 0;

    this.el.classList.add("disco-tile-grid", `gs-${column}`);
    this.el.addEventListener("pointerdown", event => {
      const tile = event.target.closest?.(".disco-home-tile, .disco-home-folder-tile");
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
    this.collapseEmptyRows();
    this.render();
    return this;
  }

  enableMove(enabled) {
    this.movable = Boolean(enabled);
    this.el.classList.toggle("disco-tile-grid-editing", this.movable);
    return this;
  }

  setExtraHeight(height = 0) {
    this.extraHeight = Math.max(0, Number(height) || 0);
    this.render();
    return this;
  }

  batchUpdate(enabled = true) {
    this.batchMode = Boolean(enabled);
    if (!this.batchMode) {
      this.resolveAllCollisions();
      this.collapseEmptyRows();
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
      this.collapseEmptyRows();
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
    this.collapseEmptyRows();
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
    this.collapseEmptyRows();
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
      proposed: null,
      folderHover: null,
      folderIntent: null,
      relocationSignature: "",
      snapshot: new Map(this.engine.nodes.map(candidate => [candidate, {
        x: candidate.x,
        y: candidate.y,
        w: candidate.w,
        h: candidate.h
      }]))
    };

    el.classList.add("grid-dragging");
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
    const containerRect = this.el.getBoundingClientRect();
    const pointerX = (event.clientX - containerRect.left) * scaleX;
    const pointerY = (event.clientY - containerRect.top) * scaleY;
    const x = Math.max(0, Math.min(Math.round(freeX / cell), this.columnCount - node.w));
    const y = Math.max(0, Math.round(freeY / cell));

    // Folder hit testing must use the untouched grid, not the temporary
    // relocation layout created by the previous pointer move.
    this.restoreDragSnapshot();
    this.drag.proposed = { x, y, freeX, freeY, pointerX, pointerY, event };
    this.updateFolderHover(this.findFolderCandidate(node, freeX, freeY, pointerX, pointerY));
    this.applyDragLayout();
  }

  findFolderCandidate(node, freeX, freeY, pointerX, pointerY) {
    const canCreateFolder = node.el.classList.contains("disco-home-tile")
      && !node.el.classList.contains("disco-home-folder-tile");

    const cell = this.el.clientWidth / this.columnCount;
    if (!cell) return null;
    const source = { x: freeX / cell, y: freeY / cell, w: node.w, h: node.h };
    const pointerGridX = pointerX / cell;
    const pointerGridY = pointerY / cell;
    const target = this.engine.nodes
      .filter(candidate => candidate !== node
        && candidate.el.matches(".disco-home-tile, .disco-home-folder-tile")
        && overlaps(source, candidate))
      .sort((first, second) => {
        const firstDistance = Math.hypot(pointerGridX - (first.x + first.w / 2), pointerGridY - (first.y + first.h / 2));
        const secondDistance = Math.hypot(pointerGridX - (second.x + second.w / 2), pointerGridY - (second.y + second.h / 2));
        return firstDistance - secondDistance;
      })[0];
    if (!target) return null;

    const targetCenterX = target.x + target.w / 2;
    const targetCenterY = target.y + target.h / 2;
    const distance = Math.hypot(pointerGridX - targetCenterX, pointerGridY - targetCenterY);
    const centerRadius = Math.min(target.w, target.h) * 0.28;
    return { target, isCentered: canCreateFolder && distance <= centerRadius };
  }

  updateFolderHover(candidate) {
    const drag = this.drag;
    const currentTarget = candidate?.target || null;
    if (drag.folderHover?.target === currentTarget) return;

    this.clearFolderHover();
    if (!currentTarget) return;

    const hover = { target: currentTarget, resolved: false, timer: null };
    drag.folderHover = hover;
    hover.timer = setTimeout(() => {
      if (!this.drag || this.drag.folderHover !== hover) return;
      hover.resolved = true;
      const proposed = this.drag.proposed;
      const current = proposed && this.findFolderCandidate(
        this.drag.node,
        proposed.freeX,
        proposed.freeY,
        proposed.pointerX,
        proposed.pointerY
      );
      if (current?.target === hover.target && current.isCentered) {
        this.drag.folderIntent = { target: hover.target };
        this.showFolderPreview(hover.target.el, this.drag.node.el);
      }
      this.applyDragLayout();
    }, FOLDER_INTENT_DELAY);
  }

  clearFolderHover() {
    if (!this.drag) return;
    const { folderHover, folderIntent } = this.drag;
    if (folderHover?.timer) clearTimeout(folderHover.timer);
    if (folderIntent?.target?.el) this.clearFolderPreview(folderIntent.target.el);
    this.drag.folderHover = null;
    this.drag.folderIntent = null;
  }

  applyDragLayout() {
    if (!this.drag?.proposed) return;
    const { node, proposed, folderHover, folderIntent } = this.drag;
    const previousX = node.x;
    const previousY = node.y;

    this.restoreDragSnapshot();
    node.x = proposed.x;
    node.y = proposed.y;
    let relocatedNodes = [];
    if (!folderIntent && (!folderHover || folderHover.resolved)) {
      relocatedNodes = this.pushCollisionsBelow(node);
    }

    this.drag.targetX = node.x;
    this.drag.targetY = node.y;
    this.render();
    node.el.style.left = `${proposed.freeX}px`;
    node.el.style.top = `${proposed.freeY}px`;

    if (previousX !== node.x || previousY !== node.y) this.emit("drag", proposed.event, node.el);
    const relocationSignature = relocatedNodes.length
      ? [...new Set(relocatedNodes)]
        .map(candidate => `${this.engine.nodes.indexOf(candidate)}:${candidate.x}:${candidate.y}:${candidate.w}:${candidate.h}`)
        .sort()
        .join("|")
      : "";
    if (relocatedNodes.length && relocationSignature !== this.drag.relocationSignature) {
      this.emit("relocate", proposed.event, node.el, relocatedNodes);
    }
    this.drag.relocationSignature = relocationSignature;
  }

  showFolderPreview(target, source) {
    this.clearFolderPreview(target);
    const existingMatrix = target.querySelector(":scope > .disco-folder-matrix");
    const preview = existingMatrix
      ? existingMatrix.cloneNode(true)
      : this.createFolderMatrix(target.gridstackNode, [target, source]);
    preview.classList.add("disco-folder-intent-preview");
    preview.setAttribute("aria-hidden", "true");

    if (existingMatrix) {
      const emptyCell = [...preview.children]
        .find(cell => !cell.querySelector(":scope > .disco-home-inner-tile"));
      const innerTile = this.createFolderThumbnail(source);
      if (emptyCell && innerTile) emptyCell.append(innerTile);
    }

    target.classList.add("folder-intent-target");
    target.append(preview);
  }

  createFolderMatrix(node, tiles) {
    const { columns, rows } = folderMatrixDimensions(node.w, node.h);
    const matrix = document.createElement("div");
    matrix.className = "disco-folder-matrix";
    matrix.style.setProperty("--folder-grid-columns", columns);
    matrix.style.setProperty("--folder-grid-rows", rows);
    for (let index = 0; index < columns * rows; index += 1) {
      const cell = document.createElement("div");
      cell.className = "disco-folder-matrix-cell";
      const innerTile = this.createFolderThumbnail(tiles[index]);
      if (innerTile) cell.append(innerTile);
      matrix.append(cell);
    }
    return matrix;
  }

  createFolderThumbnail(tile) {
    const thumbnail = tile
      ?.querySelector(":scope > .disco-home-inner-tile")
      ?.cloneNode(true);
    if (!thumbnail) return null;

    thumbnail.classList.add("disco-folder-thumbnail");
    thumbnail.querySelectorAll(".live-tile-container, .live-tile-notification-count").forEach(element => element.remove());
    thumbnail.querySelectorAll(".disco-home-tile-imageicon").forEach(icon => {
      icon.classList.remove("hide-direction-0", "hide-direction-1", "show-direction-0", "show-direction-1");
      icon.style.removeProperty("visibility");
    });
    return thumbnail;
  }

  clearFolderPreview(target) {
    target.classList.remove("folder-intent-target");
    target.querySelector(":scope > .disco-folder-intent-preview")?.remove();
  }

  endDrag(event) {
    if (!this.drag) return;
    if (this.drag.pointerId !== null && event.pointerId !== this.drag.pointerId) return;

    const { node, folderIntent } = this.drag;
    if (event.type !== "pointercancel" && folderIntent) {
      const folder = folderIntent.target.el.classList.contains("disco-home-folder-tile")
        ? this.addToFolder(folderIntent.target, node)
        : this.createFolder(folderIntent.target, node);
      this.clearFolderHover();
      this.drag = null;
      this.render();
      window.removeEventListener("pointermove", this.pointerMoveHandler, true);
      window.removeEventListener("pointerup", this.pointerEndHandler, true);
      window.removeEventListener("pointercancel", this.pointerEndHandler, true);
      this.emit("foldercreated", folder, folder.folderChildren);
      this.emit("dragstop", event, folder);
      return;
    }

    this.clearFolderHover();
    if (event.type !== "pointercancel") this.applyDragLayout();
    const tile = node.el;
    if (event.type === "pointercancel") this.restoreDragSnapshot();
    this.collapseEmptyRows();
    const fromLeft = tile.style.left;
    const fromTop = tile.style.top;
    const cell = this.el.clientWidth / this.columnCount;
    const targetLeft = `${node.x * cell}px`;
    const targetTop = `${node.y * cell}px`;
    const shouldAnimate = typeof tile.animate === "function"
      && (fromLeft !== targetLeft || fromTop !== targetTop);
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

  createFolder(targetNode, sourceNode) {
    this.restoreDragSnapshot();
    const target = targetNode.el;
    const source = sourceNode.el;
    const children = [target, source].map(tile => this.tileData(tile));
    const matrix = target.querySelector(":scope > .disco-folder-intent-preview")?.cloneNode(true);
    const folder = document.createElement("div");
    folder.className = "disco-element disco-home-tile disco-home-folder-tile grid-stack-item";
    folder.setAttribute("supportedsizes", "s,m,w");
    folder.folderChildren = children;
    folder.dataset.folderChildren = JSON.stringify(children);
    if (matrix) {
      matrix.classList.remove("disco-folder-intent-preview");
      folder.append(matrix);
    }

    target.replaceWith(folder);
    delete target.gridstackNode;
    targetNode.el = folder;
    folder.gridstackNode = targetNode;
    this.engine.nodes = this.engine.nodes.filter(candidate => candidate !== sourceNode);
    delete source.gridstackNode;
    source.remove();
    this.collapseEmptyRows();
    return folder;
  }

  addToFolder(targetNode, sourceNode) {
    this.restoreDragSnapshot();
    const folder = targetNode.el;
    const source = sourceNode.el;
    const children = [
      ...(folder.folderChildren || JSON.parse(folder.dataset.folderChildren || "[]")),
      this.tileData(source)
    ];
    const preview = folder.querySelector(":scope > .disco-folder-intent-preview");

    folder.folderChildren = children;
    folder.dataset.folderChildren = JSON.stringify(children);
    if (preview) {
      folder.querySelector(":scope > .disco-folder-matrix:not(.disco-folder-intent-preview)")?.remove();
      preview.classList.remove("disco-folder-intent-preview");
      preview.removeAttribute("aria-hidden");
    }

    this.engine.nodes = this.engine.nodes.filter(candidate => candidate !== sourceNode);
    delete source.gridstackNode;
    source.remove();
    this.collapseEmptyRows();
    return folder;
  }

  tileData(tile) {
    return {
      p: tile.getAttribute("packagename"),
      i: tile.getAttribute("icon"),
      ib: tile.getAttribute("icon-bg"),
      t: tile.getAttribute("title"),
      s: tile.getAttribute("supportedsizes")?.split(",") || ["s"],
      w: tile.gridstackNode?.w || Number(tile.getAttribute("gs-w")) || 1,
      h: tile.gridstackNode?.h || Number(tile.getAttribute("gs-h")) || 1
    };
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
    const relocatedNodes = [];
    while (queue.length) {
      const current = queue.shift();
      const collisions = this.engine.nodes
        .filter(node => node !== current && overlaps(current, node))
        .sort((first, second) => first.y - second.y || first.x - second.x);

      collisions.forEach(node => {
        const nextY = current.y + current.h;
        if (node.y !== nextY) {
          node.y = nextY;
          relocatedNodes.push(node);
        }
        queue.push(node);
      });
    }
    return relocatedNodes;
  }

  resolveAllCollisions() {
    [...this.engine.nodes]
      .sort((first, second) => first.y - second.y || first.x - second.x)
      .forEach(node => this.pushCollisionsBelow(node));
  }

  collapseEmptyRows() {
    let rowCount = this.engine.nodes.reduce(
      (max, node) => Math.max(max, node.y + node.h),
      0
    );

    for (let row = 0; row < rowCount; row += 1) {
      const isEmpty = !this.engine.nodes.some(node => node.y <= row && node.y + node.h > row);
      if (!isEmpty) continue;

      // Keep gaps inside a row intact. Only a fully empty horizontal row is
      // removed, so every tile below it moves up by exactly one grid unit.
      this.engine.nodes.forEach(node => {
        if (node.y > row) node.y -= 1;
      });
      rowCount -= 1;
      row -= 1;
    }
  }

  render() {
    if (this.batchMode) return;
    const cell = this.el.clientWidth / this.columnCount;
    const rows = this.engine.nodes.reduce((max, node) => Math.max(max, node.y + node.h), 0);
    this.el.setAttribute("gs-current-row", String(rows));
    const gridHeight = rows && cell ? rows * cell : 0;
    this.el.style.minHeight = `${gridHeight + this.extraHeight}px`;

    this.engine.nodes.forEach(node => {
      node.el.setAttribute("gs-x", node.x);
      node.el.setAttribute("gs-y", node.y);
      node.el.setAttribute("gs-w", node.w);
      node.el.setAttribute("gs-h", node.h);
      if (node.el.classList.contains("disco-home-folder-tile")) {
        this.syncFolderMatrix(node.el, node);
      }
      if (node === this.drag?.node) return;
      node.el.style.left = `${node.x * cell}px`;
      node.el.style.top = `${node.y * cell}px`;
      node.el.style.width = `${node.w * cell}px`;
      node.el.style.height = `${node.h * cell}px`;
    });
  }

  syncFolderMatrix(folder, node) {
    const matrix = folder.querySelector(":scope > .disco-folder-matrix");
    if (!matrix) return;

    const { columns, rows } = folderMatrixDimensions(node.w, node.h);
    const cellCount = columns * rows;
    matrix.style.setProperty("--folder-grid-columns", columns);
    matrix.style.setProperty("--folder-grid-rows", rows);

    while (matrix.children.length < cellCount) {
      const cell = document.createElement("div");
      cell.className = "disco-folder-matrix-cell";
      matrix.append(cell);
    }
    [...matrix.children].forEach((cell, index) => {
      cell.hidden = index >= cellCount;
    });
  }
}

export default DiscoTileGrid;
