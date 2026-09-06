package io.github.cherryhoax.discolauncher2;

import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

@RunWith(AndroidJUnit4.class)
public class WebViewRecoveryTest {
    @Test
    public void rendererExitReplacesOnlyWebView() {
        assumeTrue("WebView".equals(MainActivity.webEngine));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            DiscoWebView[] oldView = new DiscoWebView[1];
            scenario.onActivity(activity -> {
                oldView[0] = activity.webView;
                activity.onWebRendererGone(oldView[0], true);
                assertNull(oldView[0].getParent());
                assertNull(oldView[0].webInterface);
                // Broadcasts queued for the disposed view must be harmless.
                oldView[0].webEvents.dispatchEvent("activityResume");
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            scenario.onActivity(activity -> {
                assertNotNull(activity.webView);
                assertNotSame(oldView[0], activity.webView);
                assertFalse(activity.isFinishing());
            });
        }
    }

    @Test
    public void hiddenRendererExitWaitsForReturn() {
        assumeTrue("WebView".equals(MainActivity.webEngine));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.onActivity(activity -> {
                assertTrue(activity.isActivityStopped());
                activity.onWebRendererGone(activity.webView, false);
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            scenario.onActivity(activity -> assertNull(activity.webView));
            scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(activity -> {
                assertNotNull(activity.webView);
                assertFalse(activity.isActivityStopped());
            });
        }
    }
}
