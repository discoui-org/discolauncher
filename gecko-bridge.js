(() => {
  if (window.Disco) return;

  function invoke(target, method, args) {
    const request = new XMLHttpRequest();
    request.open("POST", `/__disco_bridge/${target}/${encodeURIComponent(method)}`, false);
    request.setRequestHeader("Content-Type", "application/json");
    request.send(JSON.stringify(args));
    let response;
    try {
      response = JSON.parse(request.responseText || "{}");
    } catch (error) {
      throw new Error(`Invalid native bridge response for ${target}.${method}: ${request.responseText}`);
    }
    if (request.status < 200 || request.status >= 300) {
      throw new Error(response.error || `Native bridge call failed: ${method}`);
    }
    return response.result;
  }

  function bridge(target) {
    return new Proxy({}, {
      get(_object, method) {
        if (typeof method !== "string") return undefined;
        return (...args) => {
          // Internal apps are views owned by the launcher document, not Android
          // activities. Launch them in Gecko just as the web mock does.
          if (target === "Disco" && method === "launchApp"
              && typeof args[0] === "string" && args[0].startsWith("disco.internal")) {
            const [packageName, launchArgs] = args[0].split("?", 2);
            const launcher = window.DiscoBoard?.backendMethods?.launchInternalApp;
            if (typeof launcher === "function") {
              launcher(packageName, launchArgs);
              return true;
            }
          }

          const result = invoke(target, method, args);
          // WebView applies this native-side. GeckoView has no equivalent
          // zoom API, so preserve the public method's visual result in CSS.
          if (target === "Disco" && method === "setUIScale" && document.body) {
            document.body.style.setProperty("--ui-scale", args[0]);
          }
          return result;
        };
      }
    });
  }

  window.Disco = bridge("Disco");
  window.BuildConfig = bridge("BuildConfig");
  window.__discoGeckoBridge = true;
})();
