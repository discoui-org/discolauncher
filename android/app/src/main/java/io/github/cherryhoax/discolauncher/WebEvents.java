package io.github.cherryhoax.discolauncher2;

import android.content.Context;
import android.util.Log;
import android.webkit.WebView;

import org.json.JSONObject;

public class WebEvents {
    Context mContext;
    WebView webView;

    void destroy() {
        webView = null;
        mContext = null;
    }

    public enum events {
        systemInsetsChange,
        backButtonPress,
        homeButtonPress,
        activityPause,
        activityResume,
        appInstall,
        appUninstall,
        workProfileChanged,
        animationDurationScaleChange,
        deepLink,
        systemThemeChange,
        notificationPosted,
        notificationRemoved,
        notificationsChanged,
        debugLog
    }

    WebEvents(Context c, WebView w) {
        mContext = c;
        webView = w;
    }

    public void dispatchEvent(String eventName, JSONObject arguments) {
        if (webView == null) return;
        String script = "";
        if (arguments == null) {
            script = "window.dispatchEvent(new CustomEvent(\"" + eventName + "\"))";
        } else {
            script = "window.dispatchEvent(new CustomEvent(\"" + eventName + "\", {detail:" + arguments.toString() + "}))";
        }
        Log.d("discolauncher", "dispatchEventScript: " + script);
        webView.evaluateJavascript(script, null);
    }

    public void dispatchEvent(String eventName) {
        dispatchEvent(eventName, null);
    }

    public void dispatchEvent(events eventName, JSONObject arguments) {
        dispatchEvent(eventName.toString(), arguments);
    }

    public void dispatchEvent(events eventName) {
        dispatchEvent(eventName.toString());
    }

}
