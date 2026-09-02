package io.github.cherryhoax.discolauncher2;

import static io.github.cherryhoax.discolauncher2.MainActivity.TAG;
import android.app.Notification;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class NotificationDelegate {
    MainActivity mainActivity;

    public NotificationDelegate(MainActivity zmainActivity) {
        this.mainActivity = zmainActivity;
        if (NotificationListener.instance != null) {
            replaceNotifications(NotificationListener.instance.getActiveNotifications());
        }
    }

    private Bitmap getMediaArtwork(MediaMetadata metadata) {
        Bitmap artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (artwork == null) artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (artwork == null) artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        return artwork;
    }

    private boolean hasContentArtworkUri(MediaMetadata metadata) {
        String[] artworkUris = {
                metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI),
                metadata.getString(MediaMetadata.METADATA_KEY_ART_URI),
                metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI)
        };
        for (String artworkUri : artworkUris) {
            if (artworkUri != null && "content".equals(android.net.Uri.parse(artworkUri).getScheme())) {
                return true;
            }
        }
        return false;
    }

    private String getArtworkVersion(MediaMetadata metadata) {
        String versionSource = String.valueOf(metadata.getString(MediaMetadata.METADATA_KEY_MEDIA_ID))
                + "|" + String.valueOf(metadata.getString(MediaMetadata.METADATA_KEY_TITLE))
                + "|" + String.valueOf(metadata.getString(MediaMetadata.METADATA_KEY_ARTIST))
                + "|" + String.valueOf(metadata.getString(MediaMetadata.METADATA_KEY_ALBUM))
                + "|" + String.valueOf(metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI))
                + "|" + String.valueOf(metadata.getString(MediaMetadata.METADATA_KEY_ART_URI))
                + "|" + String.valueOf(metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI));
        return Integer.toHexString(versionSource.hashCode());
    }

    public JSONObject statusBarNotificationToJSON(StatusBarNotification sbn) {
        JSONObject json = new JSONObject();
        try {
            Notification notification = sbn.getNotification();
            String title = getFirstNotificationText(notification,
                    Notification.EXTRA_TITLE,
                    Notification.EXTRA_TITLE_BIG,
                    Notification.EXTRA_CONVERSATION_TITLE);
            String description = getFirstNotificationText(notification,
                    Notification.EXTRA_TEXT,
                    Notification.EXTRA_SUB_TEXT);
            String longDescription = getFirstNotificationText(notification,
                    Notification.EXTRA_BIG_TEXT,
                    Notification.EXTRA_TEXT);

            json.put("title", title);
            json.put("description", description);
            json.put("longDescription", longDescription);
            json.put("appLabel", getApplicationLabel(sbn.getPackageName()));
            json.put("image", "https://appassets.androidplatform.net/assets/notification-image/" + sbn.getId() + ".webp");
            JSONObject song = new JSONObject();
            MediaSession.Token token = notification.extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);
            if (token != null) {
                MediaController mediaController = new MediaController(mainActivity, token);
                MediaMetadata metadata = mediaController.getMetadata();
                PlaybackState playbackState = mediaController.getPlaybackState();

                if (metadata != null) {
                    String artist = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST);
                    String album = metadata.getString(MediaMetadata.METADATA_KEY_ALBUM);
                    String mediaTitle = metadata.getString(MediaMetadata.METADATA_KEY_TITLE);
                    Bitmap albumArt = getMediaArtwork(metadata);
                    String albumArtUri = "";
                    if (albumArt != null || hasContentArtworkUri(metadata)) {
                        albumArtUri = "https://appassets.androidplatform.net/assets/album-art/"
                                + sbn.getId() + ".webp?v=" + getArtworkVersion(metadata);
                    }
                    long duration = metadata.getLong(MediaMetadata.METADATA_KEY_DURATION);
                    song.put("artist", artist);
                    song.put("songName", mediaTitle);
                    song.put("albumName", album);
                    song.put("albumCover", albumArtUri);
                    song.put("songDuration", duration);
                    song.put("currentPlayback", playbackState == null ? 0 : playbackState.getPosition());
                }

                if (playbackState != null) {
                    int state = playbackState.getState();
                    song.put("playbackState", state);
                    song.put("isPlaying", state == PlaybackState.STATE_PLAYING);
                }
            }

            json.put("song", song);
            json.put("packageName", sbn.getPackageName());
            json.put("postTime", sbn.getPostTime());
            json.put("id", sbn.getId());
            json.put("tag", sbn.getTag());
            json.put("key", sbn.getKey());
            json.put("groupKey", sbn.getGroupKey());
            json.put("isOngoing", sbn.isOngoing());
            json.put("isClearable", sbn.isClearable());
            json.put("isGroupSummary", (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0);
            json.put("notification", notification);
        } catch (Exception e) {
            Log.e("NotificationDelegate", "Error converting StatusBarNotification to JSON: " + e.getMessage());
        }
        return json;
    }

    private String getFirstNotificationText(Notification notification, String... keys) {
        for (String key : keys) {
            CharSequence value = notification.extras.getCharSequence(key);
            if (value != null && value.length() > 0) {
                return value.toString();
            }
        }
        return "";
    }

    private String getApplicationLabel(String packageName) {
        try {
            return mainActivity.getPackageManager()
                    .getApplicationLabel(mainActivity.getPackageManager().getApplicationInfo(packageName, 0))
                    .toString();
        } catch (Exception error) {
            return packageName;
        }
    }

    public final List<StatusBarNotification> notifications = new CopyOnWriteArrayList<>();

    public void replaceNotifications(StatusBarNotification[] activeNotifications) {
        notifications.clear();
        if (activeNotifications != null) {
            notifications.addAll(Arrays.asList(activeNotifications));
        }
    }

    public void onNotificationPosted(StatusBarNotification sbn) {
        for (int i = 0; i < notifications.size(); i++) {
            if (notifications.get(i).getKey().equals(sbn.getKey())) {
                notifications.set(i, sbn);
                dispatchNotificationEvent(WebEvents.events.notificationPosted, sbn);
                return;
            }
        }
        notifications.add(sbn);
        dispatchNotificationEvent(WebEvents.events.notificationPosted, sbn);
    }

    public void onNotificationRemoved(StatusBarNotification sbn) {
        notifications.removeIf(notification -> notification.getKey().equals(sbn.getKey()));
        dispatchNotificationEvent(WebEvents.events.notificationRemoved, sbn);
    }

    private void dispatchNotificationEvent(WebEvents.events event, StatusBarNotification sbn) {
        if (mainActivity.webEvents != null) {
            mainActivity.runOnUiThread(() ->
                    mainActivity.webEvents.dispatchEvent(event, statusBarNotificationToJSON(sbn)));
        }
    }

    public void dispatchNotificationsChanged() {
        if (mainActivity.webEvents != null) {
            mainActivity.runOnUiThread(() ->
                    mainActivity.webEvents.dispatchEvent(WebEvents.events.notificationsChanged));
        }
    }

    public List<StatusBarNotification> getAllNotifications() {
        return new ArrayList<>(notifications);
    }

    public String getAllNotificationsJSON() {
        List<JSONObject> jsonList = new ArrayList<>();
        for (StatusBarNotification sbn : getAllNotifications()) {
            jsonList.add(statusBarNotificationToJSON(sbn));
        }
        return jsonList.toString();
    }

    public StatusBarNotification getNotificationById(String iconFileName) {
        for (StatusBarNotification sbn : getAllNotifications()) {
            if (sbn.getId() == Integer.parseInt(iconFileName)) {
                return sbn;
            }
        }
        return null;
    }
}
