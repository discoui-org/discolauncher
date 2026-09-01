package io.github.cherryhoax.discolauncher;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class Utils {
    public static InputStream loadDrawableAsStream(Drawable drawable) {
        Bitmap bitmap;
        if (drawable instanceof BitmapDrawable) {
            bitmap = ((BitmapDrawable) drawable).getBitmap();
        } else {
            // Create a bitmap if the drawable is not a BitmapDrawable
            bitmap = Bitmap.createBitmap(drawable.getIntrinsicWidth(), drawable.getIntrinsicHeight(), Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
            drawable.draw(canvas);
        }
        // Define the max size
        int maxSize = 200;

// Check dimensions and resize if necessary
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        if (width > maxSize || height > maxSize) {
            float ratio = Math.min((float) maxSize / width, (float) maxSize / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
            bitmap = Bitmap.createScaledBitmap(bitmap, width, height, true);
        }

// Convert the resized bitmap to InputStream
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.WEBP, 100, byteArrayOutputStream); // im not sure if webp is the fastest 😭
        byte[] byteArray = byteArrayOutputStream.toByteArray();
        InputStream inputStream = new ByteArrayInputStream(byteArray);
        return inputStream;
    }

    public static InputStream loadBitmapAsStream(Bitmap bitmap) {
        return loadBitmapAsStream(bitmap, 0);
    }

    /**
     * Encodes an icon at the requested maximum edge length. Keeping the resize
     * here means WebView never has to decode a full launcher-icon bitmap for a
     * much smaller CSS image.
     */
    public static InputStream loadBitmapAsStream(Bitmap bitmap, int maxSize) {
        return new ByteArrayInputStream(bitmapAsWebpBytes(bitmap, maxSize));
    }

    /** Encodes an icon once so ContentServer can retain its WebP bytes. */
    public static byte[] bitmapAsWebpBytes(Bitmap bitmap, int maxSize) {
        if (maxSize > 0 && (bitmap.getWidth() > maxSize || bitmap.getHeight() > maxSize)) {
            float ratio = Math.min((float) maxSize / bitmap.getWidth(), (float) maxSize / bitmap.getHeight());
            bitmap = Bitmap.createScaledBitmap(
                    bitmap,
                    Math.max(1, Math.round(bitmap.getWidth() * ratio)),
                    Math.max(1, Math.round(bitmap.getHeight() * ratio)),
                    true
            );
        }
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        // Compress the bitmap (you can change the format and quality)
        bitmap.compress(Bitmap.CompressFormat.WEBP, 100, byteArrayOutputStream);
        return byteArrayOutputStream.toByteArray();
    }
}
