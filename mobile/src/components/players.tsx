import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { formatDuration } from "@/lib/content";
import { SUPABASE_URL } from "@/lib/supabase";
import { colors, radius } from "@/theme";

/** Vídeo enviado pelo painel (MP4/WEBM/MOV). */
export function VideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return (
    <VideoView
      player={player}
      style={styles.frame}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

/** Áudio enviado pelo painel (MP3/WAV/OGG), com controles próprios. */
export function AudioPlayer({ url }: { url: string }) {
  const player = useAudioPlayer(url, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const progress = duration ? Math.min(status.currentTime / duration, 1) : 0;

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (duration && status.currentTime >= duration - 0.5) player.seekTo(0);
    player.play();
  }

  return (
    <View style={styles.audio}>
      <Pressable
        onPress={toggle}
        disabled={!status.isLoaded}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pausar" : "Tocar"}
        style={[styles.audioButton, !status.isLoaded && { opacity: 0.5 }]}
      >
        <Text style={styles.audioIcon}>{status.playing ? "❚❚" : "▶"}</Text>
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${progress * 100}%` }]} /></View>
        <Text style={styles.time}>
          {formatDuration(Math.floor(status.currentTime)) || "00:00"} / {formatDuration(Math.floor(duration)) || "--:--"}
        </Text>
      </View>
    </View>
  );
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** YouTube/Vimeo: iframe numa página com origem https (o YouTube recusa
 *  embeds sem Referer, que é o que acontece ao abrir a URL direto). */
export function EmbedPlayer({ url }: { url: string }) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
<body><iframe src="${escapeAttribute(url)}" referrerpolicy="strict-origin-when-cross-origin"
allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>`;
  return (
    <View style={styles.frame}>
      <WebView
        source={{ html, baseUrl: SUPABASE_URL }}
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        style={{ backgroundColor: "#000" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: radius.md, overflow: "hidden" },
  audio: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.violet800,
    borderRadius: radius.md, padding: 16,
  },
  audioButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.yellow500, alignItems: "center", justifyContent: "center" },
  audioIcon: { color: colors.violet900, fontSize: 18, fontWeight: "800" },
  bar: { height: 8, borderRadius: 999, backgroundColor: colors.violet700, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.yellow400 },
  time: { color: colors.violet300, fontSize: 13 },
});
