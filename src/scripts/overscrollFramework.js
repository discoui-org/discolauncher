/* Small, dependency-free replacement for BetterScroll. */
class HookEmitter {
  #listeners = new Map();
  on(event, callback) {
    this.#listeners.set(event, [...(this.#listeners.get(event) || []), callback]);
  }
  emit(event, ...args) {
    (this.#listeners.get(event) || []).forEach((callback) => callback(...args));
  }
}

const resolveElement = (selector) => typeof selector === "string" ? document.querySelector(selector) : selector;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const now = () => performance.now();
const DRAG_START_DISTANCE = 8;
const MAX_OVERSCROLL_DISTANCE = 120;

class DiscoScroller {
  constructor(selector, options = {}, { slide = false } = {}) {
    this.wrapper = resolveElement(selector);
    if (!this.wrapper) throw new Error(`Scroller target not found: ${selector}`);
    this.content = this.wrapper.firstElementChild;
    if (!this.content) throw new Error("A scroller wrapper needs one content element.");

    this.options = { scrollX: false, scrollY: true, bounce: true, bounceTime: 300, momentum: true, ...options };
    this.isSlide = slide;
    this.enabled = true;
    this.x = this.y = this.minScrollX = this.minScrollY = this.maxScrollX = this.maxScrollY = 0;
    this.events = new HookEmitter();
    this.translaterHooks = new HookEmitter();
    this.animaterHooks = new HookEmitter();
    this.scrollerHooks = new HookEmitter();
    this.scroller = {
      translater: { hooks: this.translaterHooks },
      animater: { hooks: this.animaterHooks },
      hooks: this.scrollerHooks,
    };
    this.animationFrame = null;
    this.animationTarget = null;
    this.positionFrame = null;
    this.pendingPosition = null;
    this.pointer = null;
    this.loopEnabled = false;
    this.loopClones = false;
    this.loopRecycling = false;
    this.pageCount = 0;

    this.wrapper.style.overflow = "hidden";
    // Native scrolling would compete with our transform-based overscroll.
    this.wrapper.style.touchAction = "none";
    this.content.style.willChange = "transform";
    this.content.classList.add("flow-scrollable");
    this.content.DiscoScroll = this;
    this.wrapper.DiscoScroll = this;
    if (this.options.scrollbar) this.createScrollbar();
    if (this.isSlide) this.setupSlide();
    this.bindEvents();
    this.refresh();
    const startX = Number.isFinite(this.options.startX) ? this.options.startX : this.isSlide && this.loopEnabled ? -this.wrapper.clientWidth : 0;
    this.setPosition(startX, Number.isFinite(this.options.startY) ? this.options.startY : 0, false);
    requestAnimationFrame(() => this.refresh());
  }

  setupSlide() {
    this.options.scrollX = true;
    this.options.scrollY = false;
    this.options.bounce = false;
    this.options.momentum = false;
    this.pageCount = this.content.children.length;
    if (this.options.slide?.loop && this.pageCount > 1) {
      this.loopEnabled = true;
      if (this.options.slide.clone === true) {
        const first = this.content.firstElementChild.cloneNode(true);
        const last = this.content.lastElementChild.cloneNode(true);
        first.dataset.discoScrollClone = last.dataset.discoScrollClone = "true";
        this.content.insertBefore(last, this.content.firstElementChild);
        this.content.append(first);
        this.loopClones = true;
      } else {
        this.loopRecycling = true;
      }
    }
  }

  bindEvents() {
    this.wrapper.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    window.addEventListener("pointermove", (event) => this.onPointerMove(event));
    window.addEventListener("pointerup", (event) => this.onPointerUp(event));
    window.addEventListener("pointercancel", (event) => this.onPointerUp(event));
    this.wrapper.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    window.addEventListener("resize", () => this.refresh());
  }

  on(event, callback) { this.events.on(event, callback); return this; }
  emit(event, ...args) { this.events.emit(event, ...args); }

  refresh() {
    const width = this.wrapper.clientWidth;
    const height = this.wrapper.clientHeight;
    if (this.isSlide) {
      [...this.content.children].forEach((page) => {
        page.style.flex = `0 0 ${width}px`;
        page.style.width = `${width}px`;
      });
      if (this.loopRecycling) this.resetRecycledPages(width);
      this.content.style.display = "flex";
      const renderedPageCount = this.loopRecycling ? this.pageCount + 2 : this.content.children.length;
      this.content.style.width = `${renderedPageCount * width}px`;
    }
    // A slider's travel is defined by its pages, never by scrollWidth. Child
    // UI (the app-list search/input padding in particular) can overflow its
    // page and used to incorrectly add a horizontal "buffer" after page two.
    this.maxScrollX = this.isSlide
      ? -Math.max(0, (this.loopRecycling ? this.pageCount + 2 : this.content.children.length) - 1) * width
      : this.options.scrollX ? Math.min(0, width - Math.max(this.content.scrollWidth, this.content.offsetWidth)) : 0;
    this.maxScrollY = this.options.scrollY ? Math.min(0, height - Math.max(this.content.scrollHeight, this.content.offsetHeight)) : 0;
    if (this.isSlide) {
      const page = this.getCurrentPage().pageX;
      this.setPosition(-(page + (this.loopEnabled ? 1 : 0)) * width, 0, false);
    } else {
      this.setPosition(clamp(this.x, this.maxScrollX, 0), clamp(this.y, this.maxScrollY, 0), false);
    }
    this.updateScrollbar();
    return this;
  }

  createScrollbar() {
    if (getComputedStyle(this.wrapper).position === "static") this.wrapper.style.position = "relative";
    this.scrollbar = document.createElement("div");
    this.scrollbar.className = "bscroll-indicator";
    Object.assign(this.scrollbar.style, {
      position: "absolute", right: "3px", top: "2px", width: "3px", minHeight: "18px",
      borderRadius: "999px", opacity: "0", pointerEvents: "none", transition: "opacity 160ms",
    });
    this.wrapper.append(this.scrollbar);
  }

  updateScrollbar() {
    if (!this.scrollbar) return;
    const scrollable = -this.maxScrollY;
    if (!scrollable) {
      this.scrollbar.style.opacity = "0";
      return;
    }
    const height = this.wrapper.clientHeight;
    const thumbHeight = Math.max(18, height * height / (height + scrollable));
    const progress = clamp(-this.y / scrollable, 0, 1);
    this.scrollbar.style.height = `${thumbHeight}px`;
    this.scrollbar.style.transform = `translateY(${progress * (height - thumbHeight)}px)`;
    this.scrollbar.style.opacity = "1";
    clearTimeout(this.scrollbarHideTimeout);
    this.scrollbarHideTimeout = setTimeout(() => { this.scrollbar.style.opacity = "0"; }, 500);
  }

  enable() {
    if (this.enableGuard && !this.enableGuard()) {
      this.disable();
      return this;
    }
    this.enabled = true;
    this.wrapper.classList.remove("flow-scroll-disabled");
    return this;
  }
  disable() {
    this.enabled = false;
    this.wrapper.classList.add("flow-scroll-disabled");
    this.cancelAnimation();
    return this;
  }
  cancelScroll() { this.disable(); window.addEventListener("pointerup", () => this.enable(), { once: true }); }
  destroy() { this.cancelAnimation(); delete this.content.DiscoScroll; delete this.wrapper.DiscoScroll; }

  getCurrentPage() {
    const width = this.wrapper.clientWidth || 1;
    let pageX = Math.round(-this.x / width);
    if (this.loopEnabled) {
      pageX = ((pageX - 1) % this.pageCount + this.pageCount) % this.pageCount;
    } else {
      pageX = clamp(pageX, 0, Math.max(0, this.pageCount - 1));
    }
    return { pageX, pageY: 0 };
  }

  goToPage(pageX, pageY = 0, time = this.options.slide?.speed ?? 400) {
    if (!this.pageCount) return this;
    const requestedPage = Math.round(pageX);
    const page = this.loopEnabled
      ? ((requestedPage % this.pageCount) + this.pageCount) % this.pageCount
      : clamp(requestedPage, 0, this.pageCount - 1);
    let rawPage = page + (this.loopEnabled ? 1 : 0);

    if (this.loopEnabled) {
      const candidates = [rawPage];
      if (page === 0) candidates.push(this.pageCount + 1);
      if (page === this.pageCount - 1) candidates.push(0);
      const currentRawPage = -this.x / (this.wrapper.clientWidth || 1);
      rawPage = candidates.reduce((nearest, candidate) =>
        Math.abs(candidate - currentRawPage) < Math.abs(nearest - currentRawPage) ? candidate : nearest
      );
    }

    if (this.loopRecycling) this.prepareRecycledPage(rawPage);
    return this.scrollTo(-rawPage * this.wrapper.clientWidth, 0, time);
  }

  snapToNearestPage(time = this.options.slide?.speed ?? 400) {
    return this.goToPage(this.getCurrentPage().pageX, 0, time);
  }

  scrollTo(x = this.x, y = this.y, time = 0) {
    this.cancelAnimation();
    const targetX = this.options.scrollX ? clamp(x, this.maxScrollX, 0) : 0;
    const targetY = this.options.scrollY ? clamp(y, this.maxScrollY, 0) : 0;
    if (this.isSlide && this.loopRecycling) {
      this.prepareRecycledPage(-targetX / (this.wrapper.clientWidth || 1));
    }
    return this.animateTo(targetX, targetY, time);
  }

  moveTo(x = this.x, y = this.y) {
    this.cancelAnimation();
    const targetX = this.options.scrollX ? clamp(x, this.maxScrollX, 0) : 0;
    const targetY = this.options.scrollY ? clamp(y, this.maxScrollY, 0) : 0;
    if (this.isSlide && this.loopRecycling) {
      this.prepareRecycledPage(-targetX / (this.wrapper.clientWidth || 1));
    }
    this.setPosition(targetX, targetY);
    return this;
  }

  animateTo(targetX, targetY, time = 0, onComplete = null) {
    this.cancelAnimation();
    if (!time) {
      this.setPosition(targetX, targetY);
      if (onComplete) onComplete();
      else {
        this.finishSlideLoop();
        this.emit("scrollEnd", this.point());
      }
      return this;
    }
    const from = this.point();
    const startedAt = now();
    this.animationTarget = { x: targetX, y: targetY };
    this.animaterHooks.emit("time", time);
    const tick = () => {
      const progress = clamp((now() - startedAt) / time, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      this.setPosition(from.x + (targetX - from.x) * eased, from.y + (targetY - from.y) * eased);
      if (progress < 1) this.animationFrame = requestAnimationFrame(tick);
      else {
        this.animationFrame = null;
        this.animationTarget = null;
        if (onComplete) onComplete();
        else {
          this.finishSlideLoop();
          this.emit("scrollEnd", this.point());
        }
      }
    };
    this.animationFrame = requestAnimationFrame(tick);
    return this;
  }

  onPointerDown(event) {
    if (!this.enabled || event.button !== 0) return;
    this.finishPendingSlide();
    this.cancelAnimation();
    this.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollX: this.x,
      startScrollY: this.y,
      startedAt: now(),
      lastMoveAt: now(),
      lastMoveX: event.clientX,
      lastMoveY: event.clientY,
      velocityX: 0,
      velocityY: 0,
      moved: false,
      axis: null,
      scrollStarted: false,
    };
    this.emit("beforeScrollStart", this.point());
  }

  onPointerMove(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id || !this.enabled) return;
    const dx = event.clientX - this.pointer.startX;
    const dy = event.clientY - this.pointer.startY;
    const movedAt = now();
    const elapsed = Math.max(1, movedAt - this.pointer.lastMoveAt);
    // A weighted recent velocity is much more representative of a flick than
    // total gesture distance divided by its whole duration.
    this.pointer.velocityX = this.pointer.velocityX * 0.25 + ((event.clientX - this.pointer.lastMoveX) / elapsed) * 0.75;
    this.pointer.velocityY = this.pointer.velocityY * 0.25 + ((event.clientY - this.pointer.lastMoveY) / elapsed) * 0.75;
    this.pointer.lastMoveAt = movedAt;
    this.pointer.lastMoveX = event.clientX;
    this.pointer.lastMoveY = event.clientY;
    if (Math.hypot(dx, dy) > DRAG_START_DISTANCE) {
      this.pointer.moved = true;
      // Nested scrollers all receive the same pointer events. Locking to the
      // initial dominant axis prevents a vertical list gesture from moving the
      // horizontal home/app slider (and vice versa).
      this.pointer.axis ||= Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (!this.ownsPointerAxis()) return;
    if (!this.pointer.scrollStarted) {
      this.pointer.scrollStarted = true;
      this.emit("scrollStart", this.point());
      this.scrollerHooks.emit("scrollStart", this.point());
    }
    const x = this.options.scrollX ? this.dampen(this.pointer.startScrollX + dx, this.maxScrollX) : 0;
    const y = this.options.scrollY ? this.dampen(this.pointer.startScrollY + dy, this.maxScrollY) : 0;
    if (this.pointer.moved) event.preventDefault();
    if (this.isSlide && this.loopRecycling) {
      this.prepareRecycledPage(-x / (this.wrapper.clientWidth || 1));
    }
    this.queuePosition(x, y);
  }

  onPointerUp(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    const pointer = this.pointer;
    this.pointer = null;
    this.flushPosition();
    const velocity = this.options.scrollX ? pointer.velocityX : pointer.velocityY;
    const ownsAxis = this.ownsPointerAxis(pointer);
    const wasFlick = ownsAxis && pointer.moved && Math.abs(velocity) > 0.45;
    if (wasFlick) this.emit("flick", this.point());
    this.emit("touchEnd", this.point());
    if (!ownsAxis) {
      if (this.isSlide && pointer.moved) this.snapToNearestPage();
      return;
    }
    if (this.isSlide) {
      const width = this.wrapper.clientWidth || 1;
      let startPage = Math.round(-pointer.startScrollX / width);
      if (this.loopEnabled) {
        startPage = ((startPage - 1) % this.pageCount + this.pageCount) % this.pageCount;
      } else {
        startPage = clamp(startPage, 0, Math.max(0, this.pageCount - 1));
      }
      const page = wasFlick
        ? startPage + (velocity < 0 ? 1 : -1)
        : this.getCurrentPage().pageX;
      this.goToPage(page);
      return;
    }
    const outOfBounds = this.x > 0 || this.x < this.maxScrollX || this.y > 0 || this.y < this.maxScrollY;
    const momentumDistance = this.options.momentum && pointer.moved ? this.momentumDistance(velocity) : 0;
    const projectedX = this.x + (this.options.scrollX ? momentumDistance : 0);
    const projectedY = this.y + (this.options.scrollY ? momentumDistance : 0);
    const targetX = clamp(projectedX, this.maxScrollX, 0);
    const targetY = clamp(projectedY, this.maxScrollY, 0);
    const duration = outOfBounds
      ? this.options.bounceTime
      : Math.abs(momentumDistance) > 12 ? clamp(Math.abs(velocity) / 0.003, 140, 650) : 0;
    const hitsBoundary = !outOfBounds && this.options.bounce !== false && (projectedX !== targetX || projectedY !== targetY);
    if (hitsBoundary) {
      const overscrollX = this.momentumOverscroll(projectedX, this.maxScrollX);
      const overscrollY = this.momentumOverscroll(projectedY, this.maxScrollY);
      const projectedDistance = Math.max(Math.abs(projectedX - this.x), Math.abs(projectedY - this.y), 1);
      const boundaryDistance = Math.max(Math.abs(targetX - this.x), Math.abs(targetY - this.y));
      const boundaryDuration = clamp(duration * boundaryDistance / projectedDistance, 40, duration);
      // Keep the compression as a brief impact instead of spreading it over
      // the complete momentum animation. This makes the edge feel solid.
      return this.animateTo(targetX, targetY, boundaryDuration, () => {
        this.animateTo(overscrollX, overscrollY, 60, () => {
          this.scrollTo(targetX, targetY, this.options.bounceTime);
        });
      });
    }
    this.scrollTo(targetX, targetY, duration);
  }

  onWheel(event) {
    if (!this.enabled) return;
    const useX = this.options.scrollX && !this.options.scrollY;
    const delta = useX ? event.deltaX || event.deltaY : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    this.cancelAnimation();
    this.emit("scrollStart", this.point());
    this.scrollerHooks.emit("scrollStart", this.point());
    this.setPosition(useX ? clamp(this.x - delta, this.maxScrollX, 0) : this.x, useX ? this.y : clamp(this.y - delta, this.maxScrollY, 0));
    clearTimeout(this.wheelEndTimeout);
    this.wheelEndTimeout = setTimeout(() => this.emit("scrollEnd", this.point()), 80);
  }

  dampen(value, min) {
    if (this.options.bounce === false) return clamp(value, min, 0);
    // Scale and translation must reach their limit together. Otherwise the
    // content keeps travelling after its visual compression has stopped.
    if (value > 0) return Math.min(MAX_OVERSCROLL_DISTANCE, value * 0.42);
    if (value < min) return Math.max(min - MAX_OVERSCROLL_DISTANCE, min + (value - min) * 0.42);
    return value;
  }

  momentumDistance(velocity) {
    const speed = Math.min(Math.abs(velocity), 3.2);
    if (speed < 0.12) return 0;
    // d = v² / 2a, capped so an accidental fast sample cannot launch a list.
    return Math.sign(velocity) * Math.min(900, speed * speed / (2 * 0.003));
  }

  momentumOverscroll(projected, min) {
    if (projected > 0) return Math.min(MAX_OVERSCROLL_DISTANCE, projected * 0.18 + 8);
    if (projected < min) return min - Math.min(MAX_OVERSCROLL_DISTANCE, (min - projected) * 0.18 + 8);
    return projected;
  }

  ownsPointerAxis(pointer = this.pointer) {
    if (!pointer?.axis) return false;
    return (pointer.axis === "x" && this.options.scrollX) || (pointer.axis === "y" && this.options.scrollY);
  }

  point() { return { x: this.x, y: this.y }; }

  setPosition(x, y, emit = true) {
    this.x = x;
    this.y = y;
    const point = this.point();
    this.translaterHooks.emit("beforeTranslate", point, point);
    const scale = this.overscrollScale();
    // Keep physics at sub-pixel precision, but rasterize the moving content
    // on physical CSS pixels. Fractional translations make text and small
    // icons continually re-rasterize on some Android WebViews.
    const visualX = Math.round(x);
    const visualY = Math.round(y);
    this.content.style.transformOrigin = scale.origin;
    this.content.style.transform = `translate3d(${visualX}px, ${visualY}px, 0) scale(${scale.x}, ${scale.y})`;
    this.updateScrollbar();
    this.translaterHooks.emit("translate", point);
    if (emit) this.emit("scroll", point);
  }

  queuePosition(x, y) {
    this.pendingPosition = { x, y };
    if (this.positionFrame) return;
    this.positionFrame = requestAnimationFrame(() => this.flushPosition());
  }

  flushPosition() {
    if (this.positionFrame) cancelAnimationFrame(this.positionFrame);
    this.positionFrame = null;
    if (!this.pendingPosition) return;
    const { x, y } = this.pendingPosition;
    this.pendingPosition = null;
    this.setPosition(x, y);
  }

  overscrollScale() {
    const distanceX = this.x > 0 ? this.x : this.x < this.maxScrollX ? this.maxScrollX - this.x : 0;
    const distanceY = this.y > 0 ? this.y : this.y < this.maxScrollY ? this.maxScrollY - this.y : 0;
    const factor = (distance) => 1 - Math.min(MAX_OVERSCROLL_DISTANCE, distance) * (1 - 58 / 62) / MAX_OVERSCROLL_DISTANCE;
    const originX = this.x > 0 ? "0%" : this.x < this.maxScrollX ? "100%" : "50%";
    const originY = this.y > 0 ? "0%" : this.y < this.maxScrollY ? "100%" : "50%";
    return { x: factor(distanceX), y: factor(distanceY), origin: `${originX} ${originY}` };
  }

  finishSlideLoop() {
    if (!this.isSlide) return;
    if (this.loopEnabled) {
      const width = this.wrapper.clientWidth;
      const rawPosition = -this.x / width;
      const rawPage = Math.round(rawPosition);
      if (Math.abs(rawPosition - rawPage) < 0.001) {
        if (this.loopRecycling) this.resetRecycledPages(width);
        if (rawPage === 0) this.setPosition(-this.pageCount * width, 0, false);
        if (rawPage === this.pageCount + 1) this.setPosition(-width, 0, false);
      }
    }
    this.emit("slideWillChange", { x: this.x, y: this.y, ...this.getCurrentPage() });
  }

  resetRecycledPages(width = this.wrapper.clientWidth) {
    if (!this.loopRecycling) return;
    [...this.content.children].forEach((page) => {
      page.style.position = "relative";
      page.style.left = `${width}px`;
    });
  }

  prepareRecycledPage(rawPage) {
    if (!this.loopRecycling) return;
    const width = this.wrapper.clientWidth;
    this.resetRecycledPages(width);
    if (rawPage < 1) {
      this.content.lastElementChild.style.left = `${-(this.pageCount - 1) * width}px`;
    } else if (rawPage > this.pageCount) {
      this.content.firstElementChild.style.left = `${(this.pageCount + 1) * width}px`;
    }
  }

  finishPendingSlide() {
    if (!this.isSlide || !this.animationFrame || !this.animationTarget) return false;
    const target = this.animationTarget;
    this.cancelAnimation();
    this.setPosition(target.x, target.y);
    this.finishSlideLoop();
    this.emit("scrollEnd", this.point());
    return true;
  }

  cancelAnimation() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.animationTarget = null;
  }
}

function DiscoScroll(selector, options = {}) { return new DiscoScroller(selector, options); }
function DiscoSlide(selector, options = {}) { return new DiscoScroller(selector, options, { slide: true }); }

// Compatibility export for internal apps which import it directly.
function applyOverscroll(scroller) { return scroller; }

export { DiscoScroll, DiscoSlide, applyOverscroll };
export default applyOverscroll;
