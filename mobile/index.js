import { registerRootComponent } from 'expo';
import "./src/utils/polyfills";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import App from "./src/App";

function Root() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
  );
}

registerRootComponent(Root);
