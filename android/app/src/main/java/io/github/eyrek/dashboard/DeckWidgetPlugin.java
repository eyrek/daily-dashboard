package io.github.eyrek.dashboard;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bridge between the web app and the home-screen widget. */
@CapacitorPlugin(name = "DeckWidget")
public class DeckWidgetPlugin extends Plugin {

    @Override
    public void load() {
        DeckWidgetProvider.listener = () -> {
            if (getBridge() != null) notifyListeners("ticked", new JSObject());
        };
    }

    @PluginMethod
    public void update(PluginCall call) {
        try {
            JSONObject snap = new JSONObject(call.getString("json", "{}"));
            DeckWidgetStore.saveSnapshot(getContext(), snap);
            DeckWidgetProvider.refreshAll(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Bad widget data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void drain(PluginCall call) {
        try {
            JSONArray q = DeckWidgetStore.drain(getContext());
            JSObject ret = new JSObject();
            ret.put("actions", new JSArray(q.toString()));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void installed(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("count", DeckWidgetProvider.count(getContext()));
        call.resolve(ret);
    }
}
