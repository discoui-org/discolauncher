package io.github.cherryhoax.discolauncher;

import android.app.Activity;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.ContextThemeWrapper;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hosts Android widgets offscreen and sends versioned WebP snapshot URLs to the web UI.
 */
final class NativeWidgetManager {
    static final int BIND_REQUEST_CODE = 9812;
    private static final int HOST_ID = 0xD15C1;
    private static final int DEFAULT_WIDTH = 800;
    private static final int DEFAULT_HEIGHT = 400;
    private static final int MAX_SNAPSHOT_EDGE = 1024;
    private static final String PREFERENCES = "native_widget_hosts";

    private final MainActivity activity;
    private final AppWidgetManager appWidgetManager;
    private final AppWidgetHost appWidgetHost;
    private final Context widgetContext;
    private final SharedPreferences preferences;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService snapshotEncoder = Executors.newSingleThreadExecutor();
    private final Map<String, WidgetState> widgets = new HashMap<>();
    private final Map<Integer, WidgetState> hostedWidgets = new HashMap<>();
    private final Map<Integer, WidgetState> pendingBindings = new HashMap<>();
    private FrameLayout parkingLot;

    NativeWidgetManager(MainActivity activity) {
        this.activity = activity;
        appWidgetManager = AppWidgetManager.getInstance(activity);
        appWidgetHost = new AppWidgetHost(activity, HOST_ID) {
            @Override
            protected AppWidgetHostView onCreateView(Context context, int appWidgetId,
                                                      AppWidgetProviderInfo appWidget) {
                return new SnapshotHostView(context, appWidgetId);
            }
        };
        // RemoteViews need a framework inflater. An AppCompat activity context
        // creates views that providers are not permitted to mutate.
        widgetContext = new ContextThemeWrapper(
                activity.getApplicationContext(), android.R.style.Theme_DeviceDefault);
        preferences = activity.getSharedPreferences(PREFERENCES, Activity.MODE_PRIVATE);
        appWidgetHost.startListening();
    }

    String getProviders(String packageName) {
        JSONArray result = new JSONArray();
        List<AppWidgetProviderInfo> providers = appWidgetManager.getInstalledProviders();
        for (AppWidgetProviderInfo provider : providers) {
            if (packageName != null && !packageName.isEmpty()
                    && !packageName.equals(provider.provider.getPackageName())) continue;
            try {
                JSONObject item = new JSONObject();
                item.put("id", provider.provider.flattenToString());
                item.put("packageName", provider.provider.getPackageName());
                item.put("label", provider.loadLabel(activity.getPackageManager()));
                item.put("minWidth", provider.minWidth);
                item.put("minHeight", provider.minHeight);
                result.put(item);
            } catch (JSONException ignored) {
            }
        }
        return result.toString();
    }

    String getSnapshot(String providerId, int width, int height) {
        ComponentName provider = ComponentName.unflattenFromString(providerId);
        if (provider == null || !hasProvider(provider)) {
            return state("unavailable", null, "Widget provider is unavailable");
        }

        WidgetState widget;
        boolean sizeChanged;
        synchronized (widgets) {
            widget = widgets.get(providerId);
            if (widget == null) {
                widget = new WidgetState(provider);
                int storedWidgetId = preferences.getInt(providerId,
                        AppWidgetManager.INVALID_APPWIDGET_ID);
                AppWidgetProviderInfo storedInfo = storedWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID
                        ? null : appWidgetManager.getAppWidgetInfo(storedWidgetId);
                if (storedInfo != null && provider.equals(storedInfo.provider)) {
                    widget.appWidgetId = storedWidgetId;
                } else if (storedWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                    preferences.edit().remove(providerId).apply();
                }
                widgets.put(providerId, widget);
            }
            int requestedWidth = Math.max(1, width);
            int requestedHeight = Math.max(1, height);
            sizeChanged = widget.width != requestedWidth || widget.height != requestedHeight;
            widget.width = requestedWidth;
            widget.height = requestedHeight;
        }

        if (widget.appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            beginBinding(widget);
            return state(widget.error == null ? "pending" : "error", null, widget.error);
        }
        if (widget.hostView == null) {
            attachWidget(widget);
            return state("pending", null, null);
        }
        if (sizeChanged) {
            resizeWidget(widget);
            return state("pending", null, null);
        }
        if (widget.snapshotUrl != null) return state("ready", widget.snapshotUrl, null);
        queueSnapshot(widget, 0L);
        return state("pending", null, widget.error);
    }

    boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != BIND_REQUEST_CODE) return false;
        int widgetId = data == null
                ? AppWidgetManager.INVALID_APPWIDGET_ID
                : data.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                        AppWidgetManager.INVALID_APPWIDGET_ID);
        WidgetState widget;
        synchronized (widgets) {
            widget = pendingBindings.remove(widgetId);
            if (widget == null && pendingBindings.size() == 1) {
                widget = pendingBindings.values().iterator().next();
                pendingBindings.clear();
            }
        }
        if (widget == null) return true;

        if (resultCode != Activity.RESULT_OK) {
            widget.error = "Widget access was not allowed";
            widget.binding = false;
            if (widget.appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                appWidgetHost.deleteAppWidgetId(widget.appWidgetId);
                preferences.edit().remove(widget.provider.flattenToString()).apply();
                widget.appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
            }
            publish(widget, "error");
            return true;
        }
        attachWidget(widget);
        return true;
    }

    void tap(String providerId, float x, float y) {
        if (providerId == null) return;
        WidgetState widget;
        synchronized (widgets) {
            widget = widgets.get(providerId);
        }
        if (widget == null || widget.hostView == null) return;

        activity.runOnUiThread(() -> {
            if (widget.hostView == null) return;
            float touchX = Math.max(0, Math.min(x, widget.width - 1));
            float touchY = Math.max(0, Math.min(y, widget.height - 1));
            long downTime = SystemClock.uptimeMillis();
            dispatchTouch(widget.hostView, downTime, downTime, MotionEvent.ACTION_DOWN, touchX, touchY);
            dispatchTouch(widget.hostView, downTime, downTime + 16L, MotionEvent.ACTION_UP, touchX, touchY);
        });
    }

    void destroy() {
        appWidgetHost.stopListening();
        snapshotEncoder.shutdownNow();
    }

    private void beginBinding(WidgetState widget) {
        if (widget.binding || widget.hostView != null || widget.error != null) return;
        widget.binding = true;
        activity.runOnUiThread(() -> {
            try {
                widget.appWidgetId = appWidgetHost.allocateAppWidgetId();
                preferences.edit().putInt(widget.provider.flattenToString(), widget.appWidgetId).apply();
                synchronized (widgets) {
                    pendingBindings.put(widget.appWidgetId, widget);
                }
                if (appWidgetManager.bindAppWidgetIdIfAllowed(widget.appWidgetId, widget.provider)) {
                    synchronized (widgets) {
                        pendingBindings.remove(widget.appWidgetId);
                    }
                    attachWidget(widget);
                    return;
                }
                Intent bindIntent = new Intent(AppWidgetManager.ACTION_APPWIDGET_BIND);
                bindIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget.appWidgetId);
                bindIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, widget.provider);
                activity.startActivityForResult(bindIntent, BIND_REQUEST_CODE);
            } catch (RuntimeException error) {
                widget.error = "Could not bind widget";
                widget.binding = false;
                publish(widget, "error");
            }
        });
    }

    private boolean hasProvider(ComponentName provider) {
        for (AppWidgetProviderInfo item : appWidgetManager.getInstalledProviders()) {
            if (provider.equals(item.provider)) return true;
        }
        return false;
    }

    private void attachWidget(WidgetState widget) {
        activity.runOnUiThread(() -> {
            if (widget.hostView != null) return;
            AppWidgetProviderInfo info = appWidgetManager.getAppWidgetInfo(widget.appWidgetId);
            if (info == null) {
                widget.error = "Could not create widget host";
                widget.binding = false;
                publish(widget, "error");
                return;
            }
            synchronized (widgets) {
                hostedWidgets.put(widget.appWidgetId, widget);
            }
            widget.hostView = appWidgetHost.createView(widgetContext, widget.appWidgetId, info);
            // AppWidgetHostView normally applies launcher-style outer insets.
            // Disco renders a bitmap tile edge-to-edge, so those host insets
            // would become permanent empty pixels in every snapshot.
            widget.hostView.setPadding(0, 0, 0, 0);
            widget.hostView.setClipToPadding(false);
            appWidgetManager.updateAppWidgetOptions(widget.appWidgetId, widgetOptions(widget));
            ensureParkingLot();
            FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(widget.width, widget.height);
            layout.leftMargin = -widget.width;
            parkingLot.addView(widget.hostView, layout);
            widget.binding = false;
            queueSnapshot(widget, 500L);
        });
    }

    private void resizeWidget(WidgetState widget) {
        activity.runOnUiThread(() -> {
            if (widget.hostView == null) return;
            appWidgetManager.updateAppWidgetOptions(widget.appWidgetId, widgetOptions(widget));
            ViewGroup.LayoutParams current = widget.hostView.getLayoutParams();
            if (current instanceof FrameLayout.LayoutParams) {
                FrameLayout.LayoutParams layout = (FrameLayout.LayoutParams) current;
                layout.width = widget.width;
                layout.height = widget.height;
                layout.leftMargin = -widget.width;
                widget.hostView.setLayoutParams(layout);
            }
            widget.hostView.requestLayout();
            queueSnapshot(widget, 350L);
        });
    }

    private void ensureParkingLot() {
        if (parkingLot != null) return;
        parkingLot = new FrameLayout(activity);
        parkingLot.setClipChildren(false);
        activity.addContentView(parkingLot, new ViewGroup.LayoutParams(1, 1));
    }

    private Bundle widgetOptions(WidgetState widget) {
        Bundle options = new Bundle();
        int density = activity.getResources().getDisplayMetrics().densityDpi;
        int widthDp = Math.max(1, widget.width * 160 / density);
        int heightDp = Math.max(1, widget.height * 160 / density);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, widthDp);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, widthDp);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, heightDp);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, heightDp);
        return options;
    }

    private void queueSnapshot(WidgetState widget, long delayMs) {
        if (widget.hostView == null || widget.snapshotQueued) return;
        widget.snapshotQueued = true;
        mainHandler.postDelayed(() -> captureSnapshot(widget), delayMs);
    }

    private void captureSnapshot(WidgetState widget) {
        widget.snapshotQueued = false;
        if (widget.hostView == null) return;
        final Bitmap bitmap;
        final int generation = ++widget.snapshotGeneration;
        try {
            widget.hostView.measure(
                    View.MeasureSpec.makeMeasureSpec(widget.width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(widget.height, View.MeasureSpec.EXACTLY));
            widget.hostView.layout(0, 0, widget.width, widget.height);
            bitmap = Bitmap.createBitmap(widget.width, widget.height, Bitmap.Config.ARGB_8888);
            widget.hostView.draw(new Canvas(bitmap));
        } catch (RuntimeException error) {
            widget.error = "Could not render widget";
            publish(widget, "error");
            return;
        }

        snapshotEncoder.execute(() -> {
            byte[] encoded = encodeSnapshot(bitmap);
            mainHandler.post(() -> {
                if (widget.snapshotGeneration != generation || encoded == null) return;
                NativeWidgetSnapshotStore.put(widget.provider.flattenToString(), encoded);
                widget.snapshotVersion++;
                widget.snapshotUrl = "https://appassets.androidplatform.net/assets/native-widget/"
                        + NativeWidgetSnapshotStore.keyFor(widget.provider.flattenToString())
                        + ".webp?v=" + widget.snapshotVersion;
                widget.error = null;
                publish(widget, "ready");
            });
        });
    }

    private static byte[] encodeSnapshot(Bitmap bitmap) {
        Bitmap compressedBitmap = bitmap;
        int largestEdge = Math.max(bitmap.getWidth(), bitmap.getHeight());
        if (largestEdge > MAX_SNAPSHOT_EDGE) {
            float scale = (float) MAX_SNAPSHOT_EDGE / largestEdge;
            compressedBitmap = Bitmap.createScaledBitmap(bitmap,
                    Math.max(1, Math.round(bitmap.getWidth() * scale)),
                    Math.max(1, Math.round(bitmap.getHeight() * scale)), true);
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        boolean successful = compressedBitmap.compress(Bitmap.CompressFormat.WEBP_LOSSY, 85, output);
        if (compressedBitmap != bitmap) compressedBitmap.recycle();
        bitmap.recycle();
        return successful ? output.toByteArray() : null;
    }

    private static void dispatchTouch(View view, long downTime, long eventTime,
                                      int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(downTime, eventTime, action, x, y, 0);
        try {
            view.dispatchTouchEvent(event);
        } finally {
            event.recycle();
        }
    }

    private void publish(WidgetState widget, String snapshotState) {
        try {
            JSONObject payload = new JSONObject()
                    .put("providerId", widget.provider.flattenToString())
                    .put("state", snapshotState);
            if (widget.snapshotUrl != null) payload.put("url", widget.snapshotUrl);
            if (widget.error != null) payload.put("error", widget.error);
            activity.webEvents.dispatchEvent("nativeWidgetSnapshot", payload);
        } catch (JSONException ignored) {
        }
    }

    private final class SnapshotHostView extends AppWidgetHostView {
        private final int appWidgetId;

        SnapshotHostView(Context context, int appWidgetId) {
            super(context);
            this.appWidgetId = appWidgetId;
        }

        @Override
        public void updateAppWidget(RemoteViews remoteViews) {
            super.updateAppWidget(remoteViews);
            WidgetState widget;
            synchronized (widgets) {
                widget = hostedWidgets.get(appWidgetId);
            }
            if (widget != null) queueSnapshot(widget, 150L);
        }
    }

    private static String state(String state, String url, String error) {
        try {
            JSONObject result = new JSONObject().put("state", state);
            if (url != null) result.put("url", url);
            if (error != null) result.put("error", error);
            return result.toString();
        } catch (JSONException ignored) {
            return "{\"state\":\"error\"}";
        }
    }

    private static final class WidgetState {
        final ComponentName provider;
        int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
        int width = DEFAULT_WIDTH;
        int height = DEFAULT_HEIGHT;
        int snapshotGeneration;
        long snapshotVersion;
        boolean binding;
        boolean snapshotQueued;
        String snapshotUrl;
        String error;
        AppWidgetHostView hostView;

        WidgetState(ComponentName provider) {
            this.provider = provider;
        }
    }
}
