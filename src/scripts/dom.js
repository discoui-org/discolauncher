const eventListeners = new WeakMap();
const unitlessProperties = new Set([
  "animationIterationCount", "columnCount", "fillOpacity", "flexGrow", "flexShrink",
  "fontWeight", "lineHeight", "opacity", "order", "orphans", "widows", "zIndex", "zoom",
]);

function toCssProperty(property) {
  return property.startsWith("--") ? property : property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

function setStyle(element, property, value) {
  if (!(element instanceof Element)) return;
  const cssProperty = toCssProperty(property);
  const cssValue = typeof value === "number" && !property.startsWith("--") && !unitlessProperties.has(property)
    ? `${value}px`
    : String(value);
  element.style.setProperty(cssProperty, cssValue);
}

function createElement(markup, attributes = {}) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const element = template.content.firstElementChild;
  if (!element) return null;

  Object.entries(attributes).forEach(([name, value]) => {
    if (name === "class") element.className = value;
    else if (name === "text") element.textContent = value;
    else if (name === "html") element.innerHTML = value;
    else if (name in element) element[name] = value;
    else element.setAttribute(name, value);
  });
  return element;
}

function normalizeNodes(value, attributes) {
  if (typeof value === "string") {
    return value.trim().startsWith("<") ? [createElement(value, attributes)].filter(Boolean) : [...document.querySelectorAll(value)];
  }
  if (value instanceof DomCollection) return [...value];
  if (value instanceof Node || value === window) return [value];
  if (value && typeof value.length === "number") return [...value].filter(Boolean);
  return value ? [value] : [];
}

export class DomCollection extends Array {
  static get [Symbol.species]() {
    return Array;
  }

  constructor(nodes = []) {
    super(...nodes);
  }

  each(callback) {
    this.forEach((element, index) => callback.call(element, index, element));
    return this;
  }

  on(events, callback) {
    events.split(/\s+/).filter(Boolean).forEach(eventName => {
      this.forEach(element => {
        if (!element?.addEventListener) return;
        element.addEventListener(eventName, callback);
        const listeners = eventListeners.get(element) || [];
        listeners.push({ eventName, callback });
        eventListeners.set(element, listeners);
      });
    });
    return this;
  }

  off(events, callback) {
    const names = events ? events.split(/\s+/).filter(Boolean) : null;
    this.forEach(element => {
      const listeners = eventListeners.get(element) || [];
      const retained = listeners.filter(listener => {
        const matches = (!names || names.includes(listener.eventName)) && (!callback || callback === listener.callback);
        if (matches) element.removeEventListener(listener.eventName, listener.callback);
        return !matches;
      });
      eventListeners.set(element, retained);
    });
    return this;
  }

  trigger(eventName, detail) {
    this.forEach(element => element.dispatchEvent(new CustomEvent(eventName, { bubbles: true, detail })));
    return this;
  }

  addClass(classNames) {
    const names = classNames.split(/\s+/).filter(Boolean);
    return this.each((_, element) => element.classList?.add(...names));
  }

  removeClass(classNames) {
    const names = classNames.split(/\s+/).filter(Boolean);
    return this.each((_, element) => element.classList?.remove(...names));
  }

  toggleClass(className, force) {
    return this.each((_, element) => element.classList?.toggle(className, force));
  }

  hasClass(className) {
    return this.some(element => element.classList?.contains(className));
  }

  css(property, value) {
    if (typeof property === "string" && value === undefined) {
      const element = this[0];
      return element instanceof Element ? getComputedStyle(element).getPropertyValue(toCssProperty(property)) : undefined;
    }
    const styles = typeof property === "object" ? property : { [property]: value };
    return this.each((_, element) => Object.entries(styles).forEach(([name, styleValue]) => setStyle(element, name, styleValue)));
  }

  append(content) {
    return this.each((_, element) => {
      if (!(element instanceof Element)) return;
      if (typeof content === "string") element.insertAdjacentHTML("beforeend", content);
      else if (content instanceof DomCollection) content.forEach(node => element.append(node));
      else if (content instanceof Node) element.append(content);
    });
  }

  remove() {
    return this.each((_, element) => element.remove?.());
  }

  eq(index) {
    const normalized = index < 0 ? this.length + index : index;
    return new DomCollection(this[normalized] ? [this[normalized]] : []);
  }

  last() {
    return this.eq(-1);
  }

  not(selector) {
    return new DomCollection(this.filter(element => !element.matches?.(selector)));
  }

  parent() {
    return new DomCollection([...new Set(this.map(element => element.parentElement).filter(Boolean))]);
  }

  children(selector) {
    const children = this.flatMap(element => [...(element.children || [])]);
    return new DomCollection(selector ? children.filter(element => element.matches(selector)) : children);
  }

  find(selector) {
    return new DomCollection(this.flatMap(element => [...(element.querySelectorAll?.(selector) || [])]));
  }

  index() {
    const element = this[0];
    return element?.parentElement ? [...element.parentElement.children].indexOf(element) : -1;
  }

  position() {
    const element = this[0];
    return element ? { top: element.offsetTop, left: element.offsetLeft } : undefined;
  }

  attr(name, value) {
    if (value === undefined) return this[0]?.getAttribute?.(name);
    return this.each((_, element) => element.setAttribute?.(name, value));
  }

  removeAttr(name) {
    return this.each((_, element) => element.removeAttribute?.(name));
  }

  val(value) {
    if (value === undefined) return this[0]?.value;
    return this.each((_, element) => { element.value = value; });
  }

  text(value) {
    if (value === undefined) return this[0]?.textContent;
    return this.each((_, element) => { element.textContent = value; });
  }

  focus() {
    return this.each((_, element) => element.focus?.());
  }

  blur() {
    return this.each((_, element) => element.blur?.());
  }

  animate(properties, options = {}) {
    const duration = typeof options === "number" ? options : options.duration || 400;
    return this.each((_, target) => {
      const initial = Object.fromEntries(Object.keys(properties).map(name => [name, Number(target[name]) || 0]));
      const startedAt = performance.now();
      const update = now => {
        const progress = Math.min(1, (now - startedAt) / duration);
        Object.entries(properties).forEach(([name, end]) => { target[name] = initial[name] + (end - initial[name]) * progress; });
        if (typeof options.step === "function") options.step.call(target);
        if (progress < 1) requestAnimationFrame(update);
        else if (typeof options.complete === "function") options.complete.call(target);
      };
      requestAnimationFrame(update);
    });
  }
}

export default function $(value, attributes) {
  return new DomCollection(normalizeNodes(value, attributes));
}
