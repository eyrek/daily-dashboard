package io.github.eyrek.dashboard;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeckWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
