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
        return (...args) => invoke(target, method, args);
      }
    });
  }

  window.Disco = bridge("Disco");
  window.BuildConfig = bridge("BuildConfig");
  window.__discoGeckoBridge = true;
})();
