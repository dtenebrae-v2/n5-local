package local.n5.app;

import android.content.Context;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;

/** Installed only in the local app WebView; accepts local catalogue tracks, never arbitrary URLs. */
public final class AudioBridge {
    private final Context context;
    public AudioBridge(Context context) { this.context = context.getApplicationContext(); }
    @JavascriptInterface public String getState() { return AudioService.state(context); }
    @JavascriptInterface public void command(String value) {
        if (value == null || value.length() > 500000) throw new IllegalArgumentException("Invalid audio command");
        try {
            JSONObject data = new JSONObject(value);
            if (!data.getString("action").matches("queue|play|pause|next|previous|seek|rate|repeat|stop")) throw new IllegalArgumentException("Unknown audio command");
            context.startForegroundService(new Intent(context,AudioService.class).putExtra("command",value));
        } catch (org.json.JSONException failure) { throw new IllegalArgumentException("Invalid audio command",failure); }
    }
}
