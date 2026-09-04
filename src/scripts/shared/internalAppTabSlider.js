import { DiscoSlide } from "../overscrollFramework.js";

const modulo = (value, length) => ((value % length) + length) % length;

function indexInternalAppListItems(root = document) {
  root.querySelectorAll("div.disco-list-view").forEach((listView) => {
    let index = 0;
    listView.querySelectorAll("div.disco-list-view-item:not(.hidden)").forEach((item) => {
      item.style.setProperty("--index", index);
      index += 1;
    });
  });
}

function createInternalAppTabSlider({
  root = document,
  pagesSelector = "#settings-pages",
  tabsSelector = "div.innerApp div.app-tabs",
  pageItemsSelector = "#settings-pages > div.settings-pages-container > div.settings-page",
  swipeThreshold = 100,
  slideOptions = {},
  onPageChange = () => {},
  isAnimationBlocked = () => Boolean(window.animPlaying),
} = {}) {
  const pagesElement = root.querySelector(pagesSelector);
  const tabsElement = root.querySelector(tabsSelector);
  if (!pagesElement || !tabsElement) {
    throw new Error("Internal app tab slider requires pages and tabs elements.");
  }

  const tabs = Array.from(tabsElement.children).filter((element) => element.tagName === "P");
  const pages = Array.from(root.querySelectorAll(pageItemsSelector));
  if (!tabs.length || tabs.length !== pages.length) {
    throw new Error(`Internal app tab/page count mismatch: ${tabs.length}/${pages.length}`);
  }

  indexInternalAppListItems(root);

  const slideThreshold = slideOptions.slide?.threshold ?? swipeThreshold;

  const slider = new DiscoSlide(pagesElement, {
    ...slideOptions,
    slide: {
      loop: true,
      speed: 400,
      ...slideOptions.slide,
      threshold: slideThreshold,
    },
  });
  const scrollWidth = () => pagesElement.clientWidth || Math.min(window.innerWidth, 768);
  const virtualPageOffset = () => slider.loopEnabled ? 1 : 0;
  const pagePosition = () => -slider.x / scrollWidth() - virtualPageOffset();
  const normalizePage = (index) => modulo(index, pages.length);

  let scrollStartPageIndex = 0;
  let scrollStartX = 0;
  let flickHandled = false;

  function activatePage(index = 0, next = true, scroll = 0) {
    const pageIndex = normalizePage(index);
    tabs.forEach((tab) => tab.classList.remove("active-tab"));
    tabs[pageIndex].classList.add("active-tab");
    pages.forEach((page) => page.classList.remove("active-page"));
    pages[pageIndex].style.setProperty("--page-swipe-translate", `${next ? scroll : -scroll}px`);
    pages[pageIndex].style.setProperty("--page-swipe-direction", next ? 1 : -1);
    pages[pageIndex].classList.add("active-page");
    onPageChange(pageIndex, { next, scroll, slider });
  }

  function activateDraggedPage() {
    const currentX = pagePosition();
    const next = currentX > scrollStartX;
    const index = scrollStartPageIndex + (next ? 1 : -1);
    const scroll = Math.abs(scrollStartX - currentX) * scrollWidth() * 2;
    activatePage(index, next, scroll);
  }

  slider.on("beforeScrollStart", () => {
    scrollStartX = pagePosition();
    scrollStartPageIndex = Math.round(scrollStartX);
    flickHandled = false;
  });
  slider.on("flick", () => {
    flickHandled = true;
    activateDraggedPage();
  });
  slider.on("touchEnd", () => {
    const distance = Math.abs(scrollStartX - pagePosition()) * scrollWidth();
    if (!flickHandled && distance > slideThreshold) activateDraggedPage();
  });

  let tabPointer = null;
  tabsElement.addEventListener("pointerdown", (event) => {
    slider.finishPendingSlide();
    tabPointer = {
      startX: event.x,
      startY: event.y,
      lastX: event.x,
      lastY: event.y,
      startScrollX: slider.x,
    };
  });
  tabsElement.addEventListener("pointermove", (event) => {
    if (!tabPointer) return;
    tabPointer.lastX = event.x;
    tabPointer.lastY = event.y;
    slider.moveTo(tabPointer.startScrollX + tabPointer.lastX - tabPointer.startX, 0);
  });
  window.addEventListener("pointerup", (event) => {
    if (!tabPointer) return;
    const distance = Math.hypot(tabPointer.startX - tabPointer.lastX, tabPointer.startY - tabPointer.lastY);
    if (distance <= 10) {
      if (tabs.includes(event.target)) {
        const index = tabs.indexOf(event.target);
        slider.goToPage(index, 0);
        activatePage(index, true, 0);
      } else {
        slider.snapToNearestPage();
      }
    } else {
      const targetX = tabPointer.startScrollX + tabPointer.lastX - tabPointer.startX;
      const page = normalizePage(Math.round(-targetX / scrollWidth() - virtualPageOffset()));
      slider.goToPage(page, 0);
      activatePage(page, true, 0);
    }
    tabPointer = null;
  });
  window.addEventListener("pointercancel", () => {
    if (!tabPointer) return;
    const page = slider.getCurrentPage().pageX;
    slider.goToPage(page, 0);
    activatePage(page, true, 0);
    tabPointer = null;
  });

  let lastTitleX = Number.NaN;
  let titleAnimationFrame = null;
  function updateTabTitles() {
    const roundedX = Math.round(slider.x);
    if (roundedX === lastTitleX || isAnimationBlocked()) return;

    const tabWidths = tabs.map((tab) => tab.offsetWidth + 25);
    const totalWidth = tabWidths.reduce((sum, width) => sum + width, 0);
    const scroll = modulo(-roundedX / scrollWidth() - virtualPageOffset(), tabs.length);
    const fullPages = Math.floor(scroll);
    const transform = tabWidths.slice(0, fullPages).reduce((sum, width) => sum + width, 0)
      + tabWidths[fullPages] * (scroll % 1);

    tabs.forEach((tab, index) => {
      const extra = scroll >= index + 1 ? totalWidth : 0;
      tab.style.transform = `translateX(${-transform + extra}px)`;
      const title = tab.innerText;
      if (`"${title}"` !== tab.style.getPropertyValue("--ats-title")) {
        tab.style.setProperty("--ats-title", `"${title}"`);
      }
      const titleLeft = totalWidth - tab.offsetWidth;
      if (`${titleLeft}px` !== tab.style.getPropertyValue("--ats-title-left")) {
        tab.style.setProperty("--ats-title-left", `${titleLeft}px`);
      }
    });
    lastTitleX = roundedX;
  }

  function activeTabScroll() {
    if (titleAnimationFrame !== null) return;
    const frame = () => {
      titleAnimationFrame = null;
      if (document.body.classList.contains("soft-exit") || document.body.classList.contains("soft-exit-home")) return;
      updateTabTitles();
      titleAnimationFrame = requestAnimationFrame(frame);
    };
    frame();
  }

  window.bs = slider;
  window.allPages = pages;
  window.scrollWidth = scrollWidth;
  window.activeTabScroll = activeTabScroll;

  return { slider, pages, tabs, activatePage, activeTabScroll, scrollWidth };
}

export { createInternalAppTabSlider, indexInternalAppListItems };
export default createInternalAppTabSlider;
