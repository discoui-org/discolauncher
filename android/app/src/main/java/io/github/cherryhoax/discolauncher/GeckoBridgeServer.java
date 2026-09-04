package io.github.cherryhoax.discolauncher2;

import android.content.Context;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

/**
 * Serves the packaged application and exposes the synchronous subset of the
 * legacy WebView JavascriptInterface used during launcher startup.
 *
 * GeckoView does not implement WebView.addJavascriptInterface. Keeping this
 * transport on loopback lets the existing web app retain its synchronous API
 * while the remaining native calls are ported incrementally.
 */
public final class GeckoBridgeServer extends NanoHTTPD {
    private static final String BRIDGE_PREFIX = "/__disco_bridge/";
    private static final String CONTACT_AVATAR_PREFIX = "/__disco_content/contact-icon/";
    private static final String PHOTO_PREFIX = "/__disco_content/photos/";
    private static final String APP_ICON_PREFIX = "/__disco_content/app-icon/";
    private static final String APP_ICON_BACKGROUND_PREFIX = "/__disco_content/app-icon-bg/";

    private final MainActivity activity;
    private final WebInterface legacyInterface;
    private final WorkProfileManager workProfileManager;

    public GeckoBridgeServer(MainActivity activity) {
        super("127.0.0.1", 0);
        this.activity = activity;
        this.legacyInterface = new WebInterface(activity, null);
        this.workProfileManager = new WorkProfileManager(activity);
    }

    @Override
    public void stop() {
        legacyInterface.destroy();
        super.stop();
    }

    @Override
    public Response serve(IHTTPSession request) {
        if (request.getUri().startsWith(BRIDGE_PREFIX)) {
            return serveBridge(request);
        }
        if (request.getUri().startsWith(CONTACT_AVATAR_PREFIX)) {
            return serveContactAvatar(request);
        }
        if (request.getUri().startsWith(PHOTO_PREFIX)) {
            return servePhoto(request);
        }
        if (request.getUri().startsWith(APP_ICON_PREFIX)) {
            return serveAppIcon(request, false);
        }
        if (request.getUri().startsWith(APP_ICON_BACKGROUND_PREFIX)) {
            return serveAppIcon(request, true);
        }
        return serveAsset(request);
    }

    private Response serveBridge(IHTTPSession request) {
        if (request.getMethod() != Method.POST) {
            return jsonResponse(Response.Status.METHOD_NOT_ALLOWED, null,
                    "Bridge methods require POST");
        }
        Map<String, String> body = new HashMap<>();
        try {
            // NanoHTTPD otherwise leaves an application/json body unread and
            // responds with 400 before the next synchronous bridge request.
            request.parseBody(body);
        } catch (Exception exception) {
            return jsonResponse(Response.Status.BAD_REQUEST, null, exception.getMessage());
        }
        JSONArray arguments;
        try {
            arguments = new JSONArray(body.getOrDefault("postData", "[]"));
        } catch (Exception exception) {
            return jsonResponse(Response.Status.BAD_REQUEST, null, exception.getMessage());
        }

        String method = request.getUri().substring(BRIDGE_PREFIX.length());
        if (method.startsWith("Disco/")) {
            method = method.substring("Disco/".length());
        } else if (method.startsWith("BuildConfig/")) {
            return invokeBuildConfig(method.substring("BuildConfig/".length()));
        } else {
            return jsonResponse(Response.Status.NOT_FOUND, null, "Unknown bridge target");
        }

        try {
            return jsonResponse(Response.Status.OK, invokeDisco(method, arguments), null);
        } catch (Exception exception) {
            return jsonResponse(Response.Status.INTERNAL_ERROR, null, exception.getMessage());
        }
    }

    private Response invokeBuildConfig(String method) {
        BuildConfigInterface buildConfig = new BuildConfigInterface(activity);
        try {
            switch (method) {
                case "CAK": return jsonResponse(Response.Status.OK, buildConfig.CAK(), null);
                case "CHANGELOG": return jsonResponse(Response.Status.OK, buildConfig.CHANGELOG(), null);
                case "signed": return jsonResponse(Response.Status.OK, buildConfig.signed(), null);
                case "isGeckoView": return jsonResponse(Response.Status.OK, buildConfig.isGeckoView(), null);
                case "isWebView": return jsonResponse(Response.Status.OK, buildConfig.isWebView(), null);
                case "isNightly": return jsonResponse(Response.Status.OK, buildConfig.isNightly(), null);
                case "getAppVersion": return jsonResponse(Response.Status.OK, buildConfig.getAppVersion(), null);
                case "getAppArchitecture": return jsonResponse(Response.Status.OK, buildConfig.getAppArchitecture(), null);
                case "REPOSITORY_URL": return jsonResponse(Response.Status.OK, buildConfig.REPOSITORY_URL(), null);
                case "REPOSITORY_NAME": return jsonResponse(Response.Status.OK, buildConfig.REPOSITORY_NAME(), null);
                case "LOCALIZATION_REPOSITORY_URL": return jsonResponse(Response.Status.OK, buildConfig.LOCALIZATION_REPOSITORY_URL(), null);
                case "LOCALIZATION_REPOSITORY_NAME": return jsonResponse(Response.Status.OK, buildConfig.LOCALIZATION_REPOSITORY_NAME(), null);
                default: return jsonResponse(Response.Status.NOT_FOUND, null, "Unsupported BuildConfig method: " + method);
            }
        } catch (Exception exception) {
            return jsonResponse(Response.Status.INTERNAL_ERROR, null, exception.getMessage());
        }
    }

    private Object invokeDisco(String method, JSONArray arguments) throws Exception {
        switch (method) {
            case "showToast":
                legacyInterface.showToast(arguments.optString(0));
                return null;
            case "getNativeWidgetProviders":
                return legacyInterface.getNativeWidgetProviders(arguments.optString(0));
            case "getNativeWidgetSnapshot":
                return legacyInterface.getNativeWidgetSnapshot(
                        arguments.optString(0), arguments.optInt(1), arguments.optInt(2));
            case "tapNativeWidget":
                legacyInterface.tapNativeWidget(arguments.optString(0),
                        (float) arguments.optDouble(1), (float) arguments.optDouble(2));
                return null;
            case "retrieveApps":
                return legacyInterface.retrieveApps();
            case "getSystemInsets":
                return new JSONObject().put("left", 0).put("top", 0).put("right", 0).put("bottom", 0).toString();
            case "retrieveContacts":
                return legacyInterface.retrieveContacts();
            case "getAppLabel":
                return legacyInterface.getAppLabel(arguments.optString(0));
            case "launchApp":
                return legacyInterface.launchApp(arguments.optString(0));
            case "launchAppForProfile":
                return legacyInterface.launchAppForProfile(
                        arguments.optString(0), arguments.optLong(1));
            case "getWorkProfileState":
                return legacyInterface.getWorkProfileState();
            case "setWorkProfileEnabled":
                return legacyInterface.setWorkProfileEnabled(arguments.optBoolean(0));
            case "uninstallApp":
                if (arguments.length() > 1) {
                    return legacyInterface.uninstallApp(arguments.optString(0), arguments.optInt(1));
                }
                return legacyInterface.uninstallApp(arguments.optString(0));
            case "launchAppInfo":
                return legacyInterface.launchAppInfo(arguments.optString(0));
            case "setStatusBarAppearance":
                legacyInterface.setStatusBarAppearance(arguments.optString(0));
                return null;
            case "getStatusBarAppearance":
                return legacyInterface.getStatusBarAppearance();
            case "setNavigationBarAppearance":
                legacyInterface.setNavigationBarAppearance(arguments.optString(0));
                return null;
            case "getNavigationBarAppearance":
                return legacyInterface.getNavigationBarAppearance();
            case "searchStore":
                legacyInterface.searchStore(arguments.optString(0));
                return null;
            case "openURL":
                legacyInterface.openURL(arguments.optString(0));
                return null;
            case "getAppVersion":
                return BuildConfig.VERSION_NAME;
            case "getWebViewVersion":
                return "GeckoView";
            case "isShizukuAvailable":
                return legacyInterface.isShizukuAvailable();
            case "isDeviceRooted":
                return legacyInterface.isDeviceRooted();
            case "getDefaultApps":
                return legacyInterface.getDefaultApps();
            case "writeClipboard":
                return legacyInterface.writeClipboard(arguments.optString(0));
            case "readClipboard":
                return legacyInterface.readClipboard();
            case "getDisplayOrientation":
                return legacyInterface.getDisplayOrientation();
            case "setDisplayOrientationLock":
                legacyInterface.setDisplayOrientationLock(arguments.optString(0));
                return null;
            case "getSystemLocale":
                return activity.getResources().getConfiguration().getLocales().get(0).toString();
            case "getAnimationDurationScale":
                return Settings.Global.getFloat(activity.getContentResolver(),
                        Settings.Global.ANIMATOR_DURATION_SCALE, 1.0f);
            case "getSystemAccentColor":
                return legacyInterface.getSystemAccentColor(arguments.optString(0));
            case "checkPermission":
                return legacyInterface.checkPermission(arguments.optString(0));
            case "getAppIconURL":
                return getAppIconURL(arguments.optString(0), null);
            case "getProfileAppIconURL":
                return getAppIconURL(arguments.optString(0), arguments.optLong(1));
            case "triggerHapticFeedback":
                return legacyInterface.triggerHapticFeedback(arguments.optString(0));
            case "requestPermission":
                legacyInterface.requestPermission(arguments.optString(0));
                return null;
            case "requestScreenLock":
                return legacyInterface.requestScreenLock();
            case "getLocation":
                return legacyInterface.getLocation();
            case "getNotificationExtra":
                // StatusBarNotification instances cannot cross the JSON bridge.
                // This mirrors the mock's safe empty result for serialized calls.
                return "";
            case "getIconPacks":
                return legacyInterface.getIconPacks();
            case "applyIconPack":
                legacyInterface.applyIconPack(arguments.optString(0));
                return null;
            case "applyIconPackPerApp":
                legacyInterface.applyIconPackPerApp(arguments.optString(0), arguments.optString(1));
                return null;
            case "getLastLogs":
                return legacyInterface.getLastLogs();
            case "getAPILevel":
                return legacyInterface.getAPILevel();
            case "supportsMonochromeIcons":
                return legacyInterface.supportsMonochromeIcons();
            case "setMonochromeIcons":
                legacyInterface.setMonochromeIcons(arguments.optBoolean(0));
                return null;
            case "getMonochromeIcons":
                return legacyInterface.getMonochromeIcons();
            case "setAccentColor":
                legacyInterface.setAccentColor(arguments.optString(0));
                return null;
            case "getAppTilePreferences":
                return legacyInterface.getAppTilePreferences(arguments.optString(0));
            case "setAppTilePreferences":
                legacyInterface.setAppTilePreferences(arguments.optString(0), arguments.optString(1));
                return null;
            case "hasAppTilePreferences":
                return legacyInterface.hasAppTilePreferences(arguments.optString(0));
            case "removeAppTilePreferences":
                legacyInterface.removeAppTilePreferences(arguments.optString(0));
                return null;
            case "getContacts":
                return legacyInterface.getContacts();
            case "getPhotos":
                return legacyInterface.getPhotos();
            case "getContactAvatarURL":
                return "http://127.0.0.1:" + getListeningPort() + CONTACT_AVATAR_PREFIX
                        + Uri.encode(arguments.optString(0));
            case "getPhotoURL":
                return "http://127.0.0.1:" + getListeningPort() + PHOTO_PREFIX
                        + Uri.encode(arguments.optString(0));
            case "getAllNotifications":
                return legacyInterface.getAllNotifications();
            case "setUIScale":
                return null;
            case "appReady":
                activity.isAppReady = true;
                return null;
            default:
                throw new UnsupportedOperationException("Unsupported Disco method: " + method);
        }
    }

    private Response serveContactAvatar(IHTTPSession request) {
        if (request.getMethod() != Method.GET && request.getMethod() != Method.HEAD) {
            return newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, MIME_PLAINTEXT,
                    "Method not allowed");
        }
        String phoneNumber = Uri.decode(request.getUri().substring(CONTACT_AVATAR_PREFIX.length()));
        String[] phoneProjection = {ContactsContract.CommonDataKinds.Phone.CONTACT_ID};
        try (Cursor phoneCursor = activity.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                phoneProjection,
                ContactsContract.CommonDataKinds.Phone.NUMBER + " = ?",
                new String[]{phoneNumber}, null)) {
            if (phoneCursor == null || !phoneCursor.moveToFirst()) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
            }
            long contactId = phoneCursor.getLong(0);
            Uri contactUri = Uri.withAppendedPath(ContactsContract.Contacts.CONTENT_URI,
                    String.valueOf(contactId));
            try (InputStream input = ContactsContract.Contacts.openContactPhotoInputStream(
                    activity.getContentResolver(), contactUri, true)) {
                if (input == null) {
                    return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
                }
                Bitmap bitmap = BitmapFactory.decodeStream(input);
                if (bitmap == null) {
                    return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
                }
                return newChunkedResponse(Response.Status.OK, "image/webp",
                        new ByteArrayInputStream(Utils.bitmapAsWebpBytes(bitmap, 256)));
            }
        } catch (Exception exception) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
        }
    }

    private Response servePhoto(IHTTPSession request) {
        if (request.getMethod() != Method.GET && request.getMethod() != Method.HEAD) {
            return newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, MIME_PLAINTEXT,
                    "Method not allowed");
        }
        try {
            long photoId = Long.parseLong(Uri.decode(request.getUri().substring(PHOTO_PREFIX.length())));
            Uri photoUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, photoId);
            try (InputStream input = activity.getContentResolver().openInputStream(photoUri)) {
                if (input == null) {
                    return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
                }
                Bitmap bitmap = BitmapFactory.decodeStream(input);
                if (bitmap == null) {
                    return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
                }
                return newChunkedResponse(Response.Status.OK, "image/webp",
                        new ByteArrayInputStream(Utils.bitmapAsWebpBytes(bitmap, 768)));
            }
        } catch (Exception exception) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
        }
    }

    private String getAppIconURL(String packageName, Long userSerial) throws Exception {
        WebInterface.PackageNameInfo packageNameInfo = legacyInterface.parsePackageName(packageName);
        String iconIdentifier = packageNameInfo.packageName == null
                ? "undefined"
                : packageNameInfo.packageName
                        + (packageNameInfo.intentId == null ? "" : "|" + packageNameInfo.intentId);
        String query = userSerial == null ? "" : "?userSerial=" + userSerial;
        String baseURL = "http://127.0.0.1:" + getListeningPort();
        JSONObject result = new JSONObject();
        result.put("foreground", baseURL + APP_ICON_PREFIX + Uri.encode(iconIdentifier) + query);
        result.put("background", baseURL + APP_ICON_BACKGROUND_PREFIX + Uri.encode(iconIdentifier) + query);
        return result.toString();
    }

    private Response serveAppIcon(IHTTPSession request, boolean background) {
        if (request.getMethod() != Method.GET && request.getMethod() != Method.HEAD) {
            return newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, MIME_PLAINTEXT,
                    "Method not allowed");
        }
        String prefix = background ? APP_ICON_BACKGROUND_PREFIX : APP_ICON_PREFIX;
        try {
            String iconIdentifier = Uri.decode(request.getUri().substring(prefix.length()));
            long userSerial = Long.parseLong(request.getParms().getOrDefault("userSerial", "-1"));
            int requestedSize = Integer.parseInt(request.getParms().getOrDefault("size", "0"));
            requestedSize = Math.max(0, Math.min(requestedSize, 512));
            Bitmap bitmap = workProfileManager.getAppIcon(iconIdentifier, userSerial, background);
            if (bitmap == null) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
            }
            return newChunkedResponse(Response.Status.OK, "image/webp",
                    new ByteArrayInputStream(Utils.bitmapAsWebpBytes(bitmap, requestedSize)));
        } catch (Exception error) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
        }
    }

    private Response serveAsset(IHTTPSession request) {
        if (request.getMethod() != Method.GET && request.getMethod() != Method.HEAD) {
            return newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, MIME_PLAINTEXT, "Method not allowed");
        }
        String assetPath = request.getUri();
        if ("/".equals(assetPath)) {
            assetPath = "/index.html";
        }
        assetPath = assetPath.substring(1);
        if (assetPath.contains("..")) {
            return newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "Forbidden");
        }
        try {
            InputStream stream = activity.getAssets().open(assetPath);
            if (assetPath.endsWith(".html")) {
                String document = new String(readAllBytes(stream), StandardCharsets.UTF_8);
                // Load the bridge synchronously before any page script. Loading it through
                // platform-bootstrap's document.write() can make Gecko reparse the document
                // and run a module before its DOM has finished parsing.
                String platformBootstrap = "<script>window.__DISCO_PLATFORM__=\"android-geckoview\";</script>"
                        + "<script src=\"/gecko-bridge.js\"></script>"
                        + "<script src=\"/platform-bootstrap.js\"></script>";
                document = document.replace("</head>", platformBootstrap + "</head>");
                stream = new ByteArrayInputStream(document.getBytes(StandardCharsets.UTF_8));
            }
            return newChunkedResponse(Response.Status.OK, getMimeTypeForFile(assetPath), stream);
        } catch (IOException exception) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
        }
    }

    private byte[] readAllBytes(InputStream stream) throws IOException {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = stream.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private Response jsonResponse(Response.Status status, Object result, String error) {
        JSONObject response = new JSONObject();
        try {
            response.put("result", result == null ? JSONObject.NULL : result);
            if (error != null) {
                response.put("error", error);
            }
        } catch (Exception ignored) {
        }
        Response nativeResponse = newFixedLengthResponse(status, "application/json", response.toString());
        nativeResponse.addHeader("Cache-Control", "no-store");
        return nativeResponse;
    }
}
