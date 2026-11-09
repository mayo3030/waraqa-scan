package com.mina.waraqa;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    // Plugin work runs off the UI thread. Replying to the page, and starting
    // the install screen, has to happen on the UI thread or the promise never
    // comes back and the install screen never opens.
    private void onMain(Runnable r) {
        Activity a = getActivity();
        if (a != null) a.runOnUiThread(r);
        else r.run();
    }

    private HttpURLConnection open(String u) throws IOException {
        for (int i = 0; i < 8; i++) {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000); c.setReadTimeout(60000);
            // GitHub answers 403 when the request has no User-Agent.
            c.setRequestProperty("User-Agent", "WaraqaScan Android");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) { u = new URL(new URL(u), c.getHeaderField("Location")).toString(); c.disconnect(); continue; }
            if (code != 200) throw new IOException("HTTP " + code);
            return c;
        }
        throw new IOException("Too many redirects");
    }

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("versionCode", Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
            r.put("versionName", p.versionName);
            call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void fetchText(PluginCall call) {
        String url = call.getString("url");
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                c = open(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis());
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                try (InputStream in = c.getInputStream()) { byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) b.write(buf, 0, n); }
                JSObject r = new JSObject(); r.put("text", b.toString("UTF-8"));
                onMain(() -> call.resolve(r));
            } catch (Exception e) {
                String msg = e.getMessage();
                onMain(() -> call.reject(msg));
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            onMain(() -> {
                try { getContext().startActivity(i); call.resolve(); }
                catch (Exception e) { call.reject(e.getMessage()); }
            });
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates"); dir.mkdirs();
                File f = new File(dir, "update.apk");
                c = open(url);
                long total = c.getContentLengthLong(), done = 0, last = 0;
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(f)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n); done += n;
                        if (done - last > 262144) {
                            last = done;
                            long sent = done;
                            onMain(() -> {
                                JSObject p = new JSObject(); p.put("done", sent); p.put("total", total);
                                notifyListeners("progress", p);
                            });
                        }
                    }
                }
                byte[] head = new byte[2];
                try (InputStream in = new FileInputStream(f)) { in.read(head); }
                if (head[0] != 'P' || head[1] != 'K') throw new IOException("Downloaded file is not an APK");
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                onMain(() -> {
                    try {
                        getContext().startActivity(i);
                        call.resolve();
                    } catch (Exception e) { call.reject(e.getMessage()); }
                });
            } catch (Exception e) {
                String msg = e.getMessage();
                onMain(() -> call.reject(msg));
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }
}
