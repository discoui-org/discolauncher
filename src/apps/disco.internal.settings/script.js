import { applyOverscroll, appViewEvents, discoColors, discoThemes, setAccentColor } from "../../scripts/shared/internal-app";
import { DiscoScroll } from "../../scripts/overscrollFramework";
import createInternalAppTabSlider from "../../scripts/shared/internalAppTabSlider";
import imageStore from "../../scripts/imageStore";
import fontStore from "../../scripts/fontStore";
import $ from "../../scripts/dom";
import i18n from "../../scripts/localeManager";
window.i18n = i18n
await i18n.init()
await i18n.translateDOM()
window.fontStore = fontStore
const { pages: allPages, activeTabScroll } = createInternalAppTabSlider()
window.scrollers = {
    home: new DiscoScroll("#home-tab", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    }),
    accentColorCatalogue: new DiscoScroll("div.accent-color-catalogue", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: false
    }),
    customColorSelector: new DiscoScroll("div.custom-color-selector", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: false,
        eventPassthrough: "horizontal"
    }),
    apps: new DiscoScroll(allPages[1], {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    }),
    theme: new DiscoScroll("#theme-tab", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    }),
    rotationLock: new DiscoScroll("#rotation-lock-tab", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    }),
    language: new DiscoScroll("#language-tab", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    }),
    easeOfAccess: new DiscoScroll("#ease-of-access-tab", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    }),
    advanced: new DiscoScroll("#advanced-tab", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    }),
    about: new DiscoScroll("#about-tab", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    }),
    appDetail: new DiscoScroll("#app-detail-tab", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    }),
}
setTimeout(() => {
    Object.values(scrollers).forEach(e => e.refresh())
}, 600);
window.appViewEvents = appViewEvents




function showPageAnim() {
    document.body.classList.add("shown")
    clearTimeout(window.activeTabScrollTimeout)
    setTimeout(() => {
        document.querySelectorAll("div.disco-list-view.skew").forEach(listView => listView.classList.remove("skew"))
    }, 2000 * animationDurationScale);
    window.activeTabScrollTimeout = setTimeout(() => {
        activeTabScroll()
    }, 500 * animationDurationScale);
}


window.animPlaying = false
const navigation = {
    goToPage: (index) => {
        animPlaying = true
        document.querySelector("div.innerApp").classList.remove("shown-page")
        document.querySelector("div.innerApp").classList.add("hidden-page")
        document.querySelectorAll("div.innerAppPage")[index].classList.add("shown-page")
        document.querySelectorAll("div.innerAppPage")[index].classList.remove("hidden-page")
        setTimeout(() => {
            document.querySelector("div.innerApp").style.setProperty("flexGrow", 0)
        }, 150);
        setTimeout(() => {
            document.querySelectorAll("div.innerAppPage")[index].classList.add("shown-page-no-anim")
        }, 750);
        if (window.parent.DiscoBoard) window.parent.DiscoBoard.backendMethods.navigation.push("settings-inner-page", () => { }, () => {
            navigation.settingsHome()
        }, false)
    },

    settingsHome: () => {
        animPlaying = true
        setTimeout(() => {
            animPlaying = false
        }, 1000 * animationDurationScale);
        const beforePage = document.querySelector("div.shown-page")
        document.querySelectorAll("div.shown-page").forEach(e => { e.classList.remove("shown-page"); e.classList.remove("shown-page-no-anim"); })
        beforePage.classList.add("hidden-page")
        setTimeout(() => {
            document.querySelector("div.innerApp").classList.remove("hidden-page")
            document.querySelector("div.innerApp").classList.add("shown-page")
        }, 150);
    }
}
window.pageNavigation = navigation
$("#home-tab > div > div.disco-list-view > div.disco-list-view-item").on("flowClick", e => {
    navigation.goToPage($(e.target).index())
})

window.Disco = window.Disco || window.parent.Disco

import "./pages/00_home+theme"
import "./pages/01_screen_rotation"
import "./pages/02_language"
import "./pages/03_ease_of_access"
import "./pages/04_advanced"
import "./pages/05_about"
import "./pages/10_applications"
//i18n.translateDOM()
requestAnimationFrame(() => {
    showPageAnim()
});
