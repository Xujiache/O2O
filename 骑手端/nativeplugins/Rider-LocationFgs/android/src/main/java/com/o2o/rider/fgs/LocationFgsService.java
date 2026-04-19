package com.o2o.rider.fgs;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * 骑手端前台定位服务
 *
 * 职责：
 *   1. 在 Android 8+ Notification Channel 上常驻前台
 *   2. 绑定 LocationManager（GPS + NETWORK provider）
 *   3. 自驱定位回调，写入磁盘 /或/ 通过 LocalBroadcast 推给 JS 层
 *   4. 持有 PARTIAL_WAKE_LOCK 防止 Doze 杀死
 *
 * V7.22 验收：Android 熄屏 30min 持续上报，单量不遗漏
 *
 * 注意：
 *   - JS 层 location-service.ts 有 setInterval(10s) 兜底，本 Service 仅作系统级保活
 *   - LocationManager 上报间隔 = JS 层 intervalMs（默认 10s），与离线队列协同
 *
 * @author 单 Agent V2.0 (P7 骑手端 / T7.27)
 */
public class LocationFgsService extends Service {

    private static final String TAG = "LocationFgsService";

    public static final String ACTION_START = "com.o2o.rider.fgs.START";
    public static final String ACTION_STOP = "com.o2o.rider.fgs.STOP";
    public static final String ACTION_UPDATE = "com.o2o.rider.fgs.UPDATE";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_CONTENT = "content";
    public static final String EXTRA_ICON_RES = "iconRes";
    public static final String EXTRA_INTERVAL_MS = "intervalMs";

    public static final String CHANNEL_ID = "rider_location_fgs";
    public static final int NOTIFY_ID = 0xC100;
    /** 广播 action：JS 层可监听获取定位（备用通道） */
    public static final String BROADCAST_LOCATION = "com.o2o.rider.fgs.LOCATION";

    private LocationManager locationManager;
    private LocationListener gpsListener;
    private LocationListener networkListener;
    private PowerManager.WakeLock wakeLock;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private String currentTitle = "O2O 骑手端 · 接单服务";
    private String currentContent = "正在接收新订单";
    private long intervalMs = 10_000;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (action == null) action = ACTION_START;
        Log.i(TAG, "onStartCommand action=" + action);
        switch (action) {
            case ACTION_STOP:
                stopReporting();
                stopForeground(true);
                stopSelf();
                releaseWakeLock();
                return START_NOT_STICKY;
            case ACTION_UPDATE:
                if (intent != null && intent.hasExtra(EXTRA_CONTENT)) {
                    currentContent = intent.getStringExtra(EXTRA_CONTENT);
                    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                    if (nm != null) {
                        nm.notify(NOTIFY_ID, buildNotification());
                    }
                }
                return START_STICKY;
            case ACTION_START:
            default:
                if (intent != null) {
                    if (intent.hasExtra(EXTRA_TITLE)) currentTitle = intent.getStringExtra(EXTRA_TITLE);
                    if (intent.hasExtra(EXTRA_CONTENT)) currentContent = intent.getStringExtra(EXTRA_CONTENT);
                    intervalMs = intent.getLongExtra(EXTRA_INTERVAL_MS, 10_000L);
                }
                createChannelIfNeeded();
                Notification notification = buildNotification();
                /* Android 14+ 强制 foregroundServiceType */
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                } else {
                    startForeground(NOTIFY_ID, notification);
                }
                acquireWakeLock();
                startReporting();
                return START_STICKY;
        }
    }

    private void createChannelIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "骑手接单服务",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("骑手在线时持续上报位置以保障订单配送可追溯");
        channel.setShowBadge(false);
        channel.enableLights(false);
        channel.enableVibration(false);
        nm.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent appIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = null;
        if (appIntent != null) {
            int flag = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                flag |= PendingIntent.FLAG_IMMUTABLE;
            }
            pi = PendingIntent.getActivity(this, 0, appIntent, flag);
        }
        int icon = getApplicationInfo().icon;
        if (icon == 0) {
            icon = android.R.drawable.ic_menu_mylocation;
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(currentTitle)
                .setContentText(currentContent)
                .setSmallIcon(icon)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (pi != null) {
            b.setContentIntent(pi);
        }
        return b.build();
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "O2ORider:LocationFgs");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(8L * 60L * 60L * 1000L);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Throwable ignore) {
                /* ignore */
            }
        }
        wakeLock = null;
    }

    private void startReporting() {
        if (locationManager != null) return;
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (locationManager == null) {
            Log.w(TAG, "LocationManager unavailable");
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Permission ACCESS_FINE_LOCATION not granted; skip");
            return;
        }
        gpsListener = createListener("GPS");
        networkListener = createListener("NETWORK");
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        intervalMs,
                        15f,
                        gpsListener,
                        Looper.getMainLooper()
                );
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        intervalMs,
                        15f,
                        networkListener,
                        Looper.getMainLooper()
                );
            }
            Log.i(TAG, "fgs.location.subscribe ok intervalMs=" + intervalMs);
        } catch (SecurityException e) {
            Log.w(TAG, "fgs.location.subscribe.fail", e);
        }
    }

    private LocationListener createListener(String tag) {
        return new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                if (location == null) return;
                Log.d(TAG, tag + " location lat=" + location.getLatitude()
                        + " lng=" + location.getLongitude()
                        + " acc=" + location.getAccuracy());
                Intent broadcast = new Intent(BROADCAST_LOCATION);
                broadcast.putExtra("lat", location.getLatitude());
                broadcast.putExtra("lng", location.getLongitude());
                broadcast.putExtra("accuracy", location.getAccuracy());
                broadcast.putExtra("speed", location.getSpeed());
                broadcast.putExtra("bearing", location.getBearing());
                broadcast.putExtra("ts", System.currentTimeMillis());
                broadcast.putExtra("provider", tag);
                try {
                    sendBroadcast(broadcast);
                } catch (Throwable ignore) {
                    /* ignore */
                }
            }

            @Override
            public void onProviderEnabled(String provider) {
                Log.i(TAG, tag + " provider enabled: " + provider);
            }

            @Override
            public void onProviderDisabled(String provider) {
                Log.w(TAG, tag + " provider disabled: " + provider);
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {
                /* Android Q+ deprecated; keep for older versions */
            }
        };
    }

    private void stopReporting() {
        if (locationManager != null) {
            try {
                if (gpsListener != null) locationManager.removeUpdates(gpsListener);
                if (networkListener != null) locationManager.removeUpdates(networkListener);
            } catch (Throwable ignore) {
                /* ignore */
            }
            locationManager = null;
            gpsListener = null;
            networkListener = null;
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopReporting();
        releaseWakeLock();
        Log.i(TAG, "fgs.destroyed");
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        /* APP 滑退后保持 Service 活着（V7.22）；除非 stopSelf 被显式调 */
        Log.i(TAG, "fgs.taskRemoved (keep alive)");
        Context ctx = getApplicationContext();
        Intent restart = new Intent(ctx, LocationFgsService.class);
        restart.setAction(ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(restart);
            } else {
                ctx.startService(restart);
            }
        } catch (Throwable e) {
            Log.w(TAG, "fgs.taskRemoved.restart.fail", e);
        }
        /* Defensive: handler 延后再次检查（避免 Service onCreate 被系统拒后无声失败） */
        mainHandler.postDelayed(() -> Log.i(TAG, "fgs.taskRemoved.checkpoint"), 1000);
    }
}
