package io.github.cherryhoax.discolauncher2;

import android.content.Context;
import android.util.Log;

import androidx.annotation.Keep;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.TimeUnit;

/** Runs package-manager operations inside Shizuku's privileged UserService. */
@Keep
public class ShizukuPackageService extends IShizukuPackageService.Stub {
    private static final String TAG = "ShizukuPackageService";
    private static final long COMMAND_TIMEOUT_MS = 30_000L;

    public ShizukuPackageService() {
    }

    @Keep
    public ShizukuPackageService(Context context) {
    }

    @Override
    public boolean uninstall(String packageName, int userId) {
        if (packageName == null || !packageName.matches("[A-Za-z0-9._]+") || userId < 0) {
            Log.e(TAG, "Invalid uninstall request");
            return false;
        }

        Process process = null;
        try {
            process = new ProcessBuilder(
                    "/system/bin/pm", "uninstall", "--user", String.valueOf(userId), packageName)
                    .redirectErrorStream(true)
                    .start();
            process.getOutputStream().close();

            if (!process.waitFor(COMMAND_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                Log.e(TAG, "Uninstall timed out for " + packageName);
                process.destroy();
                return false;
            }

            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) output.append(line).append('\n');
            }

            boolean success = process.exitValue() == 0;
            Log.d(TAG, "Uninstall result for " + packageName + ": " + output);
            return success;
        } catch (Exception error) {
            if (error instanceof InterruptedException) Thread.currentThread().interrupt();
            Log.e(TAG, "Could not uninstall " + packageName, error);
            return false;
        } finally {
            if (process != null) process.destroy();
        }
    }

    @Override
    public void destroy() {
        System.exit(0);
    }
}
