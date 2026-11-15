package io.github.eyrek.dashboard;

import android.content.Context;
import android.content.Intent;
import android.graphics.Paint;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Rows for the widget's list. */
public class DeckWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static final class Factory implements RemoteViewsFactory {
        private final Context c;
        private final List<JSONObject> rows = new ArrayList<>();

        Factory(Context c) { this.c = c; }

        @Override public void onCreate() {}
        @Override public void onDestroy() { rows.clear(); }

        @Override
        public void onDataSetChanged() {
            rows.clear();
            JSONObject snap = DeckWidgetStore.snapshot(c);
            if (snap == null || DeckWidgetStore.isStale(snap)) return;
            JSONArray items = snap.optJSONArray("items");
            if (items == null) return;
            for (int i = 0; i < items.length(); i++) {
                JSONObject o = items.optJSONObject(i);
                if (o != null) rows.add(o);
            }
        }

        @Override public int getCount() { return rows.size(); }

        @Override
        public RemoteViews getViewAt(int pos) {
            if (pos < 0 || pos >= rows.size()) return null;
            JSONObject o = rows.get(pos);
            if ("h".equals(o.optString("k"))) {
                RemoteViews h = new RemoteViews(c.getPackageName(), R.layout.deck_widget_section);
                h.setTextViewText(R.id.section_text, o.optString("text"));
                return h;
            }
            RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.deck_widget_row);
            boolean done = o.optBoolean("done");
            r.setTextViewText(R.id.row_text, o.optString("text"));
            r.setInt(R.id.row_text, "setPaintFlags", done ? (Paint.STRIKE_THRU_TEXT_FLAG | Paint.ANTI_ALIAS_FLAG) : Paint.ANTI_ALIAS_FLAG);
            r.setTextColor(R.id.row_text, done ? 0xFF8A8577 : 0xFF14161F);
            String sub = o.optString("sub", "");
            r.setTextViewText(R.id.row_sub, sub);
            r.setViewVisibility(R.id.row_sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
            r.setImageViewResource(R.id.row_check, done ? R.drawable.widget_check_on : R.drawable.widget_check_off);
            Intent fill = new Intent();
            fill.putExtra(DeckWidgetProvider.EXTRA_ID, o.optString("id"));
            r.setOnClickFillInIntent(R.id.row_root, fill);
            return r;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 2; }
        @Override public long getItemId(int pos) { return pos < rows.size() ? rows.get(pos).optString("id", "" + pos).hashCode() : pos; }
        @Override public boolean hasStableIds() { return true; }
    }
}
