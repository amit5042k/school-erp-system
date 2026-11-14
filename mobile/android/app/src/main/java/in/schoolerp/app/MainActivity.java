package in.schoolerp.app;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The WebView can't print or save blob downloads itself, so the ERP calls these instead.
        getBridge().getWebView().addJavascriptInterface(new NativeFiles(), "SchoolERPNative");
    }

    private class NativeFiles {
        @JavascriptInterface
        public void print(String jobName) {
            runOnUiThread(() -> {
                WebView webView = getBridge().getWebView();
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                String name = (jobName == null || jobName.isEmpty()) ? "School ERP" : jobName;
                pm.print(name, webView.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
            });
        }

        @JavascriptInterface
        public void saveFile(String fileName, String base64, String mime) {
            runOnUiThread(() -> {
                try {
                    byte[] data = Base64.decode(base64, Base64.DEFAULT);
                    String safeName = fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                        values.put(MediaStore.Downloads.MIME_TYPE, mime);
                        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (uri == null) throw new IllegalStateException("Could not create file");
                        try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(data); }
                        Toast.makeText(MainActivity.this, "Saved to Downloads: " + safeName, Toast.LENGTH_LONG).show();
                        share(uri, mime);
                    } else {
                        File file = new File(getCacheDir(), safeName);
                        try (FileOutputStream out = new FileOutputStream(file)) { out.write(data); }
                        share(FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", file), mime);
                    }
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Could not save file: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }

        private void share(Uri uri, String mime) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, "Open or share"));
        }
    }
}
