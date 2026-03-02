import { useEffect, useState } from "react";
import { View, StyleSheet, Button, Alert, Text } from "react-native";
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from "expo-audio";

export default function App() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer();

  const [recordingUri, setRecordingUri] = useState(null);
  const [interrupted, setInterrupted] = useState(false);

  useEffect(() => {
    setupAudio();

    const sub = AudioModule.addListener(
      "onAudioSessionInterruption",
      (event) => {
        if (event.type === "began") {
          setInterrupted(true);
          Alert.alert("Recording was interrupted");
        }
      },
    );

    return () => sub.remove();
  }, []);

  const setupAudio = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    const status2 = await AudioModule.requestNotificationPermissionsAsync();
    if (!status.granted) {
      Alert.alert("Microphone permission required");
      return;
    }

    if (!status2.granted) {
      Alert.alert("Notification permission required");
      return;
    }

    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      allowsBackgroundRecording: true,
    });
  };

  const startRecording = async () => {
    try {
      setInterrupted(false);

      await recorder.prepareToRecordAsync();

      await recorder.record();
    } catch (e) {
      Alert.alert("Start error", e.message);
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      setRecordingUri(recorder.uri);
      Alert.alert("Recording saved", recorder.uri);
    } catch (e) {
      Alert.alert("Stop error", e.message);
    }
  };

  const playRecording = async () => {
    if (!recordingUri) return;
    try {
      player.replace({ uri: recordingUri });
      player.play();
    } catch (e) {
      Alert.alert("Playback error", e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.status}>
        {recorderState.isRecording
          ? "🔴 Recording..."
          : interrupted
            ? "⚠️ Interrupted"
            : "⏹ Idle"}
      </Text>

      <Button
        title={recorderState.isRecording ? "Stop Recording" : "Start Recording"}
        onPress={recorderState.isRecording ? stopRecording : startRecording}
      />

      {recordingUri && (
        <View style={{ marginTop: 20 }}>
          <Button title="▶ Play Recording" onPress={playRecording} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20 },
  status: { textAlign: "center", marginBottom: 20, fontSize: 18 },
});
