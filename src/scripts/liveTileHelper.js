function requestRedraw(params) {
    //console.log("Worker: Sending requestRedraw message");
    postMessage({
        action: "requestRedraw",
        data: params || {}
    });
}
function requestGoToPage(page) {
    //console.log("Worker: Sending requestGoToPage message");
    postMessage({
        action: "requestGoToPage",
        data: page
    });
}
function requestGoToNextPage() {
    // console.log("Worker: Sending requestGoToNextPage message");
    postMessage({
        action: "requestGoToNextPage",
    });
}
function requestGoToPreviousPage() {
    //console.log("Worker: Sending requestGoToPreviousPage message");
    postMessage({
        action: "requestGoToPreviousPage",
    });
}
onmessage = async function (event) {
    //console.log("Worker received message:", event.data);
    const message = event.data;

    switch (message.action) {
        case 'draw':
            const result = await eventListener.dispatch("draw", message.data);
            postMessage({ id: message.id, status: "success", result: result });
            break;
        case 'init':
            eventListener.dispatch("init", message.data);
            break;
        case 'contacts-data':
            eventListener.dispatch("contactsdata", message.data);
            break;
        case 'photos-data':
            eventListener.dispatch("photosdata", message.data);
            break;
        case 'notifications-data':
            eventListener.dispatch("notificationsdata", message.data);
            break;
        case 'weather-location':
            eventListener.dispatch("weatherlocation", message.data);
            break;
        case 'native-widget-snapshot':
            eventListener.dispatch("nativewidgetsnapshot", message.data);
            break;
        case 'widget-size':
            eventListener.dispatch("widgetsize", message.data);
            break;
        default:
            console.log("Worker: Unknown action received:", message.action);
    }
};
const eventListener = {
    events: {},  // Store events and their callbacks

    on: (event, callback) => {
        if (!eventListener.events[event]) {
            eventListener.events[event] = [];
        }
        eventListener.events[event].push(callback);
    },

    off: (event, callback) => {
        if (eventListener.events[event]) {
            eventListener.events[event] = eventListener.events[event]
                .filter(cb => cb !== callback);
        }
    },

    dispatch: async (event, data) => {
        if (eventListener.events[event]) {
            try {
                const result = await eventListener.events[event][0](data);
                return result;
            } catch (error) {
                console.error(`Error in dispatch for event '${event}':`, error);
                throw error;
            }
        }
    }
}

// Define the enum for tile types
const TileType = {
    STATIC: "static",
    CAROUSEL: "carousel",
    NOTIFICATION: "notification",
    MATRIX: "matrix"
}
const TilePresets = {

}
Object.freeze(TileType);
// Define the enum for animation types
const AnimationType = {
    FLIP: 'flip',
    SLIDE: 'slide'
}
Object.freeze(AnimationType);

class Tile {
    constructor(id, contentHTML, background) {
        this.id = id || Math.random().toString(36).substring(2, 15);
        this.contentHTML = contentHTML;
        this.background = background;
    }
}
class TileFeed {
    constructor(options = {}) {
        const defaults = {
            type: TileType.STATIC,
            animationType: AnimationType.FLIP,
            showAppTitle: true,
            duration: 5000 + Math.random() * 500,
            notificationCount: null,
            // The base beneath a provider's own surface. Providers with
            // transparent or anti-aliased artwork can request "metro".
            surfaceFallback: "accent",
            active: true
        };
        Object.assign(this, defaults, options);
        // Keep third-party providers using the old misspelled property working.
        if (this.notificationCount == null && this.noticationCount != null) {
            this.notificationCount = this.noticationCount;
        }

        if (!Object.values(TileType).includes(this.type)) {
            throw new Error(`Invalid tile type. Must be one of: ${Object.values(TileType).join(', ')}`);
        }
        if (!Object.values(AnimationType).includes(this.animationType)) {
            throw new Error(`Invalid animation type. Must be one of: ${Object.values(AnimationType).join(', ')}`);
        }
        if (!['accent', 'metro'].includes(this.surfaceFallback)) {
            this.surfaceFallback = defaults.surfaceFallback;
        }
        this.tiles = [];
    }
    Tile(contentHTML, background) {
        return new Tile(Math.random().toString(36).substring(2, 15), contentHTML, background);
    }
    addTile(tile) {
        this.tiles.push(tile);
    }
    getTiles() {
        return this.tiles;
    }
    removeTile(tileOrId) {
        if (typeof tileOrId === 'string') {
            // Remove by ID
            this.tiles = this.tiles.filter(t => t.id !== tileOrId);
        } else {
            // Remove by tile object reference
            this.tiles = this.tiles.filter(t => t !== tileOrId);
        }
    }
    stringify() {
        return JSON.stringify(this);
    }
}
globalThis.liveTileHelper = {
    requestRedraw, requestGoToPage, requestGoToNextPage, requestGoToPreviousPage, eventListener, TileFeed, Tile, TileType, AnimationType
}
export {
    requestRedraw, requestGoToPage, requestGoToNextPage, requestGoToPreviousPage, eventListener, TileFeed, Tile, TileType, AnimationType
}

export default liveTileHelper
