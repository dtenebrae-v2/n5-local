package local.n5.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import org.json.JSONObject;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    private static final String ORIGIN = "http://127.0.0.1:8095";
    private static final Object START_LOCK = new Object();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private FrameLayout root;
    private TextView status;
    private WebView web;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private String pendingDownload;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(248, 248, 242));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
            getWindow().getInsetsController().setSystemBarsAppearance(
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::goBack);
        }
        showLoading();
        worker.execute(() -> {
            try {
                synchronized (START_LOCK) {
                    File content = installContent();
                    File user = new File(getFilesDir(), "user");
                    if (!user.isDirectory() && !user.mkdirs()) throw new java.io.IOException("Не удалось создать хранилище");
                    if (!Python.isStarted()) Python.start(new AndroidPlatform(getApplicationContext()));
                    Python.getInstance().getModule("bootstrap").callAttr("start", content.getAbsolutePath(), user.getAbsolutePath());
                }
                runOnUiThread(() -> openApp(state));
            } catch (Exception error) {
                runOnUiThread(() -> showError(error));
            }
        });
    }

    private void showLoading() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(android.view.Gravity.CENTER);
        box.setPadding(32, 32, 32, 32);
        status = new TextView(this);
        status.setTextSize(18);
        status.setText("N5 Local\nПодготавливаем материалы…\nПри первом запуске это займёт некоторое время.");
        status.setGravity(android.view.Gravity.CENTER);
        box.addView(new ProgressBar(this));
        box.addView(status);
        root.addView(box);
    }

    private File installContent() throws Exception {
        JSONObject manifest;
        try (InputStream input = getAssets().open("content.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            copy(input, bytes);
            manifest = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        }
        File directory = new File(getFilesDir(), "content/" + manifest.getString("sha256"));
        File ready = new File(directory, ".ready");
        if (ready.isFile()) return directory;
        if (getFilesDir().getUsableSpace() < manifest.getLong("unpackedBytes") + 64L * 1024 * 1024) {
            throw new java.io.IOException("Недостаточно памяти. Освободи не менее 750 МБ для распаковки материалов.");
        }
        if (!directory.isDirectory() && !directory.mkdirs()) throw new java.io.IOException("Не удалось распаковать материалы");
        String prefix = directory.getCanonicalPath() + File.separator;
        long copied = 0;
        int count = 0;
        int lastPercent = -1;
        byte[] buffer = new byte[65536];
        try (ZipInputStream archive = new ZipInputStream(getAssets().open("content.zip"))) {
            ZipEntry entry;
            while ((entry = archive.getNextEntry()) != null) {
                File destination = new File(directory, entry.getName());
                if (!destination.getCanonicalPath().startsWith(prefix)) throw new java.io.IOException("Некорректный путь материала");
                if (entry.isDirectory()) continue;
                File parent = destination.getParentFile();
                if (!parent.isDirectory() && !parent.mkdirs()) throw new java.io.IOException("Не удалось создать папку материалов");
                try (OutputStream output = new FileOutputStream(destination)) {
                    int bytes;
                    while ((bytes = archive.read(buffer)) != -1) {
                        output.write(buffer, 0, bytes);
                        copied += bytes;
                        int percent = (int) (copied * 100 / manifest.getLong("unpackedBytes"));
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            final int progress = percent;
                            runOnUiThread(() -> status.setText("N5 Local\nРаспаковываем книги и аудио: " + progress + "%"));
                        }
                    }
                }
                count++;
            }
        }
        if (count != manifest.getInt("files") || copied != manifest.getLong("unpackedBytes")) {
            throw new java.io.IOException("Неполный комплект материалов");
        }
        try (OutputStream output = new FileOutputStream(ready)) {
            output.write(manifest.getString("sha256").getBytes(StandardCharsets.UTF_8));
        }
        return directory;
    }

    private static boolean isInternal(Uri url) {
        return "http".equals(url.getScheme()) && "127.0.0.1".equals(url.getHost()) && url.getPort() == 8095;
    }

    private void openApp(Bundle state) {
        if (isFinishing() || isDestroyed()) return;
        root.removeAllViews();
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(248, 248, 242));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isInternal(url)) return false;
                if ("https".equals(url.getScheme()) || "http".equals(url.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); }
                    catch (android.content.ActivityNotFoundException ignored) { }
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreen != null) { callback.onCustomViewHidden(); return; }
                fullscreen = view;
                fullscreenCallback = callback;
                web.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
            }
            @Override public void onHideCustomView() { exitFullscreen(); }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (!isInternal(Uri.parse(url))) return;
            pendingDownload = url;
            String filename = Uri.parse(url).getLastPathSegment();
            if ("text/csv".equals(mime) || url.contains("export.csv")) filename = "n5-vocabulary.csv";
            else if ("application/pdf".equals(mime)) filename = "n5-book.pdf";
            else if ("audio/mpeg".equals(mime)) filename = "n5-audio.mp3";
            Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(mime == null ? "application/octet-stream" : mime);
            create.addCategory(Intent.CATEGORY_OPENABLE);
            create.putExtra(Intent.EXTRA_TITLE, filename);
            startActivityForResult(create, 1);
        });
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        if (state == null || web.restoreState(state) == null) web.loadUrl(ORIGIN + "/jlpt/n5");
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        String url = pendingDownload;
        pendingDownload = null;
        if (request != 1 || result != RESULT_OK || data == null || url == null) return;
        Uri destination = data.getData();
        worker.execute(() -> {
            try (InputStream input = new URL(url).openStream(); OutputStream output = getContentResolver().openOutputStream(destination)) {
                if (output == null) throw new java.io.IOException("Не удалось открыть файл");
                copy(input, output);
            } catch (Exception error) { runOnUiThread(() -> showError(error)); }
        });
    }

    private void exitFullscreen() {
        if (fullscreen == null) return;
        root.removeView(fullscreen);
        fullscreen = null;
        web.setVisibility(View.VISIBLE);
        fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
    }

    private static void copy(InputStream input, OutputStream output) throws java.io.IOException {
        byte[] buffer = new byte[65536];
        int length;
        while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
    }

    private void goBack() {
        if (fullscreen != null) exitFullscreen();
        else if (web != null) {
            web.evaluateJavascript("(() => { const dialog = document.querySelector('dialog[open]'); "
                + "if (dialog) { if (dialog.dispatchEvent(new Event('cancel', {cancelable: true}))) dialog.close(); return true; } "
                + "const menu = document.querySelector('.menu-toggle[aria-expanded=\"true\"]'); "
                + "if (menu) { menu.click(); menu.focus(); return true; } return false; })()", handled -> {
                    if (isFinishing() || isDestroyed() || "true".equals(handled)) return;
                    if (web.canGoBack()) web.goBack(); else finish();
                });
        } else finish();
    }

    @Override public void onBackPressed() { goBack(); }
    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null) web.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override protected void onDestroy() {
        if (web != null) { root.removeView(web); web.destroy(); }
        worker.shutdown();
        super.onDestroy();
    }
    private void showError(Exception error) {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this).setTitle("N5 Local")
            .setMessage("Не удалось выполнить действие.\n" + error.getMessage())
            .setPositiveButton("Закрыть", (dialog, which) -> dialog.dismiss()).show();
    }
}
