import jQuery from "jquery";
import DiscoBoard from "../DiscoBoard";
const $ = jQuery;
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
grid.on('drag', function (event, el) {
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
  if (
    clickedTile.classList.contains("disco-home-tile") &&
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
  if (targetTile.classList.contains("disco-home-tile") && !homeTileEditEnabled) {
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
    targetTile.classList.contains("disco-home-tile") &&
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
  if (e.target.closest("div.disco-home-tile")) return;
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
