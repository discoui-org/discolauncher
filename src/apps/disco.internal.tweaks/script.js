const windowInsets = () => ({ top: 0, left: 0, right: 0, bottom: 0 })
import { applyOverscroll, appViewEvents, discoColors, discoThemes, setAccentColor } from "../../scripts/shared/internal-app";
import imageStore from "../../scripts/imageStore";
import { DiscoScroll } from "../../scripts/overscrollFramework";
import createInternalAppTabSlider from "../../scripts/shared/internalAppTabSlider";
import fontStore from "../../scripts/fontStore";
import $ from "../../scripts/dom";
import i18n from "../../scripts/localeManager";
import DiscoElements from "../../scripts/DiscoElements";
const emptyResponses = [
    "Wow, it sure is quite lonely here!",
    "Feels a bit quiet in this space.",
    "Looks like there’s no one around.",
    "Kind of quiet here, huh?",
    "Feels a little empty right now.",
    "Not much happening here, is there?",
    "Looks like you’re on your own for now.",
    "Seems a bit deserted in this spot.",
    "Feels a bit lonesome here.",
    "It's pretty quiet around here."
]
window.i18n = i18n
await i18n.init()
await i18n.translateDOM()
window.fontStore = fontStore
const { activeTabScroll } = createInternalAppTabSlider({
    onPageChange: (index) => appBar.setState(index === 0 ? 1 : 0)
})
window.scrollers = {
    styles: new DiscoScroll("#styles-tab", {
        bounceTime: 300,
        swipeBounceTime: 200,
        outOfBoundaryDampingFactor: 1,
        scrollbar: true
    })
}
setTimeout(() => {
    Object.values(scrollers).forEach(e => e.refresh())
}, 600);
window.appViewEvents = appViewEvents




function showPageAnim() {
    document.body.classList.add("shown")
    clearTimeout(window.activeTabScrollTimeout)
    document.querySelectorAll("div.disco-list-view.skew").forEach(listView => listView.classList.remove("skew"))
    setTimeout(() => {
        document.querySelectorAll("div.disco-list-view.skew").forEach(listView => listView.classList.remove("skew"))
    }, 2000 * animationDurationScale);
    window.activeTabScrollTimeout = setTimeout(() => {
        activeTabScroll()
    }, 500 * animationDurationScale);
    document.querySelector("#splashscreen").classList.add("shown")
    setTimeout(() => {
        document.querySelector("div.innerApp").style.removeProperty("visibility")
        document.querySelector("div.innerApp").classList.add("shown")
        document.querySelector("#splashscreen").remove()
        try {
            appBar.setState(1)
        } catch (error) {

        }
    }, 1000);
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
$("#styles-tab > div > div.disco-list-view > div.disco-list-view-item").on("flowClick", e => {
    navigation.goToPage($(e.target).index())
})

window.Disco = window.Disco || window.parent.Disco

//i18n.translateDOM()
requestAnimationFrame(() => {
    showPageAnim()
});
import styleManager from "../../scripts/styleManager";
const styleManagerInstance = new styleManager();
window.styleManagerInstance = styleManagerInstance
if (new URL(location.href).searchParams.get("launchArgs") != null) {
    const launchArgs = new URL("disco:?" + new URL(location.href).searchParams.get("launchArgs").replaceAll("\"", ""))
    console.log(launchArgs)
    setTimeout(() => {
        if (launchArgs.searchParams.get("installStyle")) {
            console.log("installing style", launchArgs.searchParams.get("installStyle"))
            fetch(decodeURIComponent(launchArgs.searchParams.get("installStyle")))
                .then(response => response.text())
                .then(cssText => {

                    console.log("css", cssText)


                    // Regular expressions to extract metadata
                    const titleMatch = cssText.match(/\/\* title: (.*?) \*\//);
                    const authorMatch = cssText.match(/\/\* author: (.*?) \*\//);
                    const iconMatch = cssText.match(/\/\* icon: (.*?) \*\//);
                    const descriptionMatch = cssText.match(/\/\* description: (.*?) \*\//);

                    let metadata = {
                        title: titleMatch ? titleMatch[1] : 'No title',
                        author: authorMatch ? authorMatch[1] : 'No author',
                        icon: iconMatch ? iconMatch[1] : 'No icon',
                        description: descriptionMatch ? descriptionMatch[1] : 'No description',
                    };
                    const flyout = document.createElement("div")
                    flyout.classList.add("install-flyout")
                    const author = metadata.author.match(/\[(.*?)\]\((.*?)\)/);
                    const authorHTML = author ? author[1] : metadata.author;

                    flyout.innerHTML = `
                <div class="install-flyout-inner">
                <img class="install-flyout-icon" src="${metadata.icon}">
                <p class="install-flyout-title">${metadata.title}</p>
                <p class="install-flyout-author">${authorHTML}</p>
                <p class="install-flyout-description">${metadata.description}</p>
                <button class="install-flyout-install">Install</button>
                </div>
                `
                    if (author) {
                        flyout.querySelector("p.install-flyout-author").addEventListener("click", () => {
                            parent.DiscoBoard.alert("External Link Warning", "This link opens up an external website. Proceed with caution.", [{
                                title: "Proceed", style: "default", action: () => {
                                    Disco.openURL(author[2])
                                }
                            }, { title: "Cancel", style: "default", action: () => { } }])
                        })
                    }
                    window.parent.DiscoBoard.backendMethods.navigation.push("appMenuOpened", () => { }, () => {
                        flyout.classList.add("hidden")
                        setTimeout(() => {
                            flyout.remove()
                        }, 500);
                    })
                    flyout.querySelector("button.install-flyout-install").addEventListener("click", async (e) => {
                        e.target.innerText = "Installing..."
                        try {
                            styleManagerInstance.installStyle(cssText)
                            flyout.remove()
                            parent.DiscoBoard.alert("Style Installed", "The style has been installed successfully.", [{
                                title: "OK", style: "default", action: () => {
                                    refreshList();
                                    window.parent.DiscoBoard.backendMethods.refreshStyles();
                                }
                            }])
                            refreshList()
                            window.parent.DiscoBoard.backendMethods.refreshStyles()
                        } catch (error) {
                            parent.DiscoBoard.alert("Error", "An error occurred while installing the style. Please try again later.", [{ title: "OK", style: "default", action: () => { } }])

                        }

                    })
                    document.body.appendChild(flyout)
                    console.log("metadata", metadata)
                })
                .catch(error => console.error('Error loading CSS:', error));
        }
    }, 1000);

    //alert("aldım bak")

}

function appMenuClean() {
    parent.DiscoBoard.backendMethods.navigation.invalidate("tweaksContextMenuOn")

    clearTimeout(window.appMenuCreationFirstTimeout)
    clearTimeout(window.appMenuCreationSecondTimeout)
    $("div.innerApp").removeClass("app-menu-back-intro")
    $("div.disco-list-view-item").css("visibility", "")
    $("div.app-tile-clone").remove()
}
function appImmediateClose() {
    $("div.disco-list-view-item").each((index, element) => {
        if (element["appMenuState"] == false) {
            if (element["appMenu"]) element["appMenu"].remove()
            delete element["appMenuState"]
            delete element["appMenu"]
            delete element["appRect"]
            appMenuClean()

        }
    })
}
scrollers.styles.scroller.hooks.on('scrollStart', appImmediateClose)

function contextMenuClose() {
    parent.DiscoBoard.backendMethods.navigation.invalidate("tweaksContextMenuOn")
    clearTimeout(window.contextMenuCreationFirstTimeout)
    clearTimeout(window.contextMenuCreationSecondTimeout)
    $("div.disco-app-menu").remove()
    $("div.innerApp").removeClass("app-menu-back app-menu-back-intro")
    setTimeout(() => {
        appMenuClean()
        //stickyLetter(-scrollers.app_page_scroller.y)
    }, 500);
}
window.contextMenuClose = contextMenuClose
function refreshList(soft = false) {
    const metadata = styleManagerInstance.getMetadata()
    const listView = document.querySelector("#styles-tab > div.disco-list-view")
    if (!soft) listView.innerHTML = ""
    if (Object.keys(metadata).length && !soft) {
        Object.entries(metadata).forEach(([id, data]) => {
            const author = (data["author"] || "No author").match(/\[(.*?)\]\((.*?)\)/);
            const authorHTML = author ? author[1] : metadata.author;
            const currentItem = DiscoElements.wListViewItem(
                data["title"] || "No title",
                authorHTML
            )
            currentItem.style_id = id
            //currentItem.addEventListener("flowClick", onItemClick)
            addListItemEventHandlers(currentItem)
            listView.append(currentItem)
        })
    } else {
        listView.innerHTML = "<p style='font-size: 30px; font-weight: 200; opacity: .6;'></p>"
        listView.querySelector("p").innerText = emptyResponses[Math.floor(Math.random() * emptyResponses.length)]
    }
}
window.refreshList = refreshList
refreshList()
function createContextMenu(ell) {
    var entries = {}
    if (Object.keys(styleManagerInstance.getMetadata()).length >= 2) entries["move to top"] = () => { }
    entries["remove"] = () => {
        contextMenuClose()
        document.querySelectorAll("div.app-tile-clone").forEach(e => e.remove())
        styleManagerInstance.removeStyle(ell.style_id)
        refreshList()
        ell.remove()
        window.parent.DiscoBoard.backendMethods.refreshStyles()
    }
    const el = DiscoElements.wContextMenu(ell, entries);
    document.querySelector("body").appendChild(el);
    return el;
}
$("div.innerApp").on("flowClick", function (e) {
    if (e.target.classList.contains("app-menu-back") || e.target.classList.contains("app-menu-back-intro")) {
        contextMenuClose()
    }
})
$(window).on("pointerup", function (e) {
    $("div.disco-list-view-item").each((index, element) => {
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
function addListItemEventHandlers(el) {
    el.addEventListener("pointerdown", () => {
        const e = {
            target: el
        }
        el.appMenu = false
        el.appMenuState = false
        el.appRect = e.target.getBoundingClientRect()

        clearTimeout(window.appMenuCreationFirstTimeout)
        clearTimeout(window.appMenuCreationSecondTimeout)
        $("div.disco-app-menu").remove()

        window.appMenuCreationFirstTimeout = setTimeout(() => {
            $("div.innerApp").addClass("app-menu-back-intro")
            const appMenu = createContextMenu(el)
            const optionalTop = (e.target.offsetTop + scrollers.styles.y + 64 + 83 + 5 + 90)
            appMenu.style.top = ((optionalTop + 154 >= window.innerHeight - windowInsets().bottom) ? optionalTop - 64 - 0 : optionalTop) + "px"
            appMenu.style.setProperty("--pointerX", e.pageX /*- $("div.app-list-page").position().left*/ + "px")
            appMenu.classList.add("intro")
            const appClone = e.target.cloneNode(true)
            appClone.setAttribute("style", appClone.getAttribute("style") + "transition-duration: 1s !important;")
            $(appClone).addClass("app-tile-clone").css({
                left: el.appRect.left /*- $("div.app-list-page").position().left*/,
                top: el.appRect.top - 5
            })
            $("body").append(appClone)
            setTimeout(() => {
                appClone.classList.remove("active")
            }, 0);
            el.style.visibility = "hidden"

            if (optionalTop + 154 >= window.innerHeight - windowInsets().bottom) appMenu.classList.add("intro-bottom")

            el.appMenu = appMenu
            parent.DiscoBoard.backendMethods.navigation.push("tweaksContextMenuOn", () => { }, () => {
                contextMenuClose()
            })
            setTimeout(() => {
                Disco.triggerHapticFeedback("CLOCK_TICK")
            }, 300);
            window.appMenuCreationSecondTimeout = setTimeout(() => {
                $("div.innerApp").addClass("app-menu-back").removeClass("app-menu-back-intro")
                e.target.appMenuState = true
                scrollers.styles.cancelScroll()
                setTimeout(() => {
                    Disco.triggerHapticFeedback("CONFIRM")
                }, 50);
            }, 375);

        }, 500);
    })
}
refreshList()
function onItemClick(el) {
    const item = el.target
    if (item.classList.contains("expanded")) {
        item.classList.remove("expanded")
        item.querySelector(".expanded-panel")?.remove()
        setTimeout(() => {
            Disco.triggerHapticFeedback("CONFIRM")
        }, 250);
    } else {
        document.querySelectorAll(".disco-list-view-item.expanded").forEach(expandedItem => {
            expandedItem.classList.remove("expanded")
            expandedItem.querySelector(".expanded-panel")?.remove()
        })

        item.classList.add("expanded")
        item.innerHTML += `
                <div class="expanded-panel" style="padding-bottom: 16px; pointer-events: none;">
                    <button class="metro-button spinner" style="margin-left: auto;pointer-events: auto;">
                        Remove
                    </button>
                </div>
            `
        item.querySelector(".metro-button").addEventListener("flowClick", async (e) => {
            styleManagerInstance.removeStyle(item.style_id)
            item.remove()
            refreshList(true)
            window.parent.DiscoBoard.backendMethods.refreshStyles()
        })

        setTimeout(() => {
            Disco.triggerHapticFeedback("CONFIRM")
            setTimeout(() => {
                Disco.triggerHapticFeedback("CLOCK_TICK")
            }, 125);
        }, 250);
    }
}
function addManually() {
    var alertView;
    alertView = window.parent.DiscoBoard.alert(
        "Enter the style url",
        "<input type='url' placeholder='style url' class='metro-text-input enter-style-url' style='width:100%;'>",
        [{
            title: "add", style: "default", inline: true, action: () => {
                const url = alertView.querySelector("input.enter-style-url").value
                if (url.endsWith(".css")) {
                    fetch(url)
                        .then(response => response.text().then(cssText => ({ cssText, response })))
                        .then(({ cssText, response }) => {
                            //check if response code is successful
                            if (!response.ok) {
                                //show a different error about network problem
                                parent.DiscoBoard.alert("Error", "An error occurred while loading the CSS file. Please check the URL and try again.", [{ title: "OK", style: "default", action: () => { } }])
                                return;
                            }

                            // Regular expressions to extract metadata
                            const titleMatch = cssText.match(/\/\* title: (.*?) \*\//);
                            const authorMatch = cssText.match(/\/\* author: (.*?) \*\//);
                            const iconMatch = cssText.match(/\/\* icon: (.*?) \*\//);
                            const descriptionMatch = cssText.match(/\/\* description: (.*?) \*\//);

                            let metadata = {
                                title: titleMatch ? titleMatch[1] : 'No title',
                                author: authorMatch ? authorMatch[1] : 'No author',
                                icon: iconMatch ? iconMatch[1] : 'No icon',
                                description: descriptionMatch ? descriptionMatch[1] : 'No description',
                            };
                            const flyout = document.createElement("div")
                            flyout.classList.add("install-flyout")
                            const author = metadata.author.match(/\[(.*?)\]\((.*?)\)/);
                            const authorHTML = author ? author[1] : metadata.author;

                            flyout.innerHTML = `
                            <div class="install-flyout-inner">
                            <img class="install-flyout-icon" src="${metadata.icon}">
                            <p class="install-flyout-title">${metadata.title}</p>
                            <p class="install-flyout-author">${authorHTML}</p>
                            <p class="install-flyout-description">${metadata.description}</p>
                            <button class="install-flyout-install">Install</button>
                            </div>
                            `
                            if (author) {
                                flyout.querySelector("p.install-flyout-author").addEventListener("click", () => {
                                    parent.DiscoBoard.alert("External Link Warning", "This link opens up an external website. Proceed with caution.", [{
                                        title: "Proceed", style: "default", action: () => {
                                            Disco.openURL(author[2])
                                        }
                                    }, { title: "Cancel", style: "default", action: () => { } }])
                                })
                            }
                            window.parent.DiscoBoard.backendMethods.navigation.push("appMenuOpened", () => { }, () => {
                                flyout.classList.add("hidden")
                                setTimeout(() => {
                                    flyout.remove()
                                }, 500);
                            })
                            flyout.querySelector("button.install-flyout-install").addEventListener("click", async (e) => {
                                e.target.innerText = "Installing..."
                                try {
                                    styleManagerInstance.installStyle(cssText)
                                    flyout.remove()
                                    parent.DiscoBoard.alert("Style Installed", "The style has been installed successfully.", [{
                                        title: "OK", style: "default", action: () => {
                                            refreshList(); window.parent.DiscoBoard.backendMethods.refreshStyles()
                                        }
                                    }])
                                    refreshList()
                                    window.parent.DiscoBoard.backendMethods.refreshStyles()
                                } catch (error) {
                                    parent.DiscoBoard.alert("Error", "An error occurred while installing the style. Please try again later.", [{ title: "OK", style: "default", action: () => { } }])

                                }

                            })
                            document.body.appendChild(flyout)
                        })
                        .catch(error => {
                            console.error('Error loading CSS:', error)
                            parent.DiscoBoard.alert("Error", "An error occurred while loading the CSS file. Please check the URL and try again.", [{ title: "OK", style: "default", action: () => { } }])
                        });
                } else {
                    parent.DiscoBoard.alert("Error", "The URL you entered is not a valid CSS file.", [{ title: "OK", style: "default", action: () => { } }])
                }

            }
        },
        {
            title: "cancel", style: "default", inline: true, action: () => { }
        }]
    );
    setTimeout(() => {
        alertView.querySelector("input.enter-style-url").focus()
    }, 250);
}
function writeManually() {
    const flyout = document.createElement("div");
    flyout.classList.add("install-flyout", "manual-write-flyout");
    flyout.innerHTML = `
        <div class="install-flyout-inner">
            <div class="manual-css-editor">
                <p class="install-flyout-title">Write or Paste CSS</p>
                <textarea class="manual-css-input" aria-label="CSS" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Paste your CSS here..."></textarea>
            </div>
            <div class="manual-css-actions">
                <button class="install-flyout-cancel metro-button">Cancel</button>
                <button class="install-flyout-install metro-button">Apply</button>
            </div>
        </div>
    `;
    document.body.appendChild(flyout);

    // Focus textarea
    setTimeout(() => {
        flyout.querySelector("textarea.manual-css-input").focus();
    }, 200);

    // Helper to close flyout
    function closeFlyout() {
        flyout.classList.add("hidden");
        setTimeout(() => flyout.remove(), 400);
        window.parent.DiscoBoard.backendMethods.navigation.invalidate("manualWriteFlyout");
        window.removeEventListener("popstate", onBack);
    }

    // Cancel button
    flyout.querySelector(".install-flyout-cancel").addEventListener("click", () => {
        const cssText = flyout.querySelector("textarea.manual-css-input").value.trim();
        if (cssText) {
            parent.DiscoBoard.alert(
                "Discard Edits?",
                "You have unsaved changes. Discard them?",
                [
                    {
                        title: "Discard", style: "destructive", action: () => closeFlyout()
                    },
                    {
                        title: "Cancel", style: "default", action: () => {
                            // Add back to DiscoBoard navigation history
                            if (window.parent.DiscoBoard?.backendMethods?.navigation?.push) {
                                window.parent.DiscoBoard.backendMethods.navigation.push(
                                    "manualWriteFlyout",
                                    () => { },
                                    () => { onBack(); }
                                );
                            }
                        }
                    }
                ]
            );
        } else {
            closeFlyout();
        }
    });

    // Apply button
    flyout.querySelector(".install-flyout-install").addEventListener("click", async (e) => {
        const cssText = flyout.querySelector("textarea.manual-css-input").value.trim();
        if (!cssText) {
            parent.DiscoBoard.alert("Error", "Please enter some CSS.", [{ title: "OK", style: "default", action: () => { } }]);
            return;
        }
        e.target.innerText = "Installing...";
        try {
            styleManagerInstance.installStyle(cssText);
            closeFlyout();
            parent.DiscoBoard.alert("Style Installed", "The style has been installed successfully.", [{
                title: "OK", style: "default", action: () => {
                    refreshList();
                    window.parent.DiscoBoard.backendMethods.refreshStyles();
                }
            }]);
            refreshList();
            window.parent.DiscoBoard.backendMethods.refreshStyles();
        } catch (error) {
            parent.DiscoBoard.alert("Error", "An error occurred while installing the style. Please try again later.", [{ title: "OK", style: "default", action: () => { } }]);
        }
    });

    // Back button support
    function onBack() {
        const cssText = flyout.querySelector("textarea.manual-css-input").value.trim();
        if (cssText) {
            parent.DiscoBoard.alert(
                "Discard Edits?",
                "You have unsaved changes. Discard them?",
                [
                    {
                        title: "Discard", style: "destructive", action: () => {
                            closeFlyout();
                            history.back();
                        }
                    },
                    {
                        title: "Cancel", style: "default", action: () => {
                            // push state again to keep flyout open and add back to DiscoBoard navigation history
                            history.pushState({}, "");
                            if (window.parent.DiscoBoard?.backendMethods?.navigation?.push) {
                                window.parent.DiscoBoard.backendMethods.navigation.push(
                                    "manualWriteFlyout",
                                    () => { },
                                    () => { onBack(); }
                                );
                            }
                        }
                    }
                ]
            );
        } else {
            closeFlyout();
            history.back();
        }
    }

    // Register with DiscoBoard navigation stack if available
    if (window.parent.DiscoBoard?.backendMethods?.navigation?.push) {
        window.parent.DiscoBoard.backendMethods.navigation.push(
            "manualWriteFlyout",
            () => { },
            () => {
                onBack();
            }
        );
    }
}
function addFile() {
    // Open a file selector for .css files
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.css,text/css';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            input.remove();
            return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
            const cssText = e.target.result;
            // Try to extract metadata
            const titleMatch = cssText.match(/\/\* title: (.*?) \*\//);
            const authorMatch = cssText.match(/\/\* author: (.*?) \*\//);
            const iconMatch = cssText.match(/\/\* icon: (.*?) \*\//);
            const descriptionMatch = cssText.match(/\/\* description: (.*?) \*\//);

            let metadata = {
                title: titleMatch ? titleMatch[1] : 'No title',
                author: authorMatch ? authorMatch[1] : 'No author',
                icon: iconMatch ? iconMatch[1] : 'No icon',
                description: descriptionMatch ? descriptionMatch[1] : 'No description',
            };
            const flyout = document.createElement("div");
            flyout.classList.add("install-flyout");
            const author = metadata.author.match(/\[(.*?)\]\((.*?)\)/);
            const authorHTML = author ? author[1] : metadata.author;

            flyout.innerHTML = `
                <div class="install-flyout-inner">
                <img class="install-flyout-icon" src="${metadata.icon}">
                <p class="install-flyout-title">${metadata.title}</p>
                <p class="install-flyout-author">${authorHTML}</p>
                <p class="install-flyout-description">${metadata.description}</p>
                <button class="install-flyout-install">Install</button>
                </div>
            `;
            if (author) {
                flyout.querySelector("p.install-flyout-author").addEventListener("click", () => {
                    parent.DiscoBoard.alert("External Link Warning", "This link opens up an external website. Proceed with caution.", [{
                        title: "Proceed", style: "default", action: () => {
                            Disco.openURL(author[2])
                        }
                    }, { title: "Cancel", style: "default", action: () => { } }])
                })
            }
            window.parent.DiscoBoard.backendMethods.navigation.push("appMenuOpened", () => { }, () => {
                flyout.classList.add("hidden")
                setTimeout(() => {
                    flyout.remove()
                }, 500);
            })
            flyout.querySelector("button.install-flyout-install").addEventListener("click", async (e) => {
                e.target.innerText = "Installing..."
                try {
                    styleManagerInstance.installStyle(cssText)
                    flyout.remove()
                    parent.DiscoBoard.alert("Style Installed", "The style has been installed successfully.", [{
                        title: "OK", style: "default", action: () => {
                            refreshList();
                            window.parent.DiscoBoard.backendMethods.refreshStyles();
                        }
                    }])
                    refreshList()
                    window.parent.DiscoBoard.backendMethods.refreshStyles()
                } catch (error) {
                    parent.DiscoBoard.alert("Error", "An error occurred while installing the style. Please try again later.", [{ title: "OK", style: "default", action: () => { } }])
                }
            });
            document.body.appendChild(flyout);
            input.remove();
        };
        reader.readAsText(file);
    });

    input.click();
}
const iconPackPicker = document.getElementById("icon-pack-picker")

function addIconPack() {
    iconPackPicker.querySelector("div.disco-list-view div").innerHTML = ""
    const iconPacks = JSON.parse(Disco.getIconPacks())
    iconPacks.forEach((iconPack, index) => {
        const iconPackInfo = window.parent.DiscoBoard.backendMethods.getAppDetails(iconPack, true);
        const iconPackItem = DiscoElements.wListViewItem(iconPackInfo.label, "")
        const iconPackImage = document.createElement("img")
        iconPackImage.src = JSON.parse(window.parent.Disco.getAppIconURL(iconPack)).foreground
        iconPackImage.style.cssText = `
        background-image: url(${JSON.parse(window.parent.Disco.getAppIconURL(iconPack)).background});
        background-size: cover;
        background-position: center;
        `
        iconPackItem.prepend(iconPackImage)
        iconPackPicker.querySelector("div.disco-list-view div").appendChild(iconPackItem)
    })


    clearTimeout(window.iconPackPickerTimeout)
    iconPackPicker.classList.add("shown-animation", "shown")
    window.parent.DiscoBoard.backendMethods.navigation.push("settings-inner-page:accent-color-picker", () => { }, () => {
        clearTimeout(window.iconPackPickerTimeout)
        iconPackPicker.classList.remove("shown")
        iconPackPicker.classList.add("hidden")
        window.iconPackPickerTimeout = setTimeout(() => {
            iconPackPicker.classList.remove("shown-animation", "hidden")

        }, 500 * animationDurationScale);
        Array.from({ length: 6 }, (_, i) => {
            setTimeout(() => {
                Disco.triggerHapticFeedback("CLOCK_TICK");
            }, (i * 20 + 60) * window.parent.DiscoBoard.backendMethods.animationDurationScale.get());
        });
    })
    Array.from({ length: 6 }, (_, i) => {
        setTimeout(() => {
            Disco.triggerHapticFeedback("CLOCK_TICK");
        }, i * 20 * window.parent.DiscoBoard.backendMethods.animationDurationScale.get());
    });

}
const appBar = DiscoElements.wAppBar([
    {
        title: "Add", icon: "󰐕", size: "38px", action: addManually
    },
    {
        title: "Add File", icon: "󰁦", size: "38px", action: addFile
    },
    {
        title: "Edit", icon: "󰲶", action: writeManually
    }
])
const appBar2 = DiscoElements.wAppBar([
    {
        title: "Add", icon: "󰐕", size: "38px", action: addIconPack
    }
])
document.body.append(appBar)
document.body.append(appBar2)
window.appBar = appBar
window.appBar2 = appBar2

// Global tile preferences functionality
function initializeGlobalTilePreferences() {
    setupGlobalIconDropdown();
    setupGlobalBackgroundDropdown();
    setupGlobalTextColorDropdown();
}

function setupGlobalIconDropdown() {
    const iconDropdown = document.getElementById("global-icon-dropdown");

    // Clear existing options except the first "Default" option
    const defaultOption = iconDropdown.querySelector("div.metro-dropdown-option[value='default']");
    iconDropdown.innerHTML = "";
    iconDropdown.appendChild(defaultOption);

    // Add monochrome option if supported
    if (window.parent.Disco.supportsMonochromeIcons()) {
        const monochromeOption = document.createElement("div");
        monochromeOption.classList.add("metro-dropdown-option");
        monochromeOption.setAttribute("value", "monochrome");
        monochromeOption.setAttribute("data-i18n", "settings.apps.icon_selections.monochrome");
        monochromeOption.innerText = "Monochrome";
        iconDropdown.appendChild(monochromeOption);
    } else {
    }

    // Add icon pack options
    try {
        const iconPacks = JSON.parse(Disco.getIconPacks());
        iconPacks.forEach(iconPack => {
            const iconPackInfo = window.parent.DiscoBoard.backendMethods.getAppDetails(iconPack, true);
            const option = document.createElement("div");
            option.classList.add("metro-dropdown-option");
            option.setAttribute("value", iconPack);
            option.innerText = iconPackInfo.label;
            iconDropdown.appendChild(option);
        });
    } catch (error) {
        console.log("Error loading icon packs:", error);
    }

    // Load saved preference
    const savedIconPref = getGlobalTilePreference("icon");
    const options = iconDropdown.querySelectorAll("div.metro-dropdown-option");
    let selectedIndex = 0;
    options.forEach((option, index) => {
        if (option.getAttribute("value") === savedIconPref) {
            selectedIndex = index;
        }
    });
    iconDropdown.setAttribute("selected", selectedIndex);
    iconDropdown.selectOption(selectedIndex);

    // Handle dropdown changes
    iconDropdown.addEventListener('selected', (e) => {
        const selectedOption = options[e.detail.index];
        const value = selectedOption.getAttribute("value");

        setGlobalTilePreference("icon", value);

        // Apply legacy behavior for icon packs
        if (value !== "default" && value !== "monochrome") {
            localStorage.setItem("iconPack", value);
            Disco.applyIconPack(value);
            window.parent.DiscoBoard.alert(
                "Notice",
                "You need to restart the app to apply the icon pack.",
                [{
                    title: "Ok", style: "default", action: () => {
                        window.parent.location.reload()
                    }
                },
                { title: "Later", style: "default", action: () => { } }
                ]
            );
        } else if (value === "default") {
            localStorage.setItem("iconPack", "");
            Disco.applyIconPack("");
            window.parent.DiscoBoard.alert(
                "Notice",
                "You need to restart the app to apply the icon pack.",
                [{
                    title: "Ok", style: "default", action: () => {
                        window.parent.location.reload()
                    }
                },
                { title: "Later", style: "default", action: () => { } }
                ]
            );
        }

        // Apply monochrome setting
        if (value === "monochrome") {
            localStorage.setItem("monochromeIcons", "enable");
            if (window.Disco && window.Disco.setMonochromeIcons) {
                window.Disco.setMonochromeIcons(true);
            }
        } else {
            localStorage.setItem("monochromeIcons", "default");
            if (window.Disco && window.Disco.setMonochromeIcons) {
                window.Disco.setMonochromeIcons(false);
            }
        }
    });
}

function setupGlobalBackgroundDropdown() {
    const backgroundDropdown = document.getElementById("global-background-dropdown");

    // Load saved preference
    const savedBackgroundPref = getGlobalTilePreference("background");
    const options = backgroundDropdown.querySelectorAll("div.metro-dropdown-option");
    let selectedIndex = 0;
    options.forEach((option, index) => {
        if (option.getAttribute("value") === savedBackgroundPref) {
            selectedIndex = index;
        }
    });
    backgroundDropdown.setAttribute("selected", selectedIndex);
    backgroundDropdown.selectOption(selectedIndex);

    // Handle dropdown changes
    backgroundDropdown.addEventListener('selected', (e) => {
        const selectedOption = options[e.detail.index];
        const value = selectedOption.getAttribute("value");
        //console.log("Global background preference changed to:", value);
        setGlobalTilePreference("background", value);
    });
}

function setupGlobalTextColorDropdown() {
    const textColorDropdown = document.getElementById("global-text-color-dropdown");

    // Load saved preference
    const savedTextColorPref = getGlobalTilePreference("textColor");
    const options = textColorDropdown.querySelectorAll("div.metro-dropdown-option");
    let selectedIndex = 0;
    options.forEach((option, index) => {
        if (option.getAttribute("value") === savedTextColorPref) {
            selectedIndex = index;
        }
    });
    textColorDropdown.setAttribute("selected", selectedIndex);
    textColorDropdown.selectOption(selectedIndex);

    // Handle dropdown changes
    textColorDropdown.addEventListener('selected', (e) => {
        const selectedOption = options[e.detail.index];
        const value = selectedOption.getAttribute("value");
        //console.log("Global text color preference changed to:", value);
        setGlobalTilePreference("textColor", value);
    });
}

function getGlobalTilePreference(key) {
    if (!localStorage["globalTilePreferences"]) {
        localStorage["globalTilePreferences"] = JSON.stringify({
            icon: "default",
            background: "default",
            textColor: "default"
        });
    }
    const prefs = JSON.parse(localStorage["globalTilePreferences"]);
    return prefs[key] || "default";
}

function setGlobalTilePreference(key, value) {
    if (!localStorage["globalTilePreferences"]) {
        localStorage["globalTilePreferences"] = JSON.stringify({
            icon: "default",
            background: "default",
            textColor: "default"
        });
    }
    const prefs = JSON.parse(localStorage["globalTilePreferences"]);
    prefs[key] = value;
    localStorage["globalTilePreferences"] = JSON.stringify(prefs);
    //console.log("Saved global tile preference:", key, "=", value);

    // Trigger tile refresh when global preferences change
    if (window.parent) {
        window.parent.dispatchEvent(new CustomEvent('tilePreferencesChanged', {
            detail: { global: true, key, value }
        }));
        //console.log("Dispatched tilePreferencesChanged event for global preference change");
    }
}

// Initialize global tile preferences
initializeGlobalTilePreferences();
