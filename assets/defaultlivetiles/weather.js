/**
 * @name string Weather
 * @provide type weather
 * @author string cherryhoax
 * @description string Displays the current weather from Open-Meteo.
 * @minVersion number 55
 * @supportedSizes m,w
 * @targetVersion number 55
 */

importScripts('./../../dist/liveTileHelper.js');

const REFRESH_INTERVAL = 30 * 60 * 1000;
let location = null;
let weather = null;
let requestInProgress = false;

const WEATHER_CODES = {
    0: ["Clear", "☀"], 1: ["Mostly clear", "☀"],
    2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁"],
    45: ["Fog", "≋"], 48: ["Fog", "≋"],
    51: ["Drizzle", "☂"], 53: ["Drizzle", "☂"], 55: ["Drizzle", "☂"],
    56: ["Freezing drizzle", "☂"], 57: ["Freezing drizzle", "☂"],
    61: ["Rain", "☂"], 63: ["Rain", "☂"], 65: ["Heavy rain", "☂"],
    66: ["Freezing rain", "☂"], 67: ["Freezing rain", "☂"],
    71: ["Snow", "❄"], 73: ["Snow", "❄"], 75: ["Heavy snow", "❄"], 77: ["Snow", "❄"],
    80: ["Rain showers", "☂"], 81: ["Rain showers", "☂"], 82: ["Heavy showers", "☂"],
    85: ["Snow showers", "❄"], 86: ["Heavy snow", "❄"],
    95: ["Thunderstorm", "ϟ"], 96: ["Thunderstorm", "ϟ"], 99: ["Thunderstorm", "ϟ"]
};

const TURKISH_CONDITIONS = {
    "Clear": "Açık", "Mostly clear": "Çoğunlukla açık", "Partly cloudy": "Parçalı bulutlu",
    "Overcast": "Kapalı", "Fog": "Sisli", "Drizzle": "Çiseleme",
    "Freezing drizzle": "Dondurucu çiseleme", "Rain": "Yağmurlu",
    "Heavy rain": "Kuvvetli yağmur", "Freezing rain": "Dondurucu yağmur",
    "Snow": "Karlı", "Heavy snow": "Yoğun kar", "Rain showers": "Sağanak",
    "Heavy showers": "Kuvvetli sağanak", "Snow showers": "Kar sağanağı",
    "Thunderstorm": "Gök gürültülü fırtına", "Weather": "Hava durumu"
};

function text(key) {
    const turkish = navigator.language?.toLowerCase().startsWith('tr');
    const translations = turkish
        ? { loading: 'Hava durumu alınıyor…', unavailable: 'Hava durumu kullanılamıyor', permission: 'Konum izni gerekli', feelsLike: 'Hissedilen', currentLocation: 'Mevcut konum' }
        : { loading: 'Getting weather…', unavailable: 'Weather unavailable', permission: 'Location permission required', feelsLike: 'Feels like', currentLocation: 'Current location' };
    return translations[key];
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

async function refreshWeather() {
    if (!location || requestInProgress) return;
    requestInProgress = true;
    try {
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.search = new URLSearchParams({
            latitude: location.latitude,
            longitude: location.longitude,
            current: 'temperature_2m,apparent_temperature,weather_code',
            daily: 'temperature_2m_max,temperature_2m_min',
            forecast_days: '1',
            temperature_unit: 'celsius',
            timezone: 'auto'
        });
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
        const data = await response.json();
        weather = {
            ...data.current,
            high: data.daily?.temperature_2m_max?.[0],
            low: data.daily?.temperature_2m_min?.[0]
        };
        liveTileHelper.requestRedraw();
    } catch (error) {
        console.warn('Could not load weather', error);
        weather = { error: true };
        liveTileHelper.requestRedraw();
    } finally {
        requestInProgress = false;
    }
}

function draw() {
    const tileFeed = new liveTileHelper.TileFeed({
        type: liveTileHelper.TileType.STATIC,
        showAppTitle: true
    });

    if (!weather) {
        tileFeed.addTile(tileFeed.Tile(`<div class="live-tile-weather live-tile-weather-wide show-w"><p class="live-tile-weather-status">${text('loading')}</p></div><div class="live-tile-weather live-tile-weather-compact show-m"><p class="live-tile-weather-status">${text('loading')}</p></div>`));
        return tileFeed;
    }
    if (weather.error) {
        const message = weather.error === 'permission-required' ? text('permission') : text('unavailable');
        tileFeed.addTile(tileFeed.Tile(`<div class="live-tile-weather live-tile-weather-wide show-w"><p class="live-tile-weather-status">${message}</p></div><div class="live-tile-weather live-tile-weather-compact show-m"><p class="live-tile-weather-status">${message}</p></div>`));
        return tileFeed;
    }

    let [condition, symbol] = WEATHER_CODES[weather.weather_code] || ["Weather", "•"];
    if (navigator.language?.toLowerCase().startsWith('tr')) {
        condition = TURKISH_CONDITIONS[condition] || condition;
    }
    const temperature = Math.round(weather.temperature_2m);
    const feelsLike = Math.round(weather.apparent_temperature);
    const high = Math.round(weather.high ?? weather.temperature_2m);
    const low = Math.round(weather.low ?? weather.temperature_2m);
    const city = escapeHTML(location?.city || text('currentLocation'));
    tileFeed.addTile(tileFeed.Tile(`
        <div class="live-tile-weather live-tile-weather-wide show-w">
            <p class="live-tile-weather-city">${city}</p>
            <p class="live-tile-weather-condition">${escapeHTML(condition)}</p>
            <div class="live-tile-weather-wide-metrics">
                <p class="live-tile-weather-temperature">${temperature}°</p>
                <p class="live-tile-weather-range"><span>${high}°</span><span>${low}°</span></p>
                <p class="live-tile-weather-feels">${text('feelsLike')}<br>${feelsLike}°</p>
            </div>
        </div>
        <div class="live-tile-weather live-tile-weather-compact show-m">
            <p class="live-tile-weather-city">${city}</p>
            <p class="live-tile-weather-condition">${escapeHTML(condition)}</p>
            <p class="live-tile-weather-temperature">${temperature}°</p>
            <p class="live-tile-weather-range"><span>${high}°</span><span>${low}°</span></p>
        </div>
    `));
    return tileFeed;
}

liveTileHelper.eventListener.on('draw', draw);
liveTileHelper.eventListener.on('weatherlocation', (data) => {
    if (data?.latitude == null || data?.longitude == null) {
        weather = { error: data?.error || true };
        liveTileHelper.requestRedraw();
        return;
    }
    location = data;
    refreshWeather();
});
liveTileHelper.eventListener.on('init', () => {
    postMessage({ action: 'requestWeatherLocation' });
    setInterval(refreshWeather, REFRESH_INTERVAL);
    liveTileHelper.requestRedraw();
});
