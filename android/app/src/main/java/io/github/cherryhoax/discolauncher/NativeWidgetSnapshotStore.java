package io.github.cherryhoax.discolauncher2;

import android.util.Base64;
import android.util.LruCache;

import androidx.annotation.Nullable;

import java.nio.charset.StandardCharsets;

/** In-process WebP cache for native widget snapshots served by ContentServer. */
final class NativeWidgetSnapshotStore {
    private static final int MAX_BYTES = 12 * 1024 * 1024;
    private static final LruCache<String, byte[]> snapshots = new LruCache<String, byte[]>(MAX_BYTES) {
        @Override
        protected int sizeOf(String key, byte[] value) {
            return value.length;
        }
    };

    private NativeWidgetSnapshotStore() {
    }

    static String keyFor(String providerId) {
        return Base64.encodeToString(providerId.getBytes(StandardCharsets.UTF_8),
                Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    static void put(String providerId, byte[] snapshot) {
        snapshots.put(keyFor(providerId), snapshot);
    }

    @Nullable
    static byte[] get(String key) {
        return snapshots.get(key);
    }
}
