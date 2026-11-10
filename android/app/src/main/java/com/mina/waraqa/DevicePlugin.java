package com.mina.waraqa;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Screen orientation lock and saving photos to the phone's gallery. */
@CapacitorPlugin(name = "Device")
public class DevicePlugin extends Plugin {

    @PluginMethod
    public void setOrientation(PluginCall call) {
        String mode = call.getString("mode", "auto");
        final int o = "portrait".equals(mode) ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            : "landscape".equals(mode) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        getActivity().runOnUiThread(() -> {
            getActivity().setRequestedOrientation(o);
            call.resolve();
        });
    }

    /** Copies a JPEG the app wrote (file:// uri) into Pictures/Waraqa. Android 10 and newer. */
    @PluginMethod
    public void saveToGallery(PluginCall call) {
        String uri = call.getString("uri");
        String name = call.getString("name", "Waraqa.jpg");
        if (uri == null) { call.reject("No file"); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { call.reject("Needs Android 10 or newer"); return; }
        File file = new File(Uri.parse(uri).getPath());
        if (!file.exists()) { call.reject("File not found"); return; }
        ContentResolver cr = getContext().getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Waraqa");
        v.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri out = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
        if (out == null) { call.reject("Gallery not available"); return; }
        try (InputStream in = new FileInputStream(file); OutputStream os = cr.openOutputStream(out)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
        } catch (Exception e) {
            cr.delete(out, null, null);
            call.reject("Could not save", e);
            return;
        }
        v.clear();
        v.put(MediaStore.Images.Media.IS_PENDING, 0);
        cr.update(out, v, null, null);
        file.delete();
        JSObject r = new JSObject();
        r.put("uri", out.toString());
        call.resolve(r);
    }
}
