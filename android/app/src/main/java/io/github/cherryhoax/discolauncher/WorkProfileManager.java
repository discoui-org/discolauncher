package io.github.cherryhoax.discolauncher2;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.LauncherActivityInfo;
import android.content.pm.LauncherApps;
import android.content.pm.LauncherUserInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Process;
import android.os.UserHandle;
import android.os.UserManager;
import android.util.DisplayMetrics;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Keeps all cross-profile launcher operations tied to a UserHandle. Package names are not
 * unique when the same application is installed in both the personal and work profiles.
 */
public final class WorkProfileManager {
    private static final String TAG = "WorkProfileManager";
    private static final int ANDROID_15_API = 35;

    private final Context context;
    private final LauncherApps launcherApps;
    private final UserManager userManager;

    public WorkProfileManager(Context context) {
        this.context = context;
        this.launcherApps = (LauncherApps) context.getSystemService(Context.LAUNCHER_APPS_SERVICE);
        this.userManager = (UserManager) context.getSystemService(Context.USER_SERVICE);
    }

    public List<UserHandle> getWorkProfiles() {
        if (launcherApps == null || userManager == null) return Collections.emptyList();

        List<UserHandle> result = new ArrayList<>();
        try {
            for (UserHandle profile : launcherApps.getProfiles()) {
                if (Process.myUserHandle().equals(profile)) continue;
                if (isManagedProfile(profile)) result.add(profile);
            }
        } catch (RuntimeException error) {
            Log.w(TAG, "Could not read launcher profiles", error);
        }
        return result;
    }

    private boolean isManagedProfile(UserHandle profile) {
        // Android 15 exposes the associated profile type publicly. Before that release,
        // LauncherApps only exposes associated secondary profiles without a public type API;
        // those profiles are the work-profile surface available to a third-party launcher.
        if (Build.VERSION.SDK_INT < ANDROID_15_API) return true;
        try {
            LauncherUserInfo userInfo = launcherApps.getLauncherUserInfo(profile);
            return userInfo != null
                    && UserManager.USER_TYPE_PROFILE_MANAGED.equals(userInfo.getUserType());
        } catch (RuntimeException error) {
            Log.w(TAG, "Could not determine launcher profile type", error);
            return false;
        }
    }

    public long getSerialNumber(UserHandle profile) {
        return userManager == null ? -1 : userManager.getSerialNumberForUser(profile);
    }

    public boolean isProfileEnabled(UserHandle profile) {
        return profile != null && !isQuietModeEnabled(profile);
    }

    public List<LauncherActivityInfo> getActivityList(UserHandle profile) {
        return getActivityList(null, profile);
    }

    private List<LauncherActivityInfo> getActivityList(String packageName, UserHandle profile) {
        if (launcherApps == null) return Collections.emptyList();
        try {
            List<LauncherActivityInfo> apps = launcherApps.getActivityList(packageName, profile);
            return apps == null ? Collections.emptyList() : apps;
        } catch (RuntimeException error) {
            Log.w(TAG, "Could not read work-profile applications", error);
            return Collections.emptyList();
        }
    }

    public String getState() throws JSONException {
        JSONObject state = new JSONObject();
        UserHandle profile = firstWorkProfile();
        boolean available = profile != null;
        state.put("available", available);
        state.put("enabled", available && !isQuietModeEnabled(profile));
        state.put("userSerial", available ? getSerialNumber(profile) : -1);
        return state.toString();
    }

    public String setEnabled(boolean enabled) throws JSONException {
        UserHandle profile = firstWorkProfile();
        boolean accepted = false;
        if (profile != null && userManager != null
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            boolean currentlyEnabled = !isQuietModeEnabled(profile);
            if (currentlyEnabled != enabled) {
                try {
                    accepted = userManager.requestQuietModeEnabled(!enabled, profile);
                } catch (RuntimeException error) {
                    Log.w(TAG, "Could not change work-profile quiet mode", error);
                }
            } else {
                accepted = true;
            }
        }

        JSONObject state = new JSONObject(getState());
        state.put("requestAccepted", accepted);
        return state.toString();
    }

    private boolean isQuietModeEnabled(UserHandle profile) {
        if (userManager == null || profile == null) return false;
        try {
            return userManager.isQuietModeEnabled(profile);
        } catch (RuntimeException error) {
            Log.w(TAG, "Could not read work-profile quiet mode", error);
            return false;
        }
    }

    private UserHandle firstWorkProfile() {
        List<UserHandle> profiles = getWorkProfiles();
        return profiles.isEmpty() ? null : profiles.get(0);
    }

    private UserHandle getWorkProfileForSerial(long userSerial) {
        for (UserHandle profile : getWorkProfiles()) {
            if (getSerialNumber(profile) == userSerial) return profile;
        }
        return null;
    }

    public boolean launchApp(String packageNameWithActivity, long userSerial) {
        UserHandle profile = getWorkProfileForSerial(userSerial);
        if (profile == null || launcherApps == null || isQuietModeEnabled(profile)) return false;

        PackageActivity packageActivity = PackageActivity.parse(packageNameWithActivity);
        for (LauncherActivityInfo app : getActivityList(packageActivity.packageName, profile)) {
            ComponentName component = app.getComponentName();
            if (packageActivity.activityName == null
                    || packageActivity.activityName.equals(component.getClassName())) {
                try {
                    launcherApps.startMainActivity(component, profile, null, null);
                    return true;
                } catch (RuntimeException error) {
                    Log.w(TAG, "Could not launch work-profile application", error);
                    return false;
                }
            }
        }
        return false;
    }

    public Bitmap getAppIcon(String packageNameWithActivity, long userSerial, boolean background) {
        UserHandle profile = userSerial < 0
                ? Process.myUserHandle()
                : getWorkProfileForSerial(userSerial);
        if (profile == null || launcherApps == null) return null;

        PackageActivity packageActivity = PackageActivity.parse(packageNameWithActivity);
        LauncherActivityInfo matchingActivity = null;
        for (LauncherActivityInfo app : getActivityList(packageActivity.packageName, profile)) {
            if (packageActivity.activityName == null
                    || packageActivity.activityName.equals(app.getComponentName().getClassName())) {
                matchingActivity = app;
                break;
            }
        }
        if (matchingActivity == null) return null;

        DisplayMetrics metrics = context.getResources().getDisplayMetrics();
        Drawable icon = matchingActivity.getIcon(metrics.densityDpi);
        return renderIconLayer(icon, background);
    }

    private Bitmap renderIconLayer(Drawable icon, boolean background) {
        if (icon == null) return null;
        if (icon instanceof AdaptiveIconDrawable) {
            Drawable layer = background
                    ? ((AdaptiveIconDrawable) icon).getBackground()
                    : ((AdaptiveIconDrawable) icon).getForeground();
            if (layer == null) return transparentBitmap();

            Bitmap bitmap = Bitmap.createBitmap(200, 200, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            if (background) {
                layer.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
            } else {
                double zoom = 1.5;
                int width = (int) (canvas.getWidth() * zoom);
                int height = (int) (canvas.getHeight() * zoom);
                int offsetX = (canvas.getWidth() - width) / 2;
                int offsetY = (canvas.getHeight() - height) / 2;
                layer.setBounds(offsetX, offsetY, offsetX + width, offsetY + height);
            }
            layer.draw(canvas);
            return bitmap;
        }

        if (background) return transparentBitmap();
        if (icon instanceof BitmapDrawable) return ((BitmapDrawable) icon).getBitmap();

        int width = Math.max(1, icon.getIntrinsicWidth());
        int height = Math.max(1, icon.getIntrinsicHeight());
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        icon.setBounds(0, 0, width, height);
        icon.draw(canvas);
        return bitmap;
    }

    private Bitmap transparentBitmap() {
        Bitmap bitmap = Bitmap.createBitmap(10, 10, Bitmap.Config.ARGB_8888);
        bitmap.eraseColor(Color.TRANSPARENT);
        return bitmap;
    }

    private static final class PackageActivity {
        final String packageName;
        final String activityName;

        private PackageActivity(String packageName, String activityName) {
            this.packageName = packageName;
            this.activityName = activityName;
        }

        static PackageActivity parse(String value) {
            String[] parts = value.split("[/|]", 2);
            return new PackageActivity(parts[0], parts.length > 1 ? parts[1] : null);
        }
    }
}
