importScripts('./../../dist/liveTileHelper.js');

let widgetProvider = null;
let snapshot = null;
let snapshotState = "pending";
let snapshotSize = { width: 800, height: 400 };

function requestSnapshot() {
    if (!widgetProvider) return;
    postMessage({
        action: "requestNativeWidgetSnapshot",
        data: { providerId: widgetProvider, width: snapshotSize.width, height: snapshotSize.height }
    });
}

function draw() {
    const feed = new liveTileHelper.TileFeed({
        type: liveTileHelper.TileType.STATIC,
        animationType: liveTileHelper.AnimationType.FLIP,
        showAppTitle: false
    });
    feed.isNativeWidget = true;
    if (snapshot) {
        feed.addTile(feed.Tile(
            `<img class="native-widget-snapshot" src="${snapshot}" alt="Native widget" style="display:block;width:100%;height:100%;object-fit:fill">`,
            "transparent"
        ));
    } else {
        const message = snapshotState === "error" ? "Widget unavailable" : "Loading widget…";
        feed.addTile(feed.Tile(`<div class="native-widget-status">${message}</div>`, "#000"));
    }
    return feed;
}

liveTileHelper.eventListener.on("init", data => {
    widgetProvider = data?.provider?.nativeWidget?.id || null;
    snapshotSize = data?.nativeWidgetSize || snapshotSize;
    requestSnapshot();
    liveTileHelper.requestRedraw();
});
liveTileHelper.eventListener.on("widgetsize", size => {
    if (!size?.width || !size?.height
            || (size.width === snapshotSize.width && size.height === snapshotSize.height)) return;
    snapshotSize = size;
    snapshotState = "pending";
    requestSnapshot();
});
liveTileHelper.eventListener.on("nativewidgetsnapshot", data => {
    snapshotState = data?.state || "error";
    // Keep the last complete image on screen while native renders a resize or
    // provider update. The next event carries a new versioned cache URL.
    if (data?.url) snapshot = data.url;
    liveTileHelper.requestRedraw();
});
liveTileHelper.eventListener.on("draw", draw);
