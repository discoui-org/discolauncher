/**
 * @name string Notifications and media
 * @provide type all
 * @author string cherryhoax
 * @description string Displays per-app notifications and prioritizes actively playing media.
 * @permission NOTIFICATIONS
 * @activation string dynamic
 * @minVersion number 55
 * @targetVersion number 55
 */

importScripts('./../../dist/liveTileHelper.js');

let packageName = null;
let notifications = [];
let rotationTimer = null;
let canRotate = false;

function escapeHTML(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function safeBackgroundURL(value) {
    try {
        const url = new URL(String(value ?? ''));
        return url.protocol === 'https:' ? url.href.replace(/["'\\\n\r]/g, '') : '';
    } catch (_) {
        return '';
    }
}

function isMediaNotification(notification) {
    return notification.song && Object.keys(notification.song).length > 0;
}

function scheduleRotation(initial = false) {
    clearTimeout(rotationTimer);
    rotationTimer = null;
    if (!canRotate) return;

    rotationTimer = setTimeout(() => {
        rotationTimer = null;
        if (!canRotate) return;
        liveTileHelper.requestGoToNextPage();
        scheduleRotation();
    }, 7000 + (initial ? Math.random() * 2000 : 0));
}

function createMediaTile(tileFeed, notification) {
    const song = notification.song;
    const songName = escapeHTML(song.songName || notification.title || 'Unknown track');
    const artist = escapeHTML(song.artist || song.albumName || '');
    const albumCover = safeBackgroundURL(song.albumCover);
    const fallbackIcon = `https://appassets.androidplatform.net/assets/icons/${encodeURIComponent(packageName)}.webp`;

    return tileFeed.Tile(
        `<div class="live-tile-media-content">
            ${albumCover ? '' : `<img class="live-tile-media-fallback-icon" src="${fallbackIcon}" alt="">`}
            <p class="live-tile-media-title">${songName}</p>
            <p class="live-tile-media-artist">${artist}</p>
        </div>`,
        albumCover ? `url('${albumCover}')` : ''
    );
}

function createNotificationTile(tileFeed, notification) {
    const title = escapeHTML(notification.title || notification.appLabel || 'Notification');
    const description = escapeHTML(notification.description || notification.longDescription || '');

    return tileFeed.Tile(
        `<div class="live-tile-notification-content">
            <p class="live-tile-notification-title">${title}</p>
            <p class="live-tile-notification-description">${description}</p>
        </div>`
    );
}

function draw() {
    const appNotifications = notifications
        .filter(notification => notification.packageName === packageName && !notification.isGroupSummary)
        .sort((a, b) => Number(b.postTime || 0) - Number(a.postTime || 0));
    const activeMedia = appNotifications.find(notification =>
        isMediaNotification(notification) && notification.song.isPlaying === true
    );
    const regularNotifications = appNotifications.filter(notification => !isMediaNotification(notification));
    // A notification tile has a summary page before its notification pages.
    // Media-only feeds contain one page, so they do not need rotation.
    canRotate = regularNotifications.length > 0;
    scheduleRotation(true);
    const tileFeed = new liveTileHelper.TileFeed({
        active: Boolean(activeMedia || regularNotifications.length),
        type: activeMedia ? liveTileHelper.TileType.CAROUSEL : liveTileHelper.TileType.NOTIFICATION,
        animationType: activeMedia ? liveTileHelper.AnimationType.SLIDE : liveTileHelper.AnimationType.FLIP,
        showAppTitle: !activeMedia,
        notificationCount: regularNotifications.length,
        duration: 7000
    });

    if (activeMedia) {
        tileFeed.addTile(createMediaTile(tileFeed, activeMedia));
    }
    regularNotifications.forEach(notification => {
        tileFeed.addTile(createNotificationTile(tileFeed, notification));
    });
    return tileFeed;
}

liveTileHelper.eventListener.on('draw', draw);

liveTileHelper.eventListener.on('init', data => {
    packageName = data.packageName;
});

liveTileHelper.eventListener.on('notificationsdata', data => {
    notifications = Array.isArray(data.notifications) ? data.notifications : [];
    liveTileHelper.requestRedraw();
});
