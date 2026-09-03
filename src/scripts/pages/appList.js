import jQuery from "jquery";
import _ from "lodash";
import i18n from "../localeManager";
var $ = jQuery

const appListPage = $("div.inner-page.app-list-page")
const appListContainer = $("div.app-list-container")
const appListSearch = $("input.app-list-search")
const letterSelector = $("div.letter-selector")
const stickyLetterTile = $("#sticky-letter")
const appListElement = document.querySelector("div.app-list")

class VirtualAppList {
    constructor(container) {
        this.container = container
        this.entries = []
        this.visibleEntries = []
        this.letterEntries = []
        this.rendered = new Map()
        this.spacer = document.createElement("div")
        this.spacer.setAttribute("aria-hidden", "true")
        Object.assign(this.spacer.style, { width: "1px", pointerEvents: "none" })
        this.active = false
        this.layoutDirty = false
        this.buffer = 8 * 64
        container.style.position = "relative"
        window.addEventListener("resize", () => this.relayout())
    }

    setEntries(entries) {
        this.entries = entries.map((entry, index) => ({ ...entry, key: index }))
        this.active = true
        this.rendered.clear()
        this.container.replaceChildren()
        this.container.append(this.spacer)
        this.setFilter("")
    }

    setFilter(query) {
        const normalizedQuery = window.normalizeDiacritics(query || "").toLocaleLowerCase("en")
        this.visibleEntries = this.entries.filter((entry) =>
            entry.type === "letter" || !normalizedQuery || entry.searchTitle.includes(normalizedQuery)
        )
        // Letter headers without a matching app should not take a row in search.
        if (normalizedQuery) {
            this.visibleEntries = this.visibleEntries.filter((entry, index, all) =>
                entry.type !== "letter" || all.slice(index + 1).some((next) => next.type === "app")
            )
        }
        this.relayout()
    }

    relayout() {
        if (!this.active) return
        const styles = getComputedStyle(this.container)
        const paddingLeft = parseFloat(styles.paddingLeft) || 0
        const paddingRight = parseFloat(styles.paddingRight) || 0
        const paddingTop = parseFloat(styles.paddingTop) || 0
        const paddingBottom = parseFloat(styles.paddingBottom) || 0
        const columns = window.innerWidth >= 700 ? 2 : 1
        const width = Math.max(1, (this.container.clientWidth - paddingLeft - paddingRight) / columns)
        let top = paddingTop
        let column = 0
        this.letterEntries = []

        this.visibleEntries.forEach((entry) => {
            if (entry.type === "letter") {
                if (column) { top += 64; column = 0 }
                entry.top = top
                entry.left = paddingLeft
                entry.width = width * columns
                this.letterEntries.push(entry)
                top += 64
                return
            }
            entry.top = top
            entry.left = paddingLeft + column * width
            entry.width = width
            column += 1
            if (column === columns) { top += 64; column = 0 }
        })
        if (column) top += 64
        // Virtual rows are absolutely positioned and therefore do not affect
        // scrollHeight. A normal-flow spacer gives the custom scroller the
        // real extent of the virtual list instead of maxScrollY = 0.
        this.container.style.height = "auto"
        this.spacer.style.height = `${top + paddingBottom}px`
        this.layoutDirty = true
        this.render()
        if (window.scrollers?.app_page_scroller) window.scrollers.app_page_scroller.refresh()
    }

    render() {
        if (!this.active || !window.scrollers?.app_page_scroller) return
        const scroller = window.scrollers.app_page_scroller
        // Momentum may temporarily place the transform outside the content
        // bounds. Virtualization must keep rendering the nearest real window
        // instead of culling every row during that overscroll frame.
        const scrollTop = Math.max(0, Math.min(-scroller.y, -scroller.maxScrollY))
        const viewportBottom = scrollTop + scroller.wrapper.clientHeight
        const wanted = new Set()
        this.visibleEntries.forEach((entry) => {
            if (entry.top + 64 < scrollTop - this.buffer || entry.top > viewportBottom + this.buffer) return
            wanted.add(entry.key)
            let node = this.rendered.get(entry.key)
            if (!node) {
                node = entry.type === "letter"
                    ? DiscoBoard.boardMethods.createLetterTile(entry.icon)
                    : DiscoBoard.boardMethods.createAppTile(entry)
                this.rendered.set(entry.key, node)
                this.applyLayout(node, entry)
            } else if (this.layoutDirty) this.applyLayout(node, entry)
        })
        this.rendered.forEach((node, key) => {
            if (!wanted.has(key)) {
                node.remove()
                this.rendered.delete(key)
            }
        })
        this.layoutDirty = false
    }

    applyLayout(node, entry) {
        Object.assign(node.style, {
            position: "absolute",
            top: `${entry.top}px`,
            left: `${entry.left}px`,
            width: `${entry.width}px`,
            marginRight: "0",
        })
    }

    getLetterTiles() {
        return this.letterEntries
            .map((entry) => ({ top: entry.top, icon: entry.icon }))
    }

    getStickyLetter(scrollTop, insetTop) {
        const boundary = scrollTop + insetTop
        // Use the persistent virtual letter index. Rendered nodes are only a
        // moving viewport cache and may disappear during a momentum jump.
        let low = 0
        let high = this.letterEntries.length - 1
        let currentIndex = -1
        while (low <= high) {
            const middle = (low + high) >> 1
            if (this.letterEntries[middle].top < boundary) {
                currentIndex = middle
                low = middle + 1
            } else {
                high = middle - 1
            }
        }

        if (currentIndex < 0) return null
        const current = this.letterEntries[currentIndex]
        const next = this.letterEntries[currentIndex + 1]
        const distanceToNext = next ? next.top - boundary : Infinity
        return {
            icon: current.icon,
            offset: distanceToNext < 64 ? distanceToNext - 64 : 0
        }
    }

    scrollToLetter(icon) {
        const entry = this.entries.find((item) => item.type === "letter" && item.icon === icon)
        if (!entry) return
        window.scrollers.app_page_scroller.scrollTo(0, Math.max(window.scrollers.app_page_scroller.maxScrollY, window.windowInsets().top - entry.top), 0)
    }
}

window.appListVirtualizer = new VirtualAppList(appListContainer[0])

let letterTileLayout = null
let stickyLetterFrame = null
let stickyLetterState = {}

function invalidateLetterTileLayout() {
    letterTileLayout = null
}

new MutationObserver(() => {
    // Virtual rendering adds/removes rows while scrolling. Its letter layout
    // comes from the virtual entries, so invalidating sticky visibility here
    // loses the DOM state without hiding the sticky element.
    if (!window.appListVirtualizer.active) invalidateLetterTileLayout()
}).observe(appListContainer[0], {
    childList: true,
    subtree: true
})
window.addEventListener("resize", invalidateLetterTileLayout)

function getLetterTileLayout() {
    if (window.appListVirtualizer.active) return window.appListVirtualizer.getLetterTiles()
    if (!letterTileLayout) {
        letterTileLayout = Array.from(appListContainer[0].querySelectorAll("div.disco-element.disco-app-tile.disco-letter-tile"))
            .map((element) => ({ element, top: element.offsetTop }))
    }
    return letterTileLayout
}

function scheduleStickyLetter() {
    if (stickyLetterFrame) return
    stickyLetterFrame = requestAnimationFrame(() => {
        stickyLetterFrame = null
        // Virtual rows and the sticky header must observe the exact same
        // scroll position. Rendering them in separate frames could leave the
        // header pointing at a row that had just been recycled on a fast flick.
        window.appListVirtualizer.render()
        stickyLetter()
    })
}

var isSearchModeOn = false
$("div.disco-element.disco-app-tile.disco-letter-tile")

function renderSearchHighlight(titleElement, title, start, length) {
    const fragment = document.createDocumentFragment()
    const match = document.createElement("span")

    match.className = "disco-app-tile-title-search-tip"
    match.textContent = title.slice(start, start + length)
    fragment.append(
        document.createTextNode(title.slice(0, start)),
        match,
        document.createTextNode(title.slice(start + length))
    )

    titleElement.replaceChildren(fragment)
}

function renderNoResultMessage(container) {
    const queryPlaceholder = "__DISCO_SEARCH_QUERY__"
    const message = i18n.t("common.search.no_results", { query: queryPlaceholder })
    const fragment = document.createDocumentFragment()
    const parts = message.split(queryPlaceholder)

    parts.forEach((part, index) => {
        fragment.append(document.createTextNode(part))
        if (index < parts.length - 1) {
            const query = document.createElement("span")
            query.style.color = "var(--accent-color)"
            query.textContent = "SEARCH"
            fragment.append(query)
        }
    })

    container.replaceChildren(fragment)
}

function searchResultClick(e) {
    if (!e.target.canClick || e.target.appMenuState) return;

    $("div.disco-app-tile").off("flowClick", searchResultClick)
    e.target.classList.add("app-transition-selected")
    appTransition.onPause()
    const packageName = e.target.getAttribute("packagename")
    setTimeout(() => {
        if (!window.doubleTapOverride) Disco.launchApp(packageName)
        setTimeout(() => {
            searchModeSwitch.off()
        }, 100 * animationDurationScale);
    }, (packageName.startsWith("disco.internal") && false ? 500 : 1000) * animationDurationScale);


}
const searchModeSwitch = {
    on: () => {
        isSearchModeOn = true
        DiscoBoard.backendMethods.navigation.push("searchOn", () => { }, searchModeSwitch.off)
        appListSearch.focus()
        $("div.disco-app-tile").on("flowClick", searchResultClick)

        setTimeout(() => {
            scrollers.main_home_scroller.enabled = false
        }, 0);
        appListSearch.val("")
        appListSearch.removeAttr("disabled")
        clearTimeout(appListPage[0].searchModeOffTimeout)
        appListPage.addClass("search-mode-animations").addClass("search-mode")
        appListContainer.css("transition", "")

        setTimeout(() => {
            scrollers.main_home_scroller.enabled = false
            scrollers.app_page_scroller.refresh()
            appListSearch.focus()
            appListContainer.css("transition", "transform 0s")
        }, 250 * animationDurationScale);
        setTimeout(() => { scrollers.app_page_scroller.refresh() }, 500 * animationDurationScale);
        // history.pushState("searchmodeon", document.title, location.href);
        appListPage.removeClass("no-search-result")
        $("div.app-list-container > div.disco-app-tile:not(.disco-letter-tile)").removeClass("search-hidden")
        if (window.appListVirtualizer.active) window.appListVirtualizer.setFilter("")
        invalidateLetterTileLayout()
        scrollers.app_page_scroller.scrollTo(0, 0, 0, "linear")
        $("div.app-search-search-store").css("visibility", "hidden")
    },
    off: () => {
        appListContainer.css("transition", "")
        DiscoBoard.backendMethods.navigation.invalidate("searchOn")
        scrollers.main_home_scroller.enabled = true
        $("div.disco-app-tile").off("flowClick", searchResultClick)

        appListPage.removeClass("search-mode")
        appListPage[0].searchModeOffTimeout = setTimeout(() => {
            appListPage.removeClass("search-mode-animations")
            appListSearch.attr("disabled", "true")
            stickyLetter(scrollers.app_page_scroller.y)
            isSearchModeOn = false
        }, 250 * animationDurationScale);
        scrollers.app_page_scroller.refresh()
        setTimeout(() => { scrollers.app_page_scroller.refresh(); appListSearch.val("") }, 500 * animationDurationScale);

        $("div.app-list-container > div.disco-app-tile:not(.disco-letter-tile)").each(function (index, element) {
            try {
                element.querySelector("p.disco-app-tile-title").innerText = element.getAttribute("title")
            } catch (error) {

            }
        })

        appListPage.removeClass("no-search-result")
        $("div.app-list-container > div.disco-app-tile:not(.disco-letter-tile)").removeClass("search-hidden")
        if (window.appListVirtualizer.active) window.appListVirtualizer.setFilter("")
    }
}
const letterSelectorSwitch = {
    on: () => {
        DiscoBoard.backendMethods.navigation.push("letterSelectOn", () => { }, letterSelectorSwitch.off)
        scrollers.main_home_scroller.enabled = false
        window.stopInsetUpdate = true
        const enabledones = Object.keys(window.appSortCategories).map(e => e == "0-9" ? "#" : e == "&" ? "" : e)
        $("div.letter-selector-letter").removeClass("disabled")

        $("div.letter-selector-letter").each((index, element) => {
            if (!enabledones.includes(element.innerText.toLocaleUpperCase("en"))) element.classList.add("disabled")
        })
        Disco.setStatusBarAppearance("hide")
        letterSelector.addClass("shown").addClass("shown-animation")
        setTimeout(() => {
            if (letterSelector.hasClass("shown")) letterSelector.removeClass("shown-animation")
        }, 500 * DiscoBoard.backendMethods.animationDurationScale.get());
        $("div.letter-selector-row").each((index, element) => {
            $(element).css("--index", index)
        })
        Array.from({ length: 7 }, (_, i) => {
            setTimeout(() => {
                Disco.triggerHapticFeedback("CLOCK_TICK");
            }, i * 20 * DiscoBoard.backendMethods.animationDurationScale.get());
        });
    },
    off: () => {
        DiscoBoard.backendMethods.navigation.invalidate("letterSelectOn")
        scrollers.main_home_scroller.enabled = true
        Disco.setStatusBarAppearance("light")
        letterSelector.removeClass("shown").addClass("shown-animation").addClass("hidden")
        setTimeout(() => {
            delete window.stopInsetUpdate

            if (letterSelector.hasClass("hidden")) letterSelector.removeClass("shown-animation").removeClass("hidden")

        }, 500 * DiscoBoard.backendMethods.animationDurationScale.get());
        Array.from({ length: 7 }, (_, i) => {
            setTimeout(() => {
                Disco.triggerHapticFeedback("CLOCK_TICK");
            }, (i * 20 + 60) * DiscoBoard.backendMethods.animationDurationScale.get());
        });
    }
}

appListSearch.on("focus", function () {
    DiscoBoard.backendMethods.navigation.push("searchBarFocus", () => { }, () => {
        appListSearch.blur()
    })

})
appListSearch.on("blur", function () {
    DiscoBoard.backendMethods.navigation.invalidate("searchBarFocus")

})
$("#search-icon").on("flowClick", function () {
    const searchModeOn = appListPage.hasClass("search-mode")
    if (searchModeOn) {
        searchModeSwitch.off()
    } else {
        searchModeSwitch.on()
    }

})
$(window).on("finishedLoading", () => {
    window.scrollers.main_home_scroller.on("scrollStart", () => {
        scrollers.tile_page_scroller.refresh()
        scrollers.app_page_scroller.refresh()
    })
    window.scrollers.app_page_scroller.scroller.translater.hooks.on('translate', () => {
        scheduleStickyLetter()
    })
    $("div.letter-selector-letter").on("flowClick", function (e) {
        if (e.target.classList.contains("disabled")) return
        letterSelectorSwitch.off()
        if (window.appListVirtualizer.active) window.appListVirtualizer.scrollToLetter(e.target.innerText.toLowerCase())
        else scrollers.app_page_scroller.scrollTo(0, Math.max(scrollers.app_page_scroller.maxScrollY, window.windowInsets().top - document.querySelector(`div.disco-app-tile.disco-letter-tile[icon='${e.target.innerText.toLowerCase()}']`).offsetTop,), 0, "linear")
        e.stopPropagation()
        e.stopImmediatePropagation()
        e.preventDefault()
    })
})
appListSearch.on("input", _.debounce(function (e) {
    const search = window.normalizeDiacritics(this.value).toLocaleLowerCase("en")
    if (search.length == 0) $("div.app-search-search-store").css("visibility", "hidden"); else $("div.app-search-search-store").css("visibility", "");
    if (window.appListVirtualizer.active) {
        window.appListVirtualizer.setFilter(search)
        appListPage.toggleClass("no-search-result", !window.appListVirtualizer.visibleEntries.some((entry) => entry.type === "app"))
        return
    }
    $("div.app-list-container > div.disco-app-tile:not(.disco-letter-tile)").each(function (index, element) {
        try {
            const app_title = window.normalizeDiacritics(element.title).toLocaleLowerCase("en")
            if (app_title.includes(search)) {
                $(element).removeClass("search-hidden")
                const ogtitle = element.getAttribute("title")
                const indexoftitle = app_title.indexOf(search)
                renderSearchHighlight(
                    element.querySelector("p.disco-app-tile-title"),
                    ogtitle,
                    indexoftitle,
                    search.length
                )

            } else {
                $(element).addClass("search-hidden")
            }
        } catch (error) {

        }
    })
    if ($("div.app-list-container > div.disco-app-tile:not(.disco-letter-tile):not(.search-hidden)").length == 0) {
        appListPage.addClass("no-search-result")
        $("div.app-search-no-result > span").text(this.value)

    } else {
        appListPage.removeClass("no-search-result")
    }
    invalidateLetterTileLayout()
    scrollers.app_page_scroller.refresh()

}, 150))
$("div.app-search-search-store").on("flowClick", () => {
    //window.open("https://play.google.com/store/search?q=" + appListSearch[0].value, "_blank")
    Disco.searchStore(appListSearch[0].value)
})




$(window).on("flowClick", function (e) {
    if (e.target.classList.contains("disco-letter-tile")) {
        setTimeout(letterSelectorSwitch.on, 0);
    } else if (e.target.classList.contains("disco-app-tile") && !e.target.classList.contains("disco-letter-tile")) {
        if (e.target.canClick) {
            e.target.classList.add("app-transition-selected")
            appTransition.onPause()
            setTimeout(() => {
                if (!isSearchModeOn) if (!window.doubleTapOverride) Disco.launchApp(e.target.getAttribute("packageName"))
            }, 1000 * animationDurationScale);
        }
    }
})
$("div.app-list-page").on("flowClick", function (e) {
    if (e.target.classList.contains("app-menu-back") || e.target.classList.contains("app-menu-back-intro")) {
        appMenuClose()
    }
})

$(window).on("pointerdown", function (e) {
    if (e.target.classList.contains("disco-app-tile") && !e.target.classList.contains("disco-letter-tile")) {
        e.target.canClick = true
        e.target.appMenu = false
        e.target.appMenuState = false
        e.target.appRect = e.target.getBoundingClientRect()

        clearTimeout(window.appMenuCreationFirstTimeout)
        clearTimeout(window.appMenuCreationSecondTimeout)
        $("div.disco-app-menu").remove()

        window.appMenuCreationFirstTimeout = setTimeout(() => {
            e.target.canClick = false
            scrollers.main_home_scroller.enabled = false
            $("div.app-list-page").addClass("app-menu-back-intro")
            const appMenu = DiscoBoard.boardMethods.createAppMenu(e.target.getAttribute("packagename"))
            const optionalTop = (e.target.offsetTop + scrollers.app_page_scroller.y + 64)
            appMenu.style.top = ((optionalTop + 219 >= window.innerHeight - windowInsets().bottom) ? optionalTop - 64 : optionalTop) + "px"
            appMenu.style.setProperty("--pointerX", e.pageX - $("div.app-list-page").position().left + "px")
            appMenu.classList.add("intro")
            const appClone = e.target.cloneNode(true)
            appClone.setAttribute("style", appClone.getAttribute("style") + "transition-duration: 1s !important;")
            $(appClone).addClass("app-tile-clone").css({
                left: e.target.appRect.left - $("div.app-list-page").position().left,
                top: e.target.appRect.top
            })
            $("div.app-list-page").append(appClone)
            setTimeout(() => {
                appClone.classList.remove("active")
            }, 0);
            e.target.style.visibility = "hidden"

            if (optionalTop + 219 >= window.innerHeight - windowInsets().bottom) appMenu.classList.add("intro-bottom")

            e.target.appMenu = appMenu
            DiscoBoard.backendMethods.navigation.push("appMenuOn", () => { }, () => {
                appMenuClose()
            })
            setTimeout(() => {
                Disco.triggerHapticFeedback("CLOCK_TICK")
            }, 300);
            window.appMenuCreationSecondTimeout = setTimeout(() => {
                $("div.app-list-page").addClass("app-menu-back").removeClass("app-menu-back-intro")
                e.target.appMenuState = true
                scrollers.app_page_scroller.cancelScroll()
                setTimeout(() => {
                    Disco.triggerHapticFeedback("CONFIRM")
                }, 50);
            }, 375);

        }, 500);
    }
})

$(window).on("pointerup", function (e) {
    $("div.disco-app-tile").each((index, element) => {
        if (element["appMenuState"] == false) {
            if (element["appMenu"]) element["appMenu"].remove()
            delete element["appMenuState"]
            delete element["appMenu"]
            delete element["appRect"]
            appMenuClean()

        } else if (element["appMenuState"] == true) {

        }

    })

})
function appMenuClose() {
    DiscoBoard.backendMethods.navigation.invalidate("appMenuOn")
    clearTimeout(window.appMenuCreationFirstTimeout)
    clearTimeout(window.appMenuCreationSecondTimeout)
    $("div.disco-app-menu").remove()
    $("div.app-list-page").removeClass("app-menu-back app-menu-back-intro")
    setTimeout(() => {
        appMenuClean()
        stickyLetter(-scrollers.app_page_scroller.y)
    }, 500);
    scrollers.main_home_scroller.enabled = true

}
function appMenuClean() {
    DiscoBoard.backendMethods.navigation.invalidate("appMenuOn")

    clearTimeout(window.appMenuCreationFirstTimeout)
    clearTimeout(window.appMenuCreationSecondTimeout)
    $("div.app-list-page").removeClass("app-menu-back-intro")
    // The sticky header also has .disco-app-tile, but its visibility is owned
    // exclusively by stickyLetter(). Clearing it here desynchronizes the DOM
    // from stickyLetterState and makes the header disappear permanently.
    $("div.disco-app-tile").not("#sticky-letter").css("visibility", "")
    $("div.app-tile-clone").remove()
}
function appImmediateClose() {
    $("div.disco-app-tile").each((index, element) => {
        if (element["appMenuState"] == false) {
            if (element["appMenu"]) element["appMenu"].remove()
            delete element["appMenuState"]
            delete element["appMenu"]
            delete element["appRect"]
            appMenuClean()

        } else if (element["appMenuState"] == true) {

        }

    })
    scrollers.main_home_scroller.enable()

}
window.appMenuClean = appMenuClean
window.appMenuClose = appMenuClose
$(window).on("finishedLoading", () => {
    scrollers.app_page_scroller.scroller.hooks.on('scrollStart', appImmediateClose)
    scrollers.main_home_scroller.scroller.hooks.on('scrollStart', appImmediateClose)
    stickyLetter(0)
})


function getTranslateY(element) {
    // Get the computed style of the element
    const transform = $(element).css('transform');

    // Check if the transform property is not 'none'
    if (transform !== 'none') {
        // Extract the translateY value from the matrix
        const matrix = transform.match(/^matrix\(([^,]+),[^,]+,[^,]+,[^,]+,[^,]+,[^,]+\)$/);

        if (matrix) {
            // The translateY value is the sixth number in the matrix
            return parseFloat(matrix[6]);
        }
    }

    // Return 0 if there is no transform or translateY is not found
    return 0;
}

function resetStickyLetter() {
    stickyLetterTile.css({ visibility: "hidden" })
    appListPage.removeClass("sticky-letter-visible").css("--sticky-letter-offset", "0px")
    appListElement.classList.remove("hide-back")
    // Clean up the old implementation if this module was hot-reloaded.
    appListElement.style.removeProperty("clip-path")
    stickyLetterState = { visible: false, icon: null, offset: 0 }
}

function stickyLetter() {
    if (appListPage[0].classList.contains("app-menu-back") || appListPage[0].classList.contains("app-menu-back-intro")) return;
    const appScroller = window.scrollers.app_page_scroller
    // Call sites used to pass both `y` (negative) and `-y` (positive). Read
    // the source of truth directly so sticky headers cannot clamp back to the
    // first section after a search/menu/scroll lifecycle transition.
    const scroll = Math.max(0, Math.min(-appScroller.y, -appScroller.maxScrollY))
    const wInsets = windowInsets()
    let sticky
    if (window.appListVirtualizer.active) {
        sticky = window.appListVirtualizer.getStickyLetter(scroll, wInsets.top)
    } else {
        const letters = getLetterTileLayout()
        const boundary = scroll + wInsets.top
        let current = null
        let next = null
        for (const letter of letters) {
            if (letter.top < boundary) current = letter
            else {
                next = letter
                break
            }
        }
        if (current) {
            const distanceToNext = next ? next.top - boundary : Infinity
            sticky = {
                icon: current.element.getAttribute("icon"),
                offset: distanceToNext < 64 ? distanceToNext - 64 : 0
            }
        }
    }

    if (sticky) {
        const { icon, offset } = sticky
        // Reconcile against the DOM as well as the cache. Other UI cleanup
        // paths must not be able to leave a visible state with a hidden node.
        if (!stickyLetterState.visible || stickyLetterTile[0]?.style.visibility !== "visible") {
            stickyLetterTile.css({ visibility: "visible" })
        }
        if (!appListPage.hasClass("sticky-letter-visible")) appListPage.addClass("sticky-letter-visible")
        if (stickyLetterState.icon !== icon) stickyLetterTile.children("p.disco-app-tile-icon").text(icon)
        // Move only the fixed overlay. Updating clip-path/top on the scrolling
        // wrapper forces layer rebuilds and becomes unstable on fast flicks.
        if (stickyLetterState.offset !== offset) {
            appListPage.css({ "--sticky-letter-offset": `${offset}px` })
        }
        stickyLetterState = { visible: true, icon, offset }
    } else {
        // Do not rely only on the cached state here. A layout mutation may
        // have invalidated it while the sticky DOM and its clip-path remained
        // visible, which caused stuck or duplicate letter headers.
        const stickyDomIsActive = stickyLetterTile[0]?.style.visibility === "visible"
            || appListPage.hasClass("sticky-letter-visible")
            || appListElement.classList.contains("hide-back")
            || Boolean(appListElement.style.clipPath)
        if (stickyLetterState.visible || stickyDomIsActive) resetStickyLetter()
        else stickyLetterState = { visible: false, icon: null, offset: 0 }
    }
}

const appSearchNoResult = document.querySelector("div.app-search-no-result")
async function updateLocaleInfo() {
    appListSearch.attr("placeholder", i18n.toLowerCase(i18n.t("common.search.title")))
    renderNoResultMessage(appSearchNoResult)
}
updateLocaleInfo()
window.addEventListener("localeChanged", async () => {
    await i18n.init(true)
    updateLocaleInfo()
})
window.addEventListener("localeLoaded", updateLocaleInfo)
