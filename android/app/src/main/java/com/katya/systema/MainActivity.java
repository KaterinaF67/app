package com.katya.systema;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int REQUEST_FILE_CHOOSER = 2001;
    private static final int REQUEST_SAVE_DOCUMENT = 2002;

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String pendingSaveName;
    private String pendingSaveContent;
    private String pendingSaveMime;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(7, 18, 17));
        window.setNavigationBarColor(Color.rgb(7, 18, 17));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 18, 17));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new NativeBridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equalsIgnoreCase(uri.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    Toast.makeText(MainActivity.this, "Не удалось открыть ссылку", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                Intent intent;
                try {
                    intent = params.createIntent();
                } catch (Exception ex) {
                    intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                }
                try {
                    startActivityForResult(intent, REQUEST_FILE_CHOOSER);
                } catch (ActivityNotFoundException ex) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "Не найден файловый менеджер", Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("ОК", (dialog, which) -> result.confirm())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("Да", (dialog, which) -> result.confirm())
                    .setNegativeButton("Нет", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
                EditText input = new EditText(MainActivity.this);
                input.setSingleLine(true);
                input.setText(defaultValue == null ? "" : defaultValue);
                input.setSelection(input.getText().length());
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setView(input)
                    .setPositiveButton("ОК", (dialog, which) -> result.confirm(input.getText().toString()))
                    .setNegativeButton("Отмена", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
                return true;
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl("file:///android_asset/web/index.html");
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    public final class NativeBridge {
        @JavascriptInterface
        public void saveText(String name, String content, String mimeType) {
            runOnUiThread(() -> {
                pendingSaveName = sanitizeName(name);
                pendingSaveContent = content == null ? "" : content;
                pendingSaveMime = (mimeType == null || mimeType.isEmpty()) ? "text/plain" : mimeType;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(pendingSaveMime);
                intent.putExtra(Intent.EXTRA_TITLE, pendingSaveName);
                try {
                    startActivityForResult(intent, REQUEST_SAVE_DOCUMENT);
                } catch (ActivityNotFoundException ex) {
                    Toast.makeText(MainActivity.this, "Не удалось открыть сохранение файла", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    private static String sanitizeName(String name) {
        if (name == null || name.trim().isEmpty()) return "systema-export.txt";
        return name.replaceAll("[\\\\/:*?\"<>|]", "-");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE_CHOOSER) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
            if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
            return;
        }
        if (requestCode == REQUEST_SAVE_DOCUMENT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out == null) throw new IllegalStateException("Нет потока записи");
                    out.write(pendingSaveContent.getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    Toast.makeText(this, "Файл сохранён", Toast.LENGTH_SHORT).show();
                } catch (Exception ex) {
                    Toast.makeText(this, "Не удалось сохранить: " + ex.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
            pendingSaveName = null;
            pendingSaveContent = null;
            pendingSaveMime = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
        }
        super.onDestroy();
    }
}
