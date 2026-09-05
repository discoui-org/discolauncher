import i18n from "../../../scripts/localeManager";
import DiscoElements from "../../../scripts/DiscoElements";

function updateLocaleInfo() {
    const localeDescription = document.querySelector("#home-tab > div:nth-child(1) > div > div:nth-child(3) > p.disco-list-view-item-description")
    try {
        localeDescription.innerText = i18n.getLocaleName().nativeName
    } catch (error) {
        localeDescription.innerText = i18n.getLocaleName("en-US").nativeName
    }
}

updateLocaleInfo()
window.addEventListener("localeChanged", updateLocaleInfo)

document.querySelector("#home-tab > div:nth-child(1) > div > div:nth-child(3)").addEventListener("flowClick", async () => {
    const loader = document.querySelector("body > div.innerAppPage:nth-child(5) > div.loader")
    const listView = document.querySelector("#language-tab > div.disco-list-view")
    loader.style.display = "flex"
    listView.innerHTML = ""

    const currentLanguageId = localStorage.language || i18n.getLocale() || "en-US"
    const availableLocales = (await i18n.getAvailableLocales()).userLocales
    loader.style.display = "none"

    Object.values(availableLocales)
        .sort((a, b) => a.languageId.localeCompare(b.languageId))
        .sort((a, b) => Number(b.languageId === currentLanguageId) - Number(a.languageId === currentLanguageId))
        .forEach(locale => {
            const localeName = i18n.getLocaleName(locale.languageId)
            const item = DiscoElements.wListViewItem(localeName.nativeName || '', localeName.name || '')
            item.locale = locale

            if (locale.languageId === currentLanguageId) item.classList.add("selected")
            item.addEventListener("flowClick", onItemClick)
            listView.append(item)
        })

    scrollers.language.refresh()
})

let lastSelected = false

function collapseExpandedItems() {
    document.querySelectorAll(".disco-list-view-item.expanded").forEach(item => {
        item.classList.remove("expanded")
        item.querySelector(".expanded-panel")?.remove()
    })
}

function onItemClick(event) {
    const item = event.currentTarget
    lastSelected = item === item.parentElement.lastElementChild

    if (item.classList.contains("expanded")) {
        collapseExpandedItems()
        Disco.triggerHapticFeedback("CONFIRM")
        return
    }

    collapseExpandedItems()
    item.classList.add("expanded")

    const panel = document.createElement("div")
    panel.className = "expanded-panel"
    panel.style.cssText = "padding-bottom: 16px; pointer-events: none;"

    const button = document.createElement("button")
    button.className = "metro-button"
    button.style.cssText = "margin-left: auto; pointer-events: auto;"
    button.textContent = i18n.t("common.actions.apply")
    panel.append(button)
    item.append(panel)

    button.addEventListener("flowClick", async buttonEvent => {
        buttonEvent.stopPropagation()
        button.disabled = true

        const applied = await i18n.setLocale(item.locale.languageId)
        if (!applied) {
            button.disabled = false
            return
        }

        document.querySelectorAll(".disco-list-view-item.selected").forEach(selectedItem => {
            selectedItem.classList.remove("selected")
        })
        item.classList.add("selected")
        setTimeout(() => {
            item.classList.remove("expanded")
            panel.remove()
        }, 200)
    })

    setTimeout(() => {
        Disco.triggerHapticFeedback("CONFIRM")
        setTimeout(() => Disco.triggerHapticFeedback("CLOCK_TICK"), 125)
    }, 250)

    scrollerRefreshActive = true
    if (!scrollerRefreshRunning) scrollerRefresh()
    setTimeout(() => {
        scrollerRefreshActive = false
        requestAnimationFrame(() => {
            scrollerRefreshRunning = false
        })
    }, 500)
}

let scrollerRefreshActive = false
let scrollerRefreshRunning = false

function scrollerRefresh() {
    if (!scrollerRefreshActive) return
    scrollerRefreshRunning = true
    scrollers.language.refresh()
    if (lastSelected) scrollers.language.scrollTo(0, scrollers.language.maxScrollY, 0)
    requestAnimationFrame(scrollerRefresh)
}
