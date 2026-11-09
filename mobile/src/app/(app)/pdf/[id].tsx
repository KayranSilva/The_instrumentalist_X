import * as Linking from "expo-linking";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { ErrorState, Loading } from "@/components/ui";
import { fetchLesson, type Lesson } from "@/lib/content";
import { friendlyError } from "@/lib/errors";
import { SUPABASE_URL } from "@/lib/supabase";
import { colors } from "@/theme";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

/** O WebView do Android não renderiza PDF: desenhamos as páginas com PDF.js. */
function pdfJsPage(url: string): string {
  const safeUrl = JSON.stringify(url).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=4">
<style>body{margin:0;background:#f4f1fb}canvas{display:block;width:100%;height:auto;margin:0 0 8px;background:#fff}</style>
<script src="${PDFJS}/pdf.min.js"></script></head><body><script>
(async function () {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "${PDFJS}/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument(${safeUrl}).promise;
    const ratio = window.devicePixelRatio || 1;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (document.body.clientWidth / base.width) * ratio });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      document.body.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      if (n === 1) window.ReactNativeWebView.postMessage("loaded");
    }
  } catch (e) {
    window.ReactNativeWebView.postMessage("error");
  }
})();
</script></body></html>`;
}

export default function PdfViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setLesson(await fetchLesson(id));
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar a partitura."));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (lesson === undefined) return <Loading />;
  if (!lesson?.mediaUrl) return <ErrorState message="Arquivo não encontrado." onRetry={load} />;

  const openOutside = () => Linking.openURL(lesson.mediaUrl);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: lesson.title,
          headerRight: () => (
            <Pressable onPress={openOutside} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.headerLink}>Abrir fora</Text>
            </Pressable>
          ),
        }}
      />
      {state === "error" ? (
        <ErrorState message="Não foi possível exibir o PDF no app." onRetry={openOutside} />
      ) : (
        <WebView
          style={{ flex: 1 }}
          originWhitelist={["*"]}
          // iOS mostra PDF nativamente; no Android usamos o PDF.js.
          source={Platform.OS === "ios"
            ? { uri: lesson.mediaUrl }
            : { html: pdfJsPage(lesson.mediaUrl), baseUrl: SUPABASE_URL }}
          onLoadEnd={() => { if (Platform.OS === "ios") setState("loaded"); }}
          onMessage={(event) => setState(event.nativeEvent.data === "error" ? "error" : "loaded")}
          onError={() => setState("error")}
        />
      )}
      {state === "loading" && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.violet500} />
          <Text style={styles.overlayText}>Carregando partitura…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerLink: { color: colors.violet700, fontWeight: "700" },
  overlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.lavender050 },
  overlayText: { color: colors.inkSoft },
});
