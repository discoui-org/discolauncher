import $ from "../dom";
import DiscoBoard from "../DiscoBoard";
import DiscoElements from "../DiscoElements";
import perlin from "../perlin";
import DiscoTileGrid from "../DiscoTileGrid";
const tileListInnerContainer = document.querySelector(
  "div.tile-list-inner-container"
);
Math.pow2 = (x, y) => {
  return Math.pow(Math.abs(x), y) * (x > 0 ? 1 : -1)
}
const grid = new DiscoTileGrid(tileListInnerContainer, { column: 4 });
var isDragging
grid.on("dragstart", function (event, el) {
  scrollers.tile_page_scroller.cancelScroll()
  isDragging = true
});
grid.on('relocate', function () {
  Disco.triggerHapticFeedback("CLOCK_TICK")
});
grid.on('change', function (event, items) {
});
grid.on("dragstop", function (event, el) {
  setTimeout(() => {
    DiscoBoard.backendMethods.homeConfiguration.save()
  }, 500);
  isDragging = false
  //$("div.disco-home-tile.grid-dragging").removeClass("grid-dragging").css("transition", "")
});
window.tileListGrid = grid;
var homeTileEditEnabled = false;
function hashStringToNumber(str, max) {
  try {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to a 32-bit integer
    }
    // Ensure the hash is positive
    hash = Math.abs(hash);
    // Map to a range between 0 and 500
    return hash % (max || 100);
  } catch (error) {
    return 0
  }
}
const homeTileEditSwitch = {
  isActive: () => homeTileEditEnabled,
  on: (immediate = false, callback = () => { }) => {
    closeOpenFolder({ immediate: true });
    clearTimeout(window.homeTileEditTimeout)
    window.homeTileEditTimeout = setTimeout(() => { homeTileEditSwitch.off() }, 30000);
    DiscoBoard.backendMethods.navigation.push(
      "homeTileMenuOn",
      () => { },
      homeTileEditSwitch.off
    );
    scrollers.main_home_scroller.enabled = false;
    homeTileEditEnabled = true;
    tileListGrid.enableMove(true);
    $("div.disco-home-tile").removeClass("home-menu-selected");
    $("div.tile-list-page").addClass("home-menu-back-intro");
    if (immediate) {
      $("div.tile-list-page")
        .addClass("home-menu-back")
        .removeClass("home-menu-back-intro");
      if (callback && typeof callback == "function") callback();
      shakeDistanceModifier.on();
    } else {
      window.homeTileMenuCreationSecondTimeout = setTimeout(() => {
        $("div.tile-list-page")
          .addClass("home-menu-back")
          .removeClass("home-menu-back-intro");
        if (callback && typeof callback == "function") callback();
        shakeDistanceModifier.on();
        Disco.triggerHapticFeedback("CONFIRM")
      }, 500);
    }
    perlin.seed()
    const homeTileEditShakeStart = Date.now()
    window.homeTileEditShake = setInterval(() => {

      tileListGrid.engine.nodes.forEach(e => {
        const packageName = e.el.getAttribute("packagename")
        const distance = (Date.now() - homeTileEditShakeStart) / (2000 + hashStringToNumber(packageName, 1000))
        const hash = hashStringToNumber(e.el.getAttribute("packagename"), 500)
        e.el.style.setProperty("--shake-x",
          Math.round(perlin.get(distance, hash) * 1.5
            * 10 * devicePixelRatio
          ) / devicePixelRatio + "px")
        e.el.style.setProperty("--shake-y",
          Math.round(perlin.get(distance, hash + 1000) * 1.5
            * 10 * devicePixelRatio
          ) / devicePixelRatio + "px")
      })

    }, 0);
  },
  off: (immediate) => {
    clearTimeout(window.homeTileEditTimeout)
    clearInterval(window.homeTileEditShake)

    DiscoBoard.backendMethods.navigation.invalidate("homeTileMenuOn");
    shakeDistanceModifier.off();
    $("div.disco-home-tile").removeClass("home-menu-selected");

    $("div.tile-list-page").addClass("home-menu-back-outro");
    scrollers.main_home_scroller.enabled = true;
    homeTileEditEnabled = false;
    tileListGrid.enableMove(false);
    clearTimeout(window.homeTileMenuCreationFirstTimeout);
    clearTimeout(window.homeTileMenuCreationSecondTimeout);
    $("div.disco-home-menu").remove();

    $("div.tile-list-page").removeClass("home-menu-back home-menu-back-intro");
    window.homeTileMenuDestroyTimeout = setTimeout(() => {
      homeTileMenuClean();
      $("div.tile-list-page").removeClass("home-menu-back-outro");
    }, 500);
  },
};
const shakeDistanceModifier = {
  on: () => {
    $({ someValue: 0 }).animate(
      { someValue: 5 },
      {
        duration: 200,
        step: function () {
          $("body").css("--shake-distance", this.someValue / 1.5 + "px");
          $("body").css(
            "--shake-scale-distance",
            (1 - this.someValue / 5) * 0.05 + 0.95
          );
        },
      }
    );
  },
  off: () => {
    $({ someValue: 5 }).animate(
      { someValue: 0 },
      {
        duration: 100,
        step: function () {
          $("body").css("--shake-distance", this.someValue / 1.5 + "px");
          $("body").css(
            "--shake-scale-distance",
            (1 - this.someValue / 5) * 0.05 + 0.95
          );
        },
      }
    );
  },
};

window.homeTileEditSwitch = homeTileEditSwitch;

function resolveHomeTileTarget(target) {
  return target.closest?.("div.disco-home-tile") || target;
}

function isLaunchableHomeTile(tile) {
  return tile.classList.contains("disco-home-tile")
    && !tile.classList.contains("disco-home-folder-tile");
}

function isEditableHomeTile(tile) {
  return tile.classList.contains("disco-home-tile")
    && !tile.classList.contains("disco-folder-open-item");
}

let openFolderState = null;
let folderOpenVersion = 0;
const FOLDER_OPEN_STEP = 18;
const FOLDER_OPEN_DELAY = 60;
const FOLDER_OPEN_DURATION = 340;

function getFolderChildren(folder) {
  if (Array.isArray(folder.folderChildren)) return folder.folderChildren;
  try {
    return JSON.parse(folder.dataset.folderChildren || "[]");
  } catch {
    return [];
  }
}

function layoutFolderChildren(children, columns) {
  const occupied = new Set();
  const placements = [];
  const fits = (x, y, width, height) => {
    if (x + width > columns) return false;
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        if (occupied.has(`${column}:${row}`)) return false;
      }
    }
    return true;
  };

  children.forEach(child => {
    const width = Math.max(1, Math.min(Number(child.w) || 1, columns));
    const height = Math.max(1, Number(child.h) || 1);
    let x = 0;
    let y = 0;
    let placed = false;

    while (!placed) {
      for (x = 0; x <= columns - width; x += 1) {
        if (!fits(x, y, width, height)) continue;
        placed = true;
        break;
      }
      if (!placed) y += 1;
    }

    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        occupied.add(`${column}:${row}`);
      }
    }
    placements.push({ child, x, y, w: width, h: height });
  });

  return placements;
}

function setFolderThumbnailOrder(folder) {
  const matrix = folder.querySelector(":scope > .disco-folder-matrix");
  if (!matrix) return;
  const columns = Number.parseInt(matrix.style.getPropertyValue("--folder-grid-columns"), 10) || 2;
  const entries = [...matrix.children]
    .map((cell, index) => ({
      thumbnail: cell.querySelector(":scope > .disco-folder-thumbnail"),
      x: index % columns,
      y: Math.floor(index / columns)
    }))
    .filter(entry => entry.thumbnail && !entry.thumbnail.closest("[hidden]"));
  const maxY = Math.max(0, ...entries.map(entry => entry.y));

  entries
    .sort((first, second) =>
      (first.x + maxY - first.y) - (second.x + maxY - second.y)
      || second.y - first.y
      || first.x - second.x)
    .forEach((entry, index) => {
      entry.thumbnail.style.setProperty("--folder-thumbnail-order", index);
    });
}

function createFolderOpenPanel(folder) {
  const node = folder.gridstackNode;
  const cell = tileListGrid.el.clientWidth / tileListGrid.getColumn();
  const children = getFolderChildren(folder);
  const placements = layoutFolderChildren(children, tileListGrid.getColumn());
  const rowCount = placements.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  const panel = document.createElement("div");
  const topBar = document.createElement("div");
  const content = document.createElement("div");
  const bottomBar = document.createElement("div");

  panel.className = "disco-folder-open-panel folder-open-preparing";
  topBar.className = "disco-folder-open-bar disco-folder-open-bar-top";
  content.className = "disco-folder-open-content";
  bottomBar.className = "disco-folder-open-bar disco-folder-open-bar-bottom";
  panel.style.top = `${(node.y + node.h) * cell}px`;
  content.style.height = `${rowCount * cell}px`;
  bottomBar.style.setProperty("--folder-open-order", 0);

  placements.forEach(placement => {
    const { child, x, y, w, h } = placement;
    const tile = DiscoElements.wHomeTile(child.i, child.ib, child.t, child.p, "", child.s);
    tile.classList.add("disco-folder-open-item");
    tile.setAttribute("gs-x", x);
    tile.setAttribute("gs-y", y);
    tile.setAttribute("gs-w", w);
    tile.setAttribute("gs-h", h);
    tile.style.left = `${x * cell}px`;
    tile.style.top = `${y * cell}px`;
    tile.style.width = `${w * cell}px`;
    tile.style.height = `${h * cell}px`;
    content.append(tile);
    placement.el = tile;
  });

  const maxY = Math.max(0, ...placements.map(item => item.y));
  const orderedPlacements = [...placements]
    .sort((first, second) =>
      (first.x + maxY - first.y) - (second.x + maxY - second.y)
      || second.y - first.y
      || first.x - second.x);
  orderedPlacements.forEach((placement, index) => {
    placement.el.style.setProperty("--folder-open-order", index + 1);
  });
  const lastIconOrder = orderedPlacements.length;
  topBar.style.setProperty("--folder-open-order", lastIconOrder + 1);
  panel.style.setProperty("--folder-open-last-order", lastIconOrder + 1);
  panel.append(topBar, content, bottomBar);
  return panel;
}

function setFolderOpenTravel(panel) {
  const travel = `${-Math.max(1, panel.offsetHeight)}px`;
  panel.querySelectorAll(
    ":scope > .disco-folder-open-bar, :scope > .disco-folder-open-content > .disco-folder-open-item"
  ).forEach(element => {
    element.style.setProperty("--folder-open-travel", travel);
  });
}

function animateFolderOpenPanel(panel) {
  const durationScale = Number(window.animationDurationScale) || 1;
  const elements = panel.querySelectorAll(
    ":scope > .disco-folder-open-bar, :scope > .disco-folder-open-content > .disco-folder-open-item"
  );

  const animations = [...elements].map(element => {
    const travel = element.style.getPropertyValue("--folder-open-travel") || "-32px";
    const order = Number(element.style.getPropertyValue("--folder-open-order")) || 0;
    return element.animate(
      [
        { transform: `translateY(${travel})` },
        { transform: "translateY(0px)" }
      ],
      {
        duration: FOLDER_OPEN_DURATION * durationScale,
        delay: (FOLDER_OPEN_DELAY + order * FOLDER_OPEN_STEP) * durationScale,
        easing: "cubic-bezier(.2, 1.55, .45, 1)",
        fill: "both"
      }
    );
  });

  Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
    if (!panel.isConnected || panel.classList.contains("folder-closing")) return;
    panel.classList.add("folder-open-visible");
    animations.forEach(animation => animation.cancel());
  });
  panel.classList.remove("folder-open-preparing");
  return animations;
}

function openFolder(folder) {
  if (!folder?.gridstackNode || homeTileEditEnabled) return;
  if (openFolderState?.folder === folder) {
    closeOpenFolder();
    return;
  }
  if (openFolderState) closeOpenFolder({ immediate: true });

  const node = folder.gridstackNode;
  const panel = createFolderOpenPanel(folder);
  tileListInnerContainer.append(panel);
  setFolderOpenTravel(panel);
  const panelHeight = panel.offsetHeight;
  const cell = tileListGrid.el.clientWidth / tileListGrid.getColumn();
  const folderBottomRow = node.y + node.h;
  const shiftedTiles = tileListGrid.engine.nodes
    .filter(candidate => candidate !== node && candidate.y >= node.y)
    .map(candidate => ({
      el: candidate.el,
      offset: panelHeight + (candidate.y < folderBottomRow ? node.h * cell : 0),
      bottom: (candidate.y + candidate.h) * cell
    }));
  const gridHeight = tileListGrid.engine.nodes.reduce(
    (max, candidate) => Math.max(max, candidate.y + candidate.h),
    0
  ) * cell;
  const panelBottom = (node.y + node.h) * cell + panelHeight;
  const expandedHeight = shiftedTiles.reduce(
    (max, candidate) => Math.max(max, candidate.bottom + candidate.offset),
    Math.max(gridHeight, panelBottom)
  );
  const version = ++folderOpenVersion;

  folder.classList.remove("folder-closing");
  folder.style.setProperty("--folder-thumbnail-travel", `${folder.offsetHeight}px`);
  setFolderThumbnailOrder(folder);
  folder.folderOpenVersion = version;
  openFolderState = { folder, panel, shiftedTiles, version, panelAnimations: [] };
  tileListGrid.setExtraHeight(Math.max(0, expandedHeight - gridHeight));
  DiscoBoard.backendMethods.navigation.push(
    "homeFolderOpen",
    () => { },
    () => closeOpenFolder({ invalidateNavigation: false })
  );

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (openFolderState?.folder !== folder) return;
    folder.classList.add("folder-open");
    openFolderState.panelAnimations = animateFolderOpenPanel(panel);
    shiftedTiles.forEach(({ el, offset }) => {
      el.style.setProperty("--folder-row-offset", `${offset}px`);
    });
    if (window.scrollers) scrollers.tile_page_scroller.refresh();
  }));
}

function closeOpenFolder({ immediate = false, invalidateNavigation = true } = {}) {
  const state = openFolderState;
  if (!state) return;
  openFolderState = null;

  if (invalidateNavigation
    && DiscoBoard.backendMethods.navigation.lastPush?.change === "homeFolderOpen") {
    DiscoBoard.backendMethods.navigation.invalidate("homeFolderOpen");
  }

  state.folder.classList.add("folder-closing");
  state.panel.classList.add("folder-closing");
  state.panelAnimations.forEach(animation => animation.cancel());
  state.folder.classList.remove("folder-open");
  state.panel.classList.remove("folder-open-visible");
  state.shiftedTiles.forEach(({ el }) => el.style.removeProperty("--folder-row-offset"));
  tileListGrid.setExtraHeight(0);

  const cleanup = () => {
    state.panel.remove();
    if (state.folder.folderOpenVersion !== state.version) return;
    state.folder.classList.remove("folder-closing");
    state.folder.style.removeProperty("--folder-thumbnail-travel");
    state.folder.querySelectorAll(".disco-folder-thumbnail").forEach(thumbnail => {
      thumbnail.style.removeProperty("--folder-thumbnail-order");
    });
    if (window.scrollers) scrollers.tile_page_scroller.refresh();
  };
  if (immediate) cleanup();
  else setTimeout(cleanup, FOLDER_OPEN_DURATION + FOLDER_OPEN_STEP * 2);
}

$("#app-page-icon").on("flowClick", function () {
  window.scrollers.main_home_scroller.scrollTo(-window.innerWidth, 0, 750);
  $("#search-icon").addClass("shown");
});

const resizeObserver = new ResizeObserver((entries) => {
  for (let entry of entries) {
    tileListGrid.render();
    DiscoBoard.backendMethods.scaleTiles();
    if (window["scrollers"]) scrollers.tile_page_scroller.refresh();
  }
});
resizeObserver.observe(document.querySelector("div.tile-list-inner-container"));

$(window).on("flowClick", function (e) {
  const clickedTile = resolveHomeTileTarget(e.target);
  if (clickedTile.classList.contains("disco-home-folder-tile")) {
    if (!homeTileEditEnabled && clickedTile.canClick) openFolder(clickedTile);
    return;
  }
  if (
    isLaunchableHomeTile(clickedTile) &&
    !clickedTile.classList.contains("disco-letter-tile")
  ) {
    if (clickedTile.dataset.tapTarget === "native-widget") return;
    if ($("div.tile-list-page").hasClass("home-menu-back")) {
      $("div.disco-home-tile").removeClass("home-menu-selected");
      clickedTile.classList.add("home-menu-selected");
      DiscoBoard.boardMethods.createTileMenu(clickedTile);
    } else if (clickedTile.canClick) {
      clickedTile.classList.add("app-transition-selected");
      appTransition.onPause();
      const packageName = clickedTile.getAttribute("packageName")
      setTimeout(() => {
        if (!window.doubleTapOverride) Disco.launchApp(packageName);
      }, (packageName.startsWith("disco.internal") && false ? 500 : 1000) * window.animationDurationScale);
    }
  } else if (
    e.target ==
    document.querySelector("#main-home-slider > div > div:nth-child(1)") ||
    e.target.classList.contains("tile-list-container") ||
    e.target.classList.contains("home-menu-back") ||
    e.target.classList.contains("home-menu-back-intro") ||
    e.target.classList.contains("app-page-icon-banner")
  ) {
    //  if (homeTileEditEnabled) homeTileEditSwitch.off()
  }
});

$(window).on("pointerdown", function (e) {
  if (homeTileEditEnabled) {
    clearTimeout(window.homeTileEditTimeout)
    window.homeTileEditTimeout = setTimeout(() => { homeTileEditSwitch.off() }, 30000);
  }
  const targetTile = resolveHomeTileTarget(e.target);
  if (targetTile.classList.contains("disco-folder-open-item") && !homeTileEditEnabled) {
    targetTile.canClick = true;
    return;
  }
  if (isEditableHomeTile(targetTile) && !homeTileEditEnabled) {
    targetTile.canClick = true;
    targetTile.homeTileMenuState = false;
    targetTile.appRect = targetTile.getBoundingClientRect();
    clearTimeout(window.homeTileMenuCreationFirstTimeout);
    clearTimeout(window.homeTileMenuCreationSecondTimeout);
    $("div.disco-home-menu").remove();
    window.homeTileMenuCreationFirstTimeout = setTimeout(() => {
      targetTile.canClick = false;

      homeTileEditSwitch.on(false, () => {
        targetTile.classList.add("home-menu-selected");
        DiscoBoard.boardMethods.createTileMenu(targetTile);
        generateShakeAnimations();
        targetTile.homeTileMenuState = true;
        tileListGrid.beginDrag(targetTile, e.originalEvent || e);
      });
      targetTile.classList.add("home-menu-selected");
    }, 500);
  } else if (
    isEditableHomeTile(targetTile) &&
    homeTileEditEnabled
  ) {
    $("div.disco-home-tile").removeClass("home-menu-selected");
    targetTile.classList.add("home-menu-selected");
    DiscoBoard.boardMethods.createTileMenu(targetTile);
  }
});
$(
  "#main-home-slider > div > div.slide-page, #main-home-slider > div > div.slide-page > div.inner-page, #main-home-slider > div > div.slide-page > div.inner-page > div.tile-list-container, div.tile-list-inner-container"
).on("flowClick", (e) => {
  if (e.target.closest(".disco-folder-open-panel")) return;
  if (e.target.closest("div.disco-home-tile")) return;
  closeOpenFolder();
  if (homeTileEditEnabled) homeTileEditSwitch.off();
});
$(window).on("pointerup", function (e) {
  $("div.disco-home-tile").each((index, element) => {
    if (element["homeTileMenuState"] == false) {
      if (element["homeTileMenu"]) element["homeTileMenu"].remove();
      delete element["homeTileMenuState"];
      delete element["homeTileMenu"];
      delete element["appRect"];
      homeTileEditSwitch.off();
    } else if (element["homeTileMenuState"] == true) {
    }
  });
});

function homeTileMenuClean() {
  document.querySelectorAll(".disco-tile-menu").forEach((i) => i.remove());
  // DiscoBoard.backendMethods.navigation.invalidate("homeTileMenuOn")
  $("div.disco-home-tile").removeClass("home-menu-selected");
  clearTimeout(window.homeTileMenuCreationFirstTimeout);
  clearTimeout(window.homeTileMenuCreationSecondTimeout);
  $("div.tile-list-page").removeClass("home-menu-back-intro home-menu-back");
}
function appImmediateClose() {
  $("div.disco-home-tile").each((index, element) => {
    if (element["homeTileMenuState"] == false) {
      if (element["homeTileMenu"]) element["homeTileMenu"].remove();
      delete element["homeTileMenuState"];
      delete element["appRect"];
      homeTileMenuClean();
    } else if (element["homeTileMenuState"] == true) {
    }
  });
}

$(window).on("finishedLoading", () => {
  scrollers.tile_page_scroller.scroller.animater.hooks.on(
    "time",
    (duration) => {
      tileListInnerContainer.style.setProperty("--wallpaper-scroll-duration", duration + "ms")
    }
  );
  scrollers.tile_page_scroller.scroller.translater.hooks.on(
    "beforeTranslate",
    (point, ee) => {
      DiscoBoard.backendMethods.wallpaper.recalculateOffsets(ee);
    }
  );

  //DiscoBoard.backendMethods.wallpaper.load("./assets/wallpaper.jpg")
});
var wallpaperLastScroll = 0
var wallpaperScroll = 0
$(window).on("finishedLoading", () => {
  window.scrollers.tile_page_scroller.scroller.translater.hooks.on('translate', (e) => {
    if (!document.querySelector("div.slide-page-home.wallpaper-behind")) return;
    const deltaY = wallpaperLastScroll - e.y
    const inBoundaries = (scrollers.tile_page_scroller.y <= 125) && ((scrollers.tile_page_scroller.maxScrollY - scrollers.tile_page_scroller.y) <= 125)
    if (inBoundaries) wallpaperScroll += deltaY / 300;
    wallpaperScroll = wallpaperScroll < 0 ? 0 : wallpaperScroll > 1 ? 1 : wallpaperScroll
    //console.log(wallpaperScroll)
    document.querySelector("div.slide-page-home.wallpaper-behind").style.setProperty("background-position", `50% ${(wallpaperScroll) * -100}px`)
    wallpaperLastScroll = e.y


    $("div.disco-home-tile").each((index, element) => {
      if (element["homeTileMenuState"] == false) {
        if (element["homeTileMenu"]) element["homeTileMenu"].remove();
        delete element["homeTileMenuState"];
        delete element["homeTileMenu"];
        delete element["appRect"];
        homeTileEditSwitch.off();
      } else if (element["homeTileMenuState"] == true) {
      }
    });
  })
  window.scrollers.main_home_scroller.scroller.translater.hooks.on('translate', (e) => {

    $("div.disco-home-tile").each((index, element) => {
      if (element["homeTileMenuState"] == false) {
        if (element["homeTileMenu"]) element["homeTileMenu"].remove();
        delete element["homeTileMenuState"];
        delete element["homeTileMenu"];
        delete element["appRect"];
        homeTileEditSwitch.off();
      } else if (element["homeTileMenuState"] == true) {
      }
    });
  })
})
