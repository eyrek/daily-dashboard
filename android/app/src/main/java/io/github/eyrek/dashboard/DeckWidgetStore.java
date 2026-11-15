package io.github.eyrek.dashboard;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** What the widget shows (written by the web app) and the ticks made on the widget (read back by the web app). */
final class DeckWidgetStore {
    private static final String PREFS = "deck_widget";
    private static final String SNAPSHOT = "snapshot";
    private static final String QUEUE = "queue";

    private DeckWidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject snapshot(Context c) {
        try {
            String s = prefs(c).getString(SNAPSHOT, null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    static void saveSnapshot(Context c, JSONObject o) {
        prefs(c).edit().putString(SNAPSHOT, o.toString()).apply();
    }

    /** The deck's day, which starts at dayStart (e.g. 4 am), not midnight. */
    static String logicalToday(int dayStart) {
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.HOUR_OF_DAY, -dayStart);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.getTime());
    }

    static boolean isStale(JSONObject snap) {
        if (snap == null) return true;
        return !logicalToday(snap.optInt("dayStart", 4)).equals(snap.optString("day"));
    }

    /** Flip one item on the widget right away and remember the tick for the app. */
    static synchronized void toggle(Context c, String id) {
        JSONObject snap = snapshot(c);
        if (snap == null) return;
        try {
            JSONArray items = snap.optJSONArray("items");
            if (items == null) return;
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.getJSONObject(i);
                if (!id.equals(it.optString("id"))) continue;
                boolean done = !it.optBoolean("done");
                it.put("done", done);
                int n = snap.optInt("doneCount", 0) + (done ? 1 : -1);
                snap.put("doneCount", Math.max(0, n));
                saveSnapshot(c, snap);
                JSONArray q = queue(c);
                JSONObject a = new JSONObject();
                a.put("id", id);
                a.put("day", snap.optString("day"));
                a.put("done", done);
                a.put("at", System.currentTimeMillis());
                q.put(a);
                prefs(c).edit().putString(QUEUE, q.toString()).apply();
                return;
            }
        } catch (Exception ignored) {
        }
    }

    static JSONArray queue(Context c) {
        try {
            return new JSONArray(prefs(c).getString(QUEUE, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static synchronized JSONArray drain(Context c) {
        JSONArray q = queue(c);
        prefs(c).edit().putString(QUEUE, "[]").apply();
        return q;
    }
}
