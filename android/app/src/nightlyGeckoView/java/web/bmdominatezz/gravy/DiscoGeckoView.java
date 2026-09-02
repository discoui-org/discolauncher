package io.github.cherryhoax.discolauncher2;
import android.content.Context;
import android.content.res.AssetManager;

import java.io.IOException;
import java.io.InputStream;

import fi.iki.elonen.NanoHTTPD;

import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;

public class DiscoGeckoView extends GeckoView{
    private final GeckoSession session;
    private final GeckoBridgeServer assetServer;

    public DiscoGeckoView(Context context) {
        super(context);

        assetServer = new GeckoBridgeServer((MainActivity) context);
        try {
            assetServer.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
        } catch (IOException exception) {
            throw new IllegalStateException("Could not start the GeckoView asset server", exception);
        }

        GeckoRuntime runtime = GeckoRuntime.getDefault(context);
        session = new GeckoSession();
        session.getSettings().setAllowJavascript(true);
        session.open(runtime);
        setSession(session);
        session.loadUri("http://127.0.0.1:" + assetServer.getListeningPort() + "/index.html");
    }

    @Override
    public void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        if (session.isOpen()) {
            session.close();
        }
        assetServer.stop();
    }

    private static final class AssetServer extends NanoHTTPD {
        private final AssetManager assets;

        AssetServer(Context context) {
            super("127.0.0.1", 0);
            assets = context.getAssets();
        }

        @Override
        public Response serve(IHTTPSession request) {
            if (request.getMethod() != Method.GET && request.getMethod() != Method.HEAD) {
                return newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED,
                        MIME_PLAINTEXT, "Method not allowed");
            }

            String assetPath = request.getUri();
            if ("/".equals(assetPath)) {
                assetPath = "/index.html";
            }
            assetPath = assetPath.substring(1);
            if (assetPath.contains("..")) {
                return newFixedLengthResponse(Response.Status.FORBIDDEN,
                        MIME_PLAINTEXT, "Forbidden");
            }

            try {
                InputStream stream = assets.open(assetPath);
                return newChunkedResponse(Response.Status.OK,
                        getMimeTypeForFile(assetPath), stream);
            } catch (IOException exception) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND,
                        MIME_PLAINTEXT, "Not found");
            }
        }
    }
}
