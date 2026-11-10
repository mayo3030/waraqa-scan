package com.mina.waraqa;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
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

/**
 * Screen orientation lock, saving photos to the phone's gallery, and API keys
 * kept encrypted with a key that never leaves the Android Keystore.
 */
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

    private static final String ALIAS = "waraqa-secrets";
    private static final String PREFS = "waraqa_secrets";

    private SecretKey secretKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return kg.generateKey();
    }

    private SharedPreferences store() {
        return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void setSecret(PluginCall call) {
        String name = call.getString("name");
        String value = call.getString("value");
        if (name == null || value == null) { call.reject("Missing name or value"); return; }
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
            store().edit().putString(name, packed).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not save the key");
        }
    }

    @PluginMethod
    public void getSecret(PluginCall call) {
        String name = call.getString("name");
        String packed = name == null ? null : store().getString(name, null);
        JSObject r = new JSObject();
        if (packed == null) { r.put("value", null); call.resolve(r); return; }
        try {
            String[] parts = packed.split(":", 2);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            r.put("value", new String(c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not read the key");
        }
    }

    @PluginMethod
    public void removeSecret(PluginCall call) {
        String name = call.getString("name");
        if (name != null) store().edit().remove(name).apply();
        call.resolve();
    }
}
