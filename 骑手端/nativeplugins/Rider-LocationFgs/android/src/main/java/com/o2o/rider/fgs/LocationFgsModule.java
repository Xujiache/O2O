package com.o2o.rider.fgs;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.alibaba.fastjson.JSONObject;
import io.dcloud.feature.uniapp.annotation.UniJSMethod;
import io.dcloud.feature.uniapp.bridge.UniJSCallback;
import io.dcloud.feature.uniapp.common.UniModule;

/**
 * Rider-LocationFgs UniApp Native Module（JS 入口）
 *
 * 暴露给 JS 的方法：
 *   start({ title, content, iconRes, intervalMs })  启动前台服务
 *   stop()                                          停止前台服务
 *   updateContent(content)                          更新通知栏文案
 *
 * 调用方：utils/foreground-service.ts
 *   uni.requireNativePlugin('Rider-LocationFgs')
 *
 * V7.22 验收：Android 熄屏 30min 持续上报
 *
 * @author 单 Agent V2.0 (P7 骑手端 / T7.27)
 */
public class LocationFgsModule extends UniModule {

    private static final String TAG = "LocationFgsModule";

    /**
     * 启动前台定位服务
     *
     * @param options JSON 对象（title / content / iconRes / intervalMs）
     */
    @UniJSMethod(uiThread = false)
    public void start(JSONObject options, UniJSCallback callback) {
        try {
            Context ctx = getAppContext();
            if (ctx == null) {
                if (callback != null) {
                    callback.invoke(buildResult(false, "context unavailable"));
                }
                return;
            }
            String title = options != null && options.containsKey("title")
                    ? options.getString("title")
                    : "O2O 骑手端 · 接单服务";
            String content = options != null && options.containsKey("content")
                    ? options.getString("content")
                    : "正在接收新订单";
            String iconRes = options != null && options.containsKey("iconRes")
                    ? options.getString("iconRes")
                    : "mipmap/ic_launcher";
            int intervalMs = options != null && options.containsKey("intervalMs")
                    ? options.getIntValue("intervalMs")
                    : 10_000;

            Intent intent = new Intent(ctx, LocationFgsService.class);
            intent.setAction(LocationFgsService.ACTION_START);
            intent.putExtra(LocationFgsService.EXTRA_TITLE, title);
            intent.putExtra(LocationFgsService.EXTRA_CONTENT, content);
            intent.putExtra(LocationFgsService.EXTRA_ICON_RES, iconRes);
            intent.putExtra(LocationFgsService.EXTRA_INTERVAL_MS, intervalMs);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
            Log.i(TAG, "fgs.start ok title=" + title + " interval=" + intervalMs);
            if (callback != null) {
                callback.invoke(buildResult(true, "ok"));
            }
        } catch (Throwable e) {
            Log.e(TAG, "fgs.start.fail", e);
            if (callback != null) {
                callback.invoke(buildResult(false, e.getMessage()));
            }
        }
    }

    /**
     * 停止前台服务
     */
    @UniJSMethod(uiThread = false)
    public void stop(UniJSCallback callback) {
        try {
            Context ctx = getAppContext();
            if (ctx == null) {
                if (callback != null) callback.invoke(buildResult(false, "context unavailable"));
                return;
            }
            Intent intent = new Intent(ctx, LocationFgsService.class);
            intent.setAction(LocationFgsService.ACTION_STOP);
            ctx.startService(intent);
            Log.i(TAG, "fgs.stop ok");
            if (callback != null) callback.invoke(buildResult(true, "ok"));
        } catch (Throwable e) {
            Log.e(TAG, "fgs.stop.fail", e);
            if (callback != null) callback.invoke(buildResult(false, e.getMessage()));
        }
    }

    /**
     * 更新通知栏文案（如：已在线 X 分钟）
     */
    @UniJSMethod(uiThread = false)
    public void updateContent(String content) {
        try {
            Context ctx = getAppContext();
            if (ctx == null) return;
            Intent intent = new Intent(ctx, LocationFgsService.class);
            intent.setAction(LocationFgsService.ACTION_UPDATE);
            intent.putExtra(LocationFgsService.EXTRA_CONTENT, content);
            ctx.startService(intent);
        } catch (Throwable e) {
            Log.w(TAG, "fgs.updateContent.fail", e);
        }
    }

    private Context getAppContext() {
        Activity act = mUniSDKInstance != null ? (Activity) mUniSDKInstance.getContext() : null;
        return act != null ? act.getApplicationContext() : null;
    }

    private JSONObject buildResult(boolean ok, String message) {
        JSONObject r = new JSONObject();
        r.put("ok", ok);
        r.put("message", message);
        return r;
    }
}
