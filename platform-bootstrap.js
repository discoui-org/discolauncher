(() => {
  const platforms = Object.freeze({
    MOCK: "web-mock",
    WEBVIEW: "android-webview",
    GECKO: "android-geckoview"
  });

  const supportedPlatforms = new Set(Object.values(platforms));
  const parentPlatform = window.parent !== window
    ? window.parent.__DISCO_PLATFORM__
    : null;
  const requestedPlatform = window.__DISCO_PLATFORM__ || parentPlatform;
  const platform = supportedPlatforms.has(requestedPlatform)
    ? requestedPlatform
    : window.Disco
      ? platforms.WEBVIEW
      : platforms.MOCK;

  window.__DISCO_PLATFORM__ = platform;
  window.DiscoPlatform = Object.freeze({
    name: platform,
    isMock: platform === platforms.MOCK,
    isWebView: platform === platforms.WEBVIEW,
    isGeckoView: platform === platforms.GECKO
  });

  // Kept while callers migrate to DiscoPlatform.isMock.
  window.DiscoMockInstance = window.DiscoPlatform.isMock;

  // GeckoBridgeServer synchronously injects gecko-bridge.js before this file.
  // Keep the bridge out of normal browsers and Android WebView, and avoid
  // document.write() here because Gecko can reparse the page around it.
  if (platform === platforms.GECKO && !window.Disco) {
    console.error("Gecko bridge was not installed before platform bootstrap.");
  }
})();
