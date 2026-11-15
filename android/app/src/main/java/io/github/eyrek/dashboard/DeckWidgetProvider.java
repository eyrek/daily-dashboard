package io.github.eyrek.dashboard;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** "Today's hand" on the home screen: tasks, routine steps, chores and the workout. Tap a row to tick it. */
public class DeckWidgetProvider extends AppWidgetProvider {
    static final String ACTION_TOGGLE = "io.github.eyrek.dashboard.WIDGET_TOGGLE";
    static final String EXTRA_ID = "deck_item_id";
    static Runnable listener;

    static int count(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, DeckWidgetProvider.class)).length;
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, DeckWidgetProvider.class));
        for (int id : ids) m.updateAppWidget(id, build(c, id));
        m.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c, id));
        m.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (ACTION_TOGGLE.equals(intent.getAction())) {
            String id = intent.getStringExtra(EXTRA_ID);
            if (id != null) {
                DeckWidgetStore.toggle(c, id);
                refreshAll(c);
                Runnable l = listener;
                if (l != null) {
                    try { l.run(); } catch (Exception ignored) {}
                }
            }
        }
    }

    private static RemoteViews build(Context c, int widgetId) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.deck_widget);
        JSONObject snap = DeckWidgetStore.snapshot(c);
        boolean stale = DeckWidgetStore.isStale(snap);

        String title = snap == null ? "Deck" : snap.optString("title", "Today");
        v.setTextViewText(R.id.widget_title, stale ? "Deck" : title);
        String sub;
        if (snap == null) sub = "Open Deck once to deal your hand";
        else if (stale) sub = "New day. Tap to deal today's hand";
        else {
            int total = snap.optInt("total", 0), done = snap.optInt("doneCount", 0);
            sub = total == 0 ? "Nothing on your hand" : done >= total ? "All played. Nice." : done + " of " + total + " played";
        }
        v.setTextViewText(R.id.widget_sub, sub);

        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_header, openPi);
        v.setOnClickPendingIntent(R.id.widget_empty, openPi);

        Intent svc = new Intent(c, DeckWidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.widget_list, svc);
        v.setEmptyView(R.id.widget_list, R.id.widget_empty);
        v.setTextViewText(R.id.widget_empty, stale ? "Tap to open Deck" : "Nothing left on today's hand");

        Intent tick = new Intent(c, DeckWidgetProvider.class);
        tick.setAction(ACTION_TOGGLE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent tickPi = PendingIntent.getBroadcast(c, 1, tick, flags);
        v.setPendingIntentTemplate(R.id.widget_list, tickPi);
        v.setViewVisibility(R.id.widget_list, View.VISIBLE);
        return v;
    }
}
