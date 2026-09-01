/**
 * @name string Calendar
 * @provide type calendar
 * @author string cherryhoax
 * @description string Displays today's localized weekday and date.
 * @minVersion number 55
 * @supportedSizes m,w,l
 * @targetVersion number 55
 */

importScripts('./../../dist/liveTileHelper.js');

function getCalendarDate() {
    const now = new Date();
    return {
        day: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(now),
        date: new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(now)
    };
}

function draw() {
    const calendarDate = getCalendarDate();
    const tileFeed = new liveTileHelper.TileFeed({
        type: liveTileHelper.TileType.STATIC,
        showAppTitle: false
    });

    tileFeed.addTile(tileFeed.Tile(
        `<div class="live-tile-calendar">
            <p class="live-tile-calendar-weekday">${calendarDate.day}</p>
            <p class="live-tile-calendar-date">${calendarDate.date}</p>
        </div>`
    ));
    return tileFeed;
}

function scheduleNextDayUpdate() {
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 1, 0);
    setTimeout(() => {
        liveTileHelper.requestRedraw();
        scheduleNextDayUpdate();
    }, nextDay.getTime() - now.getTime());
}

liveTileHelper.eventListener.on('draw', draw);
liveTileHelper.eventListener.on('init', () => {
    liveTileHelper.requestRedraw();
    scheduleNextDayUpdate();
});
