import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";

const SplashScreen = ({ navigation }: any) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace("WalletConnect");
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View
      style={[styles.container, { backgroundColor: "#0a0e27" }]}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Image
              source={require("../../assets/logo-source.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>EcoQuest Mobile</Text>
          <Text style={styles.subtitle}>
            Eco-Challenge Gaming on Solana Blockchain
          </Text>
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#00ff00" />
          </View>
          <Text style={styles.tagline}>
            Complete quests • Mint NFTs • Stake rewards • Battle in PvP
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  logoContainer: {
    marginBottom: 30,
  },
  logoImage: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#00ff00",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#aaa",
    marginBottom: 40,
    textAlign: "center",
  },
  loaderContainer: {
    marginBottom: 40,
  },
  tagline: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    maxWidth: 300,
  },
});

export default SplashScreen;
