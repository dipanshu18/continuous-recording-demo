import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Button, Alert, Text } from "react-native";
import {
  useAudioRecorder,
  ExpoAudioStreamModule,
} from "@siteed/expo-audio-studio";
import { Buffer } from "buffer";
import { AudioModule } from "expo-audio";

const SAMPLE_RATE = 16000;
const BUFFER_INTERVAL_MS = 1000;

const SESSION_ID = "session-" + Date.now();
const DEALERSHIP_ID = "APPLEWOODNISSANRICHMOND";
const WS_URL = `ws://192.168.1.9:8000/ws/${SESSION_ID}/${DEALERSHIP_ID}`;

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("Idle");

  const wsRef = useRef(null);
  const audioBuffer = useRef([]);
  const lastFlushTime = useRef(Date.now()); // ✅ time-based flushing, no setInterval

  const { startRecording, stopRecording } = useAudioRecorder();

  // ✅ Called from inside onAudioStream — works in background
  const flushAudioBuffer = () => {
    if (
      audioBuffer.current.length === 0 ||
      wsRef.current?.readyState !== WebSocket.OPEN
    )
      return;

    const totalLength = audioBuffer.current.reduce((s, b) => s + b.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioBuffer.current) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    audioBuffer.current = [];

    wsRef.current.send(
      JSON.stringify({
        mime_type: "audio/pcm",
        data: Buffer.from(combined.buffer).toString("base64"),
        transcribe: true,
      }),
    );
  };

  const handleStart = async () => {
    try {
      const { status: permStatus } =
        await ExpoAudioStreamModule.requestPermissionsAsync();

      const notificationPerm =
        await AudioModule.requestNotificationPermissionsAsync();

      if (!notificationPerm.granted) {
        Alert.alert("Notification permission required");
        return;
      }
      if (permStatus !== "granted") {
        Alert.alert("Microphone permission required");
        return;
      }

      // Connect WebSocket first, wait for it to open
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        ws.onopen = () => {
          wsRef.current = ws;
          lastFlushTime.current = Date.now();
          resolve();
        };
        ws.onerror = (e) => reject(e);
        ws.onclose = (e) => {
          setStatus(`WS closed: ${e.reason || e.code}`);
        };
        wsRef.current = ws;
      });

      await startRecording({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        encoding: "pcm_16bit",
        interval: 100,
        keepAwake: true,
        showNotification: true,
        notification: {
          title: "Recording in background",
          text: "Audio is being recorded and streamed.",
        },
        onAudioStream: async (event) => {
          if (!event.data) return;

          // Accumulate bytes
          const bytes = Buffer.from(event.data, "base64");
          audioBuffer.current.push(new Uint8Array(bytes));

          // ✅ Time-based flush — no setInterval needed
          const now = Date.now();
          if (now - lastFlushTime.current >= BUFFER_INTERVAL_MS) {
            lastFlushTime.current = now;
            flushAudioBuffer();
          }
        },
      });

      setIsRecording(true);
      setStatus("🔴 Recording + Streaming...");
    } catch (e) {
      Alert.alert("Start error", e.message);
      console.error(e);
    }
  };

  const handleStop = async () => {
    try {
      flushAudioBuffer(); // flush remainder
      audioBuffer.current = [];

      await stopRecording();
      wsRef.current?.close();
      wsRef.current = null;

      setIsRecording(false);
      setStatus("Idle");
    } catch (e) {
      Alert.alert("Stop error", e.message);
    }
  };

  useEffect(() => {
    return () => {
      stopRecording().catch(() => {});
      wsRef.current?.close();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{status}</Text>
      <Button
        title={isRecording ? "Stop Recording" : "Start Recording"}
        onPress={isRecording ? handleStop : handleStart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20 },
  status: { textAlign: "center", marginBottom: 20, fontSize: 18 },
});
