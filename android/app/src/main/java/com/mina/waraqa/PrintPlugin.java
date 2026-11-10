package com.mina.waraqa;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Sends a PDF the app wrote to Android's print dialog. */
@CapacitorPlugin(name = "Printer")
public class PrintPlugin extends Plugin {

    @PluginMethod
    public void printPdf(PluginCall call) {
        String uri = call.getString("uri");
        String name = call.getString("name", "Waraqa Scan");
        if (uri == null) { call.reject("No file"); return; }
        final File file = new File(Uri.parse(uri).getPath());
        if (!file.exists()) { call.reject("File not found"); return; }
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                pm.print(name, new PrintDocumentAdapter() {
                    @Override
                    public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes,
                                         CancellationSignal cancellationSignal, LayoutResultCallback callback, Bundle extras) {
                        if (cancellationSignal.isCanceled()) { callback.onLayoutCancelled(); return; }
                        PrintDocumentInfo info = new PrintDocumentInfo.Builder(name + ".pdf")
                                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                                .build();
                        callback.onLayoutFinished(info, true);
                    }

                    @Override
                    public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                                        CancellationSignal cancellationSignal, WriteResultCallback callback) {
                        try (InputStream in = new FileInputStream(file);
                             OutputStream out = new FileOutputStream(destination.getFileDescriptor())) {
                            byte[] buf = new byte[16384];
                            int n;
                            while ((n = in.read(buf)) > 0) {
                                if (cancellationSignal.isCanceled()) { callback.onWriteCancelled(); return; }
                                out.write(buf, 0, n);
                            }
                            callback.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
                        } catch (Exception e) {
                            callback.onWriteFailed(e.getMessage());
                        }
                    }
                }, null);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }
}
