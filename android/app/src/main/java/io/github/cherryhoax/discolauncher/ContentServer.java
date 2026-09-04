package io.github.cherryhoax.discolauncher2;

import static io.github.cherryhoax.discolauncher2.UriEncode.decodeURIComponent;
import static io.github.cherryhoax.discolauncher2.UriEncode.encodeURIComponent;

import android.app.Notification;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadata;
import android.media.MediaMetadataRetriever;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.service.notification.StatusBarNotification;
import android.util.LruCache;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import io.github.cherryhoax.discolauncher2.IconPack.IconPack;

import java.io.ByteArrayInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class ContentServer extends WebViewClientCompat {
    private static final String APP_ASSET_SCHEME = "https";
    private static final String APP_ASSET_HOST = "appassets.androidplatform.net";
    private static final int ICON_PACK_CACHE_SIZE = 16;
    private static final int ICON_BYTES_CACHE_SIZE = 4 * 1024 * 1024;
    private static final int ALBUM_ART_MAX_SIZE = 512;
    private final MainActivity mainActivity;
    private final DiscoWebView discoWebView;
    private final WorkProfileManager workProfileManager;
    private final WebViewAssetLoader assetLoader;
    private final String TAG = "ContentServer";
    private final LruCache<String, IconPack> iconPackCache = new LruCache<>(ICON_PACK_CACHE_SIZE);
    private final LruCache<String, byte[]> iconBytesCache = new LruCache<String, byte[]>(ICON_BYTES_CACHE_SIZE) {
        @Override
        protected int sizeOf(@NonNull String key, @NonNull byte[] value) {
            return value.length;
        }
    };

    public ContentServer(DiscoWebView discoWebView, WebViewAssetLoader assetLoader) {
        this.discoWebView = discoWebView;
        this.assetLoader = assetLoader;
        this.mainActivity = (MainActivity) discoWebView.getContext();
        this.workProfileManager = new WorkProfileManager(mainActivity);
    }

    private int getRequestedIconSize(Uri requestUri) {
        try {
            int size = Integer.parseInt(requestUri.getQueryParameter("size"));
            return Math.max(16, Math.min(size, 512));
        } catch (Exception ignored) {
            return 0;
        }
    }

    private long getRequestedUserSerial(Uri requestUri) {
        try {
            String value = requestUri.getQueryParameter("userSerial");
            return value == null ? -1 : Long.parseLong(value);
        } catch (Exception ignored) {
            return -1;
        }
    }

    private boolean isAppAssetUrl(Uri uri) {
        return APP_ASSET_SCHEME.equals(uri.getScheme())
                && APP_ASSET_HOST.equals(uri.getHost());
    }

    private IconPack getCachedIconPack(String packageName) {
        IconPack cached = iconPackCache.get(packageName);
        if (cached != null) {
            return cached;
        }

        IconPack iconPack = new IconPack();
        iconPack.packageName = packageName;
        iconPack.setContext(mainActivity);
        iconPack.load();
        iconPackCache.put(packageName, iconPack);
        return iconPack;
    }

    private IconPack getSelectedIconPack(String appPackageName) {
        String perAppIconPack = mainActivity.iconPackPerApp.get(appPackageName);
        if (perAppIconPack != null && !perAppIconPack.isEmpty()) {
            return getCachedIconPack(perAppIconPack);
        }

        if (!mainActivity.iconPack.isEmpty() && mainActivity.iconPackInstance != null) {
            return mainActivity.iconPackInstance;
        }
        return null;
    }

    private WebResourceResponse transparentImageResponse() {
        byte[] image = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"/>"
                .getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse("image/svg+xml", "UTF-8", new ByteArrayInputStream(image));
    }

    private String getIconPackIdentity(String appPackageName) {
        String perAppIconPack = mainActivity.iconPackPerApp.get(appPackageName);
        if (perAppIconPack != null && !perAppIconPack.isEmpty()) {
            return "per-app:" + perAppIconPack;
        }
        return "global:" + mainActivity.iconPack;
    }

    private String iconCacheKey(String endpoint, String appPackageName, String iconPackageNameWithIntent,
                                int requestedIconSize) {
        return endpoint + "|" + appPackageName + "|" + iconPackageNameWithIntent + "|"
                + requestedIconSize + "|" + getIconPackIdentity(appPackageName);
    }

    @Nullable
    private WebResourceResponse cachedIconResponse(String cacheKey) {
        byte[] bytes = iconBytesCache.get(cacheKey);
        return bytes == null ? null
                : new WebResourceResponse("image/webp", "UTF-8", new ByteArrayInputStream(bytes));
    }

    private WebResourceResponse cacheIconResponse(String cacheKey, Bitmap bitmap, int requestedIconSize) {
        byte[] bytes = Utils.bitmapAsWebpBytes(bitmap, requestedIconSize);
        iconBytesCache.put(cacheKey, bytes);
        return new WebResourceResponse("image/webp", "UTF-8", new ByteArrayInputStream(bytes));
    }

    @Nullable
    private Bitmap getMediaArtwork(MediaMetadata metadata) {
        Bitmap artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (artwork == null) artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (artwork == null) artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        return artwork;
    }

    @Nullable
    private Bitmap getMediaArtworkFromUri(MediaMetadata metadata) {
        String[] artworkUris = {
                metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI),
                metadata.getString(MediaMetadata.METADATA_KEY_ART_URI),
                metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI)
        };

        for (String artworkUri : artworkUris) {
            if (artworkUri == null || artworkUri.isEmpty()) continue;
            try {
                Uri uri = Uri.parse(artworkUri);
                // Media sessions normally expose local artwork through a content URI. Do not
                // proxy arbitrary file or network URLs through the privileged WebView client.
                if (!"content".equals(uri.getScheme())) continue;
                try (InputStream inputStream = discoWebView.getContext().getContentResolver()
                        .openInputStream(uri)) {
                    Bitmap artwork = BitmapFactory.decodeStream(inputStream);
                    if (artwork != null) return artwork;
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not load media artwork URI", e);
            }
        }
        return null;
    }

    /**
     * The WebView exposes privileged Android APIs through JavascriptInterface.
     * Do not let a navigation replace the bundled app with remote content that
     * would inherit that bridge.
     */
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return !isAppAssetUrl(request.getUrl());
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri requestUri;
        if (Build.VERSION.SDK_INT >= 21) {
            requestUri = request.getUrl();
        } else {
            requestUri = Uri.parse(request.toString());
        }

        String path = requestUri.getPath(); // Get the path part of the URL
        int requestedIconSize = getRequestedIconSize(requestUri);
        long requestedUserSerial = getRequestedUserSerial(requestUri);
        // Split the path into segments
        String[] segments = path.split("/");
        if (segments.length == 4) {
            String key = segments[2];
            String iconFileName = segments[3];
            switch (key) {
                case "native-widget":
                    if (iconFileName.endsWith(".webp")) {
                        String snapshotKey = iconFileName.substring(0, iconFileName.length() - 5);
                        byte[] snapshot = NativeWidgetSnapshotStore.get(snapshotKey);
                        if (snapshot != null) {
                            return new WebResourceResponse("image/webp", null,
                                    new ByteArrayInputStream(snapshot));
                        }
                    }
                    break;
                case "icons":
                    if (iconFileName.length() > 5) {
                        String iconPackageNameWithIntent = iconFileName.substring(0, iconFileName.length() - 5);
                        String iconPackageName = iconPackageNameWithIntent.split("\\|")[0];
                        String cacheIdentifier = requestedUserSerial < 0
                                ? iconPackageNameWithIntent
                                : iconPackageNameWithIntent + "|user:" + requestedUserSerial;
                        String cacheKey = iconCacheKey(key, iconPackageName, cacheIdentifier, requestedIconSize);
                        WebResourceResponse cachedResponse = cachedIconResponse(cacheKey);
                        if (cachedResponse != null) return cachedResponse;
                        Bitmap dra = requestedUserSerial < 0
                                ? discoWebView.getAppIcon(discoWebView.packageManager, iconPackageNameWithIntent)
                                : workProfileManager.getAppIcon(
                                        iconPackageNameWithIntent, requestedUserSerial, false);
                        IconPack selectedIconPack = getSelectedIconPack(iconPackageName);
                        boolean useIconPackBackground = selectedIconPack != null
                                && selectedIconPack.hasIconForPackage(iconPackageName);

                        // Explicit icon-pack art is served by icons-bg below, keeping the
                        // adaptive-icon foreground transparent.
                        if (useIconPackBackground) {
                            return transparentImageResponse();
                        }

                        if (dra != null) return cacheIconResponse(cacheKey, dra, requestedIconSize);
                    }
                    break;
                case "icons-bg":
                    if (iconFileName.length() > 5) {
                        String iconPackageNameWithIntent = iconFileName.substring(0, iconFileName.length() - 5);
                        String iconPackageName = iconPackageNameWithIntent.split("\\|")[0];
                        String cacheIdentifier = requestedUserSerial < 0
                                ? iconPackageNameWithIntent
                                : iconPackageNameWithIntent + "|user:" + requestedUserSerial;
                        String cacheKey = iconCacheKey(key, iconPackageName, cacheIdentifier, requestedIconSize);
                        WebResourceResponse cachedResponse = cachedIconResponse(cacheKey);
                        if (cachedResponse != null) return cachedResponse;
                        Bitmap dra = requestedUserSerial < 0
                                ? discoWebView.getAppIconBackground(
                                        discoWebView.packageManager, iconPackageNameWithIntent)
                                : workProfileManager.getAppIcon(
                                        iconPackageNameWithIntent, requestedUserSerial, true);
                        IconPack selectedIconPack = getSelectedIconPack(iconPackageName);

                        if (selectedIconPack != null
                                && selectedIconPack.hasIconForPackage(iconPackageName)) {
                            Bitmap packIcon = selectedIconPack.getIconForPackage(iconPackageName, dra);
                            if (packIcon != null) {
                                dra = packIcon;
                            }
                        }

                        if (dra != null) return cacheIconResponse(cacheKey, dra, requestedIconSize);
                    }
                    break;
                case "adaptive-icon-foreground":
                    if (iconFileName.length() > 5) {
                        String iconPackageNameWithIntent = iconFileName.substring(0, iconFileName.length() - 5);
                        String iconPackageName = iconPackageNameWithIntent.split("\\|")[0];
                        String cacheKey = iconCacheKey(key, iconPackageName, iconPackageNameWithIntent,
                                requestedIconSize);
                        WebResourceResponse cachedResponse = cachedIconResponse(cacheKey);
                        if (cachedResponse != null) return cachedResponse;

                        Bitmap foreground = discoWebView.getAdaptiveAppIconForeground(
                                discoWebView.packageManager, iconPackageNameWithIntent);
                        if (foreground != null) {
                            return cacheIconResponse(cacheKey, foreground, requestedIconSize);
                        }
                    }
                    return transparentImageResponse();

                case "contact-icon":
                    if (iconFileName.length() > 5) {
                        String phoneNumber = iconFileName.substring(0, iconFileName.length() - 5);
                        List<Contact> contacts = getContactsByPhoneNumber(discoWebView.getContext(), phoneNumber);
                        if (!contacts.isEmpty()) {
                            long contactId = contacts.get(0).getId(); // Assuming you want the first contact
                            // Now query for the contact's photo using the contact ID
                            Uri contactUri = Uri.withAppendedPath(ContactsContract.Contacts.CONTENT_URI,
                                    String.valueOf(contactId));
                            Cursor cursor = discoWebView.getContext().getContentResolver().query(
                                    contactUri,
                                    new String[]{ContactsContract.Contacts.PHOTO_URI},
                                    null,
                                    null,
                                    null);
                            String photoUri = null;
                            if (cursor != null) {
                                if (cursor.moveToFirst()) {
                                    int photoUriIndex = cursor.getColumnIndex(ContactsContract.Contacts.PHOTO_URI);
                                    if (photoUriIndex != -1) {
                                        photoUri = cursor.getString(photoUriIndex);
                                    } else {
                                        Log.d("contact-icon", "PHOTO_URI column not found.");
                                    }
                                }
                                cursor.close();
                            } else {
                                Log.d("contact-icon", "Cursor is null.");
                            }

                            if (photoUri != null) {
                                try {
                                    InputStream inputStream = discoWebView.getContext().getContentResolver()
                                            .openInputStream(Uri.parse(photoUri));
                                    if (inputStream != null) {
                                        // Convert the InputStream to a Bitmap
                                        Bitmap bitmap = BitmapFactory.decodeStream(inputStream);
                                        if (bitmap != null) {
                                            // Convert Bitmap to InputStream for WebResourceResponse
                                            InputStream webpStream = Utils.loadBitmapAsStream(bitmap);
                                            return new WebResourceResponse("image/webp", "UTF-8", webpStream);
                                        }
                                    }
                                } catch (FileNotFoundException e) {
                                    Log.e("contact-icon", "File not found for photo URI: " + photoUri, e);
                                } catch (Exception e) {
                                    Log.e("contact-icon", "Error retrieving contact photo: " + e.getMessage(), e);
                                }
                            } else {
                                Log.d("contact-icon", "Photo URI is null.");
                            }
                        }
                    }
                    break;
                case "photos":
                    final double sizeScale = .5;
                    if (iconFileName.length() > 5) {
                        try {
                            String photoId = iconFileName.substring(0, iconFileName.length() - 5);
                            Uri photoUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                                    Long.parseLong(photoId));

                            // DATA is commonly null under scoped storage, even when this content URI
                            // is still readable.  Decode the URI directly instead of treating a missing
                            // legacy filesystem path as a 404.
                            try (InputStream inputStream = discoWebView.getContext().getContentResolver()
                                    .openInputStream(photoUri)) {
                                if (inputStream == null) break;

                                Bitmap bitmap = BitmapFactory.decodeStream(inputStream);
                                if (bitmap != null) {
                                    int newWidth = Math.max(1, (int) (bitmap.getWidth() * sizeScale));
                                    int newHeight = Math.max(1, (int) (bitmap.getHeight() * sizeScale));
                                    Bitmap resizedBitmap = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight,
                                            true);
                                    InputStream webpStream = Utils.loadBitmapAsStream(resizedBitmap);
                                    return new WebResourceResponse("image/webp", "UTF-8", webpStream);
                                }
                            }
                        } catch (Exception e) {
                            Log.e("photos", "Error retrieving photo: " + e.getMessage(), e);
                        }
                    }
                    break;
                case "album-art":
                    StatusBarNotification sbn = mainActivity.notificationDelegate.getNotificationById(iconFileName.substring(0, iconFileName.length() - 5));
                    if (sbn != null) {
                        MediaSession.Token token = sbn.getNotification().extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);

                        if (token != null) {
                            MediaController mediaController = new MediaController(mainActivity, token);
                            MediaMetadata metadata = mediaController.getMetadata();

                            if (metadata != null) {
                                Bitmap albumArt = getMediaArtwork(metadata);
                                if (albumArt == null) albumArt = getMediaArtworkFromUri(metadata);
                                if (albumArt != null) {
                                    InputStream inputStream = Utils.loadBitmapAsStream(albumArt,
                                            ALBUM_ART_MAX_SIZE);
                                    return new WebResourceResponse("image/webp", "UTF-8", inputStream);
                                }
                            }
                        }
                    }
                    break;
                case "notification-image":
                    StatusBarNotification sbn2 = mainActivity.notificationDelegate.getNotificationById(iconFileName.substring(0, iconFileName.length() - 5));
                    Bitmap bitmap = sbn2.getNotification().extras.getParcelable(Notification.EXTRA_PICTURE);
                    if (bitmap != null) {
                        InputStream inputStream = Utils.loadBitmapAsStream(bitmap);
                        return new WebResourceResponse("image/webp", "UTF-8", inputStream);
                    }
                    break;
                default:
                    break;
            }
        }
        return assetLoader.shouldInterceptRequest(requestUri);
    }

    public List<Contact> getContactsByPhoneNumber(Context context, String phoneNumber) {
        List<Contact> contacts = new ArrayList<>();
        ContentResolver contentResolver = context.getContentResolver();
        Uri uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI;
        String selection = ContactsContract.CommonDataKinds.Phone.NUMBER + " = ?";
        String[] selectionArgs = {phoneNumber};
        String[] projection = {
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
        };

        Cursor cursor = contentResolver.query(uri, projection, selection, selectionArgs, null);
        if (cursor != null && cursor.moveToFirst()) {
            do {
                long contactId = cursor
                        .getLong(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID));
                String displayName = cursor
                        .getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME));
                contacts.add(new Contact(contactId, displayName));
            } while (cursor.moveToNext());
            cursor.close();
        }

        return contacts;
    }

    public static class Contact {
        private long id;
        private String displayName;

        public Contact(long id, String displayName) {
            this.id = id;
            this.displayName = displayName;
        }

        public long getId() {
            return id;
        }

        public String getDisplayName() {
            return displayName;
        }
    }
}
