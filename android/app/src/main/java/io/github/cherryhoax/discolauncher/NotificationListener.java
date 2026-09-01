package io.github.cherryhoax.discolauncher;

import android.app.ActivityManager;
import android.content.Context;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

public class NotificationListener extends NotificationListenerService {
    public static volatile NotificationListener instance;

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        instance = this;
        MainActivity mainActivity = MainActivity.getInstance();
        if (mainActivity != null && mainActivity.notificationDelegate != null) {
            mainActivity.notificationDelegate.replaceNotifications(getActiveNotifications());
            mainActivity.notificationDelegate.dispatchNotificationsChanged();
        }
    }

    @Override
    public void onListenerDisconnected() {
        instance = null;
        super.onListenerDisconnected();
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        Log.d("NotificationListener", "Notification received: " + sbn.getPackageName());
        MainActivity mainActivity = MainActivity.getInstance();
        if (mainActivity != null) {
            mainActivity.notificationDelegate.onNotificationPosted(sbn);
        } else {
            Log.d("NotificationListener", "MainActivity is not active.");
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        Log.d("NotificationListener", "Notification removed: " + sbn.getPackageName());
        MainActivity mainActivity = MainActivity.getInstance();
        if (mainActivity != null) {
            mainActivity.notificationDelegate.onNotificationRemoved(sbn);
        } else {
            Log.d("NotificationListener", "MainActivity is not active.");
        }
    }
}
