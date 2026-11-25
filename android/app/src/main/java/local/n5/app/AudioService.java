package local.n5.app;

import android.annotation.SuppressLint;
import android.app.*;
import android.content.*;
import android.media.*;
import android.graphics.drawable.Icon;
import android.media.session.*;
import android.os.*;
import org.json.*;

/** Owns audio independently of the Activity/WebView, including with the screen off. */
public class AudioService extends Service {
    private static final String CHANNEL = "n5-audio", PREFS = "n5-audio";
    private static final int NOTIFICATION = 5;
    private static volatile String snapshot;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private JSONArray queue = new JSONArray();
    private JSONObject positions = new JSONObject();
    private int index;
    private double position, duration;
    private float rate = 1f;
    private boolean repeat, prepared, playing, wantPlay, foreground, resumeOnFocus, initialSeek;
    private String requestId = "";
    private String error = "";
    private MediaPlayer player;
    private MediaSession session;
    private AudioManager manager;
    private AudioFocusRequest focus;
    private long lastPersist;
    private final AudioAttributes attributes = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { pause(); }
    };
    private final Runnable ticker = new Runnable() {
        @Override public void run() { publish(System.currentTimeMillis() - lastPersist > 5000); handler.postDelayed(this, 1000); }
    };

    public static String state(Context context) {
        String value = snapshot;
        if (value != null) return value;
        try { return new JSONObject(context.getSharedPreferences(PREFS, MODE_PRIVATE).getString("state", "{}")).put("playing",false).put("loading",false).toString(); }
        catch (JSONException ignored) { return "{}"; }
    }
    @Override public void onCreate() {
        super.onCreate();
        manager = getSystemService(AudioManager.class);
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes)
            .setOnAudioFocusChangeListener(change -> {
                if (change == AudioManager.AUDIOFOCUS_GAIN) {
                    if (resumeOnFocus) { resumeOnFocus = false; play(); }
                } else if (change < 0) {
                    boolean resume = playing && change != AudioManager.AUDIOFOCUS_LOSS;
                    pause(resume); resumeOnFocus = resume;
                }
            }, handler).build();
        getSystemService(NotificationManager.class).createNotificationChannel(
            new NotificationChannel(CHANNEL, "Аудиозаписи", NotificationManager.IMPORTANCE_LOW));
        session = new MediaSession(this, "N5 Audio");
        session.setSessionActivity(openApp());
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { play(); }
            @Override public void onPause() { pause(); }
            @Override public void onStop() { stopPlayback(); }
            @Override public void onSkipToNext() { next(1, false); }
            @Override public void onSkipToPrevious() { if (currentPosition() > 3) seek(0); else next(-1, false); }
            @Override public void onSeekTo(long millis) { seek(millis / 1000d); }
            @Override public void onFastForward() { seek(currentPosition() + 15); }
            @Override public void onRewind() { seek(currentPosition() - 15); }
        }, handler);
        try {
            JSONObject saved = new JSONObject(getSharedPreferences(PREFS, MODE_PRIVATE).getString("state", "{}"));
            queue = validatedQueue(saved.optJSONArray("queue"));
            index = Math.max(0, Math.min(saved.optInt("index"), queue.length() - 1));
            positions = saved.optJSONObject("positions") != null ? saved.getJSONObject("positions") : new JSONObject();
            position = Math.max(0, saved.optDouble("position", 0));
            rate = validRate(saved.optDouble("rate", 1)); repeat = saved.optBoolean("repeat");
        } catch (JSONException ignored) { queue = new JSONArray(); }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        handler.post(ticker);
    }
    private JSONArray validatedQueue(JSONArray input) throws JSONException {
        JSONArray result = new JSONArray();
        if (input == null) return result;
        if (input.length() > 500) throw new JSONException("Too many tracks");
        for (int i = 0; i < input.length(); i++) {
            JSONObject track = input.getJSONObject(i);
            String url = track.getString("url");
            if (!url.matches("/(?:exam-files/[a-z0-9-]+/[a-zA-Z0-9-]+|material-files/[a-z0-9-]+/[a-zA-Z0-9-]+|library-files/[0-9]+/audio)")) throw new JSONException("Invalid audio URL");
            if (track.getString("id").length() > 200 || track.getString("title").length() > 500) throw new JSONException("Invalid track");
            result.put(track);
        }
        return result;
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        // Every bridge/notification entry point may be a foreground-service start.
        ensureForeground();
        try {
            JSONObject command = new JSONObject(intent == null ? "{}" : intent.getStringExtra("command") == null ? "{}" : intent.getStringExtra("command"));
            requestId = command.optString("requestId", requestId);
            String action = command.optString("action", intent == null ? "pause" : intent.getAction());
            if ("queue".equals(action)) {
                JSONArray nextQueue = validatedQueue(command.optJSONArray("tracks"));
                if (nextQueue.length() == 0) { stopPlayback(); return START_NOT_STICKY; }
                remember(); releasePlayer(); queue = nextQueue;
                index = Math.max(0, Math.min(command.optInt("index"), queue.length() - 1));
                position = Math.max(0, command.optDouble("position", 0)); rate = validRate(command.optDouble("rate", 1));
                repeat = command.optBoolean("repeat"); load(command.optBoolean("play", true));
            } else if ("play".equals(action)) play();
            else if ("pause".equals(action)) pause();
            else if ("next".equals(action)) next(1, false);
            else if ("previous".equals(action)) { if (currentPosition() > 3) seek(0); else next(-1, false); }
            else if ("seek".equals(action)) seek(command.optDouble("position", 0));
            else if ("rate".equals(action)) { rate = validRate(command.optDouble("rate", 1)); applyRate(); }
            else if ("repeat".equals(action)) repeat = command.optBoolean("repeat");
            else if ("stop".equals(action)) { stopPlayback(); return START_NOT_STICKY; }
            publish(true);
            if (!wantPlay && !playing) detachForeground();
        } catch (Exception failure) { fail(); }
        return START_NOT_STICKY;
    }
    private float validRate(double value) { return value == .75 || value == 1 || value == 1.25 || value == 1.5 ? (float)value : 1f; }
    private JSONObject current() { return queue.optJSONObject(index); }
    private double currentPosition() {
        if (prepared && !initialSeek && player != null) { try { return player.getCurrentPosition() / 1000d; } catch (IllegalStateException ignored) {} }
        return position;
    }
    private void remember() {
        position = currentPosition();
        try { if (current() != null) positions.put(current().getString("id"), position); } catch (JSONException ignored) {}
    }
    private void releasePlayer() {
        MediaPlayer old = player; player = null;
        if (old != null) {
            old.setOnPreparedListener(null); old.setOnSeekCompleteListener(null);
            old.setOnCompletionListener(null); old.setOnErrorListener(null); old.release();
        }
        prepared = playing = initialSeek = false;
    }
    private void load(boolean autoplay) {
        if (current() == null) { stopPlayback(); return; }
        releasePlayer(); wantPlay = autoplay; error = ""; duration = 0;
        session.setActive(true);
        session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,current().optString("title"))
            .putString(MediaMetadata.METADATA_KEY_ALBUM,current().optString("album")).putString(MediaMetadata.METADATA_KEY_ARTIST,"N5 Local").build());
        try {
            MediaPlayer audio = new MediaPlayer(); player = audio;
            audio.setAudioAttributes(attributes); audio.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            audio.setDataSource("http://127.0.0.1:8095" + current().getString("url"));
            audio.setOnPreparedListener(ready -> {
                if (player != ready) return;
                final double offset = position;
                prepared = true; duration = ready.getDuration() / 1000d;
                position = Math.min(offset, Math.max(0, duration - .1));
                if (position > 0) {
                    initialSeek = true;
                    ready.setOnSeekCompleteListener(seeked -> {
                        if (player != seeked) return;
                        seeked.setOnSeekCompleteListener(null); initialSeek = false;
                        if (wantPlay) play(); else publish(true);
                    });
                    ready.seekTo((long)(position * 1000), MediaPlayer.SEEK_CLOSEST);
                } else if (wantPlay) play();
                else publish(true);
            });
            audio.setOnCompletionListener(done -> { if (player == done) { position = 0; next(1, true); } });
            audio.setOnErrorListener((failed, what, extra) -> { if (player == failed) fail(); return true; });
            audio.prepareAsync(); publish(true);
        } catch (Exception failure) { fail(); }
    }
    private void applyRate() {
        if (prepared && player != null) {
            try { player.setPlaybackParams(new PlaybackParams().setSpeed(rate).setPitch(1)); if (!wantPlay) player.pause(); }
            catch (IllegalArgumentException | IllegalStateException ignored) { rate = 1f; }
        }
    }
    private void play() {
        if (current() == null) { stopPlayback(); return; }
        ensureForeground(); wantPlay = true; error = "";
        if (player == null) { load(true); return; }
        if (!prepared || initialSeek) return;
        if (manager.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            wantPlay = false; error = "Звук занят другим приложением. Нажмите «Слушать» позже."; publish(true); detachForeground(); return;
        }
        try { applyRate(); player.start(); playing = true; session.setActive(true); publish(true); }
        catch (IllegalStateException failure) { fail(); }
    }
    private void pause() { pause(false); }
    private void pause(boolean transientLoss) {
        wantPlay = resumeOnFocus = false;
        if (prepared && player != null) { try { player.pause(); } catch (IllegalStateException ignored) {} }
        playing = false; remember();
        if (!transientLoss) manager.abandonAudioFocusRequest(focus);
        publish(true);
        if (!transientLoss) detachForeground();
    }
    private void seek(double seconds) {
        position = Math.max(0, Math.min(duration > 0 ? duration : Double.MAX_VALUE, seconds));
        if (prepared && player != null) player.seekTo((long)(position * 1000),MediaPlayer.SEEK_CLOSEST);
        publish(true);
    }
    private void next(int delta, boolean completed) {
        resumeOnFocus = false;
        if (completed && current() != null) { try { positions.put(current().getString("id"),0); } catch (JSONException ignored) {} }
        else remember();
        int next = index + delta;
        if (next < 0 || next >= queue.length()) {
            if (!repeat || queue.length() == 0) { if (completed) position = 0; pause(); if (completed) { position = 0; releasePlayer(); publish(true); } return; }
            next = (next + queue.length()) % queue.length();
        }
        releasePlayer();
        index = next; position = completed ? 0 : Math.max(0,positions.optDouble(current().optString("id"),0));
        ensureForeground(); load(true);
    }
    private void fail() {
        remember(); releasePlayer(); wantPlay = false;
        error = "Не удалось открыть запись. Нажмите «Слушать», чтобы повторить.";
        manager.abandonAudioFocusRequest(focus); publish(true); detachForeground();
    }
    private void stopPlayback() {
        remember(); releasePlayer(); wantPlay = false; queue = new JSONArray(); position = duration = 0;
        manager.abandonAudioFocusRequest(focus); session.setActive(false); publish(true);
        stopForeground(STOP_FOREGROUND_REMOVE); foreground = false;
        getSystemService(NotificationManager.class).cancel(NOTIFICATION); stopSelf();
    }
    private void ensureForeground() {
        startForeground(NOTIFICATION, notification()); foreground = true;
    }
    private void detachForeground() {
        if (foreground) { stopForeground(STOP_FOREGROUND_DETACH); foreground = false; }
    }
    private PendingIntent openApp() {
        Intent open = new Intent().setClassName(this,"local.n5.app.MainActivity").setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    private PendingIntent action(String name) {
        return PendingIntent.getForegroundService(this,name.hashCode(),new Intent(this,AudioService.class).setAction(name),PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    private Notification notification() {
        String title = current() == null ? "Аудио N5" : current().optString("title");
        return new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title).setContentText(current() == null ? "" : current().optString("album"))
            .setContentIntent(openApp()).setVisibility(Notification.VISIBILITY_PUBLIC).setOnlyAlertOnce(true)
            .setOngoing(playing).setDeleteIntent(action("stop"))
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this,android.R.drawable.ic_media_previous),"Предыдущая",action("previous")).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this,playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),playing ? "Пауза" : "Слушать",action(playing ? "pause" : "play")).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this,android.R.drawable.ic_media_next),"Следующая",action("next")).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this,android.R.drawable.ic_menu_close_clear_cancel),"Закрыть",action("stop")).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0,1,2)).build();
    }
    @SuppressLint("NotificationPermission")
    private void updateMediaNotification() {
        // notification() always uses MediaStyle with this service's MediaSession token.
        // Media-session notifications are exempt from POST_NOTIFICATIONS:
        // https://developer.android.com/develop/ui/views/notifications/notification-permission#media-sessions
        getSystemService(NotificationManager.class).notify(NOTIFICATION, notification());
    }
    private void publish(boolean persist) {
        remember();
        try {
            JSONObject value = new JSONObject().put("queue",queue).put("index",index).put("positions",positions)
                .put("position",position).put("duration",duration).put("rate",rate).put("repeat",repeat)
                .put("playing",playing).put("loading",wantPlay && (!prepared || initialSeek))
                .put("requestId",requestId).put("error",error).put("updated",System.currentTimeMillis());
            snapshot = value.toString();
            if (persist) { getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString("state",snapshot).apply(); lastPersist = System.currentTimeMillis(); }
        } catch (JSONException ignored) {}
        session.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_REWIND)
            .setState(wantPlay && !prepared ? PlaybackState.STATE_BUFFERING : playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,(long)(position * 1000),playing ? rate : 0).build());
        if (current() != null) {
            session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,current().optString("title"))
                .putString(MediaMetadata.METADATA_KEY_ALBUM,current().optString("album")).putString(MediaMetadata.METADATA_KEY_ARTIST,"N5 Local")
                .putLong(MediaMetadata.METADATA_KEY_DURATION,(long)(duration * 1000)).build());
            if (persist) updateMediaNotification();
        }
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null); remember(); wantPlay = playing = false; publish(true); releasePlayer();
        manager.abandonAudioFocusRequest(focus); unregisterReceiver(noisy); session.release(); super.onDestroy();
    }
}
