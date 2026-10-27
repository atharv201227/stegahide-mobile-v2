import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenContainer } from "@/components/screen-container";
import {
  decryptPayload,
  embedImage,
  encryptPayload,
  ENCRYPTED_MIME_TYPE,
  extractImage,
  readImageBase64,
  validatePayloadCapacity,
  writeImageBase64,
} from "@/lib/steganography";

const COLORS = {
  background: "#08111F",
  surface: "#111D30",
  surfaceRaised: "#182640",
  border: "#263754",
  text: "#F4F7FB",
  muted: "#8E9CB3",
  cyan: "#50D5E8",
  orange: "#FF9D66",
  green: "#6EE7B7",
  danger: "#FCA5A5",
};

type Mode = "hide" | "reveal";
type PickTarget = "carrier" | "secret";
type CapacityNotice = { text: string; ok: boolean };
type CapacityState = ReturnType<typeof validatePayloadCapacity> | null;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fitScale(width: number, height: number, scale: number) {
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

type ImageSlotProps = {
  label: string;
  hint: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  uri: string | null;
  fileName: string | null;
  accent: string;
  onPress: () => void;
};

function ImageSlot({ label, hint, icon, uri, fileName, accent, onPress }: ImageSlotProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.imageSlot, pressed && styles.pressed]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.slotImage} resizeMode="cover" />
      ) : (
        <View style={[styles.slotIcon, { backgroundColor: `${accent}18` }]}>
          <MaterialIcons name={icon} size={24} color={accent} />
        </View>
      )}
      <View style={styles.slotCopy}>
        <Text style={styles.slotLabel}>{label}</Text>
        <Text style={styles.slotHint} numberOfLines={1}>
          {fileName ?? hint}
        </Text>
      </View>
      <View style={[styles.addButton, { borderColor: `${accent}66` }]}>
        <MaterialIcons name={uri ? "check" : "add"} size={18} color={accent} />
      </View>
    </Pressable>
  );
}

function ModeButton({ mode, active, title, subtitle, icon, onPress }: {
  mode: Mode;
  active: boolean;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
}) {
  const accent = mode === "hide" ? COLORS.orange : COLORS.cyan;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeButton,
        active && { backgroundColor: `${accent}18`, borderColor: `${accent}8C` },
        pressed && styles.pressed,
      ]}
    >
      <MaterialIcons name={icon} size={19} color={active ? accent : COLORS.muted} />
      <View style={styles.modeCopy}>
        <Text style={[styles.modeTitle, active && { color: COLORS.text }]}>{title}</Text>
        <Text style={styles.modeSubtitle}>{subtitle}</Text>
      </View>
      {active && <View style={[styles.activeDot, { backgroundColor: accent }]} />}
    </Pressable>
  );
}

export default function HomeScreen() {
  const [mode, setMode] = useState<Mode>("hide");
  const [carrierUri, setCarrierUri] = useState<string | null>(null);
  const [secretUri, setSecretUri] = useState<string | null>(null);
  const [carrierName, setCarrierName] = useState<string | null>(null);
  const [secretName, setSecretName] = useState<string | null>(null);
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [capacityNotice, setCapacityNotice] = useState<CapacityNotice | null>(null);
  const [password, setPassword] = useState("");
  const [outputName, setOutputName] = useState("stegahide-hidden-image");
  const [capacity, setCapacity] = useState<CapacityState>(null);
  const [capacityBusy, setCapacityBusy] = useState(false);

  const ready = mode === "hide" ? Boolean(carrierUri && secretUri && password.trim().length >= 4) : Boolean(carrierUri && password.trim().length >= 4);
  const actionLabel = useMemo(() => (mode === "hide" ? "Create hidden image" : "Reveal hidden image"), [mode]);

  useEffect(() => {
    let cancelled = false;
    const previewCapacity = async () => {
      if (mode !== "hide" || !carrierUri || !secretUri) {
        setCapacity(null);
        return;
      }
      setCapacityBusy(true);
      try {
        const [carrier, secret] = await Promise.all([
          ImageManipulator.manipulateAsync(carrierUri, [], { compress: 1, format: ImageManipulator.SaveFormat.PNG, base64: true }),
          ImageManipulator.manipulateAsync(secretUri, [], { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }),
        ]);
        if (!carrier.base64 || !secret.base64 || cancelled) return;
        const encrypted = encryptPayload(secret.base64, "image/jpeg", password.trim().length >= 4 ? password : "preview-password");
        setCapacity(validatePayloadCapacity({
          carrierWidth: carrier.width,
          carrierHeight: carrier.height,
          payloadWidth: secret.width,
          payloadHeight: secret.height,
          payloadBase64: encrypted,
          payloadMimeType: ENCRYPTED_MIME_TYPE,
        }));
      } catch {
        if (!cancelled) setCapacity(null);
      } finally {
        if (!cancelled) setCapacityBusy(false);
      }
    };
    void previewCapacity();
    return () => { cancelled = true; };
  }, [carrierUri, mode, password, secretUri]);

  const changeMode = (nextMode: Mode) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(nextMode);
    setResultUri(null);
    setMessage(null);
    setCapacityNotice(null);
    setOutputName(nextMode === "hide" ? "stegahide-hidden-image" : "stegahide-revealed-image");
  };

  const pickImage = async (target: PickTarget) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (target === "carrier") {
      setCarrierUri(asset.uri);
      setCarrierName(asset.fileName ?? "Carrier image selected");
      setResultUri(null);
    } else {
      setSecretUri(asset.uri);
      setSecretName(asset.fileName ?? "Secret image selected");
      setResultUri(null);
    }
    setMessage(null);
    setCapacityNotice(null);
  };

  const processImages = async () => {
    if (!ready || !carrierUri) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "hide" && secretUri) {
        if (password.trim().length < 4) throw new Error("Choose a password with at least 4 characters");
        const normalized = await ImageManipulator.manipulateAsync(
          carrierUri,
          [],
          { compress: 1, format: ImageManipulator.SaveFormat.PNG, base64: true },
        );
        if (!normalized.base64) throw new Error("Could not read the carrier image");
        const sourceSecret = await ImageManipulator.manipulateAsync(
          secretUri,
          [],
          { compress: 0.86, format: ImageManipulator.SaveFormat.JPEG, base64: false },
        );
        let fittingSecret: Awaited<ReturnType<typeof ImageManipulator.manipulateAsync>> | null = null;
        let fittingEncrypted = "";
        let fittingCapacity: CapacityState = null;
        const qualities = [0.86, 0.74, 0.62, 0.5];
        for (let step = 0; step < 8 && !fittingSecret; step += 1) {
          const scale = Math.pow(0.82, Math.floor(step / qualities.length));
          const quality = qualities[step % qualities.length];
          const resize = fitScale(sourceSecret.width, sourceSecret.height, scale);
          const candidate = await ImageManipulator.manipulateAsync(
            secretUri,
            [{ resize }],
            { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
          );
          if (!candidate.base64) continue;
          const encrypted = encryptPayload(candidate.base64, "image/jpeg", password);
          const candidateCapacity = validatePayloadCapacity({
            carrierWidth: normalized.width,
            carrierHeight: normalized.height,
            payloadWidth: candidate.width,
            payloadHeight: candidate.height,
            payloadBase64: encrypted,
            payloadMimeType: ENCRYPTED_MIME_TYPE,
          });
          if (candidateCapacity.fits) {
            fittingSecret = candidate;
            fittingEncrypted = encrypted;
            fittingCapacity = candidateCapacity;
          }
        }
        if (!fittingSecret || !fittingCapacity) {
          setCapacityNotice({ text: "Capacity check failed · even the smallest automatic fit is too large for this carrier.", ok: false });
          throw new Error("This carrier cannot hold the secret image. Choose a larger carrier.");
        }
        setCapacity(fittingCapacity);
        const resized = fittingSecret.width !== normalized.width || fittingSecret.height !== normalized.height;
        setCapacityNotice({ text: `${resized ? "Secret image auto-fitted · " : "Capacity check passed · "}${formatBytes(fittingCapacity.remainingBytes)} remaining`, ok: true });
        const encoded = embedImage(normalized.base64, fittingEncrypted, ENCRYPTED_MIME_TYPE);
        const uri = await writeImageBase64(encoded, "image/png", outputName);
        setResultUri(uri);
        setMessage("Your carrier image now contains an encrypted secret image.");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        if (password.trim().length < 4) throw new Error("Enter the password used to hide this image");
        const carrierBase64 = await readImageBase64(carrierUri);
        const extracted = extractImage(carrierBase64);
        const decrypted = extracted.mimeType === ENCRYPTED_MIME_TYPE
          ? decryptPayload(extracted.base64, password)
          : extracted;
        const uri = await writeImageBase64(decrypted.base64, decrypted.mimeType, outputName);
        setResultUri(uri);
        setMessage("Hidden image revealed successfully.");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Something went wrong";
      setMessage(text);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const saveResult = async () => {
    if (!resultUri) return;
    try {
      if (Platform.OS === "web") {
        setMessage("Gallery saving is available on Android and iOS.");
        return;
      }
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) throw new Error("Photo permission is needed to save this image");
      await MediaLibrary.createAssetAsync(resultUri);
      setMessage("Saved to your photo library.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Could not save image", error instanceof Error ? error.message : "Try again");
    }
  };

  const shareResult = async () => {
    if (!resultUri) return;
    if (!(await Sharing.isAvailableAsync())) {
      setMessage("Sharing is not available on this device.");
      return;
    }
    await Sharing.shareAsync(resultUri, { mimeType: "image/png", dialogTitle: "Share StegaHide image" });
  };

  const reset = () => {
    setCarrierUri(null);
    setSecretUri(null);
    setCarrierName(null);
    setSecretName(null);
    setResultUri(null);
    setMessage(null);
    setCapacityNotice(null);
    setCapacity(null);
    setPassword("");
    setOutputName(mode === "hide" ? "stegahide-hidden-image" : "stegahide-revealed-image");
  };

  return (
    <ScreenContainer containerClassName="bg-background" className="px-5" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}>
              <MaterialIcons name="blur-on" size={22} color={COLORS.background} />
            </View>
            <View>
              <Text style={styles.brandName}>StegaHide</Text>
              <Text style={styles.brandCaption}>PRIVATE IMAGE STUDIO</Text>
            </View>
          </View>
          <View style={styles.localPill}>
            <View style={styles.liveDot} />
            <Text style={styles.localPillText}>LOCAL</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>IMAGE STEGANOGRAPHY</Text>
          <Text style={styles.heroTitle}>Hide images{`\n`}in plain sight.</Text>
          <Text style={styles.heroDescription}>
            Blend a private image into an ordinary one. Nothing leaves your device.
          </Text>
          <View style={styles.heroMeta}>
            <View style={styles.metaItem}><MaterialIcons name="lock-outline" size={14} color={COLORS.green} /><Text style={styles.metaText}>Offline by default</Text></View>
            <View style={styles.metaItem}><MaterialIcons name="bolt" size={14} color={COLORS.orange} /><Text style={styles.metaText}>Instant processing</Text></View>
          </View>
        </View>

        <View style={styles.modeSwitch}>
          <ModeButton mode="hide" active={mode === "hide"} title="Hide" subtitle="Embed an image" icon="layers" onPress={() => changeMode("hide")} />
          <ModeButton mode="reveal" active={mode === "reveal"} title="Reveal" subtitle="Extract an image" icon="visibility" onPress={() => changeMode("reveal")} />
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>{mode === "hide" ? "Build your hidden image" : "Open a hidden image"}</Text>
            <Text style={styles.sectionSubtitle}>{mode === "hide" ? "Choose two images to combine" : "Select a StegaHide carrier image"}</Text>
          </View>
          {(carrierUri || secretUri || resultUri) && (
            <Pressable onPress={reset} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}>
              <MaterialIcons name="refresh" size={16} color={COLORS.muted} />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          <ImageSlot label="Carrier image" hint="The visible image" icon="photo" uri={carrierUri} fileName={carrierName} accent={COLORS.orange} onPress={() => pickImage("carrier")} />
          {mode === "hide" && <View style={styles.connector}><View style={styles.connectorLine} /><View style={styles.connectorBadge}><MaterialIcons name="add" size={14} color={COLORS.muted} /></View><View style={styles.connectorLine} /></View>}
          {mode === "hide" && <ImageSlot label="Secret image" hint="The image to hide" icon="image-search" uri={secretUri} fileName={secretName} accent={COLORS.cyan} onPress={() => pickImage("secret")} />}
        </View>

        <View style={styles.passwordCard}>
          <View style={styles.passwordIcon}><MaterialIcons name="lock-outline" size={19} color={COLORS.orange} /></View>
          <View style={styles.passwordCopy}>
            <Text style={styles.passwordLabel}>{mode === "hide" ? "Encryption password" : "Decryption password · local"}</Text>
            <TextInput
              value={password}
              onChangeText={(value) => { setPassword(value); setCapacityNotice(null); }}
              placeholder={mode === "hide" ? "At least 4 characters" : "Enter your password"}
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.passwordInput}
            />
          </View>
          <MaterialIcons name={password.length >= 4 ? "check-circle" : "vpn-key"} size={18} color={password.length >= 4 ? COLORS.green : COLORS.muted} />
        </View>

        <View style={styles.filenameCard}>
          <View style={styles.filenameIcon}><MaterialIcons name="drive-file-rename-outline" size={19} color={COLORS.cyan} /></View>
          <View style={styles.filenameCopy}>
            <Text style={styles.passwordLabel}>Output filename</Text>
            <TextInput
              value={outputName}
              onChangeText={setOutputName}
              placeholder="stegahide-result"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.passwordInput}
            />
          </View>
          <Text style={styles.filenameExtension}>{mode === "hide" ? ".png" : ".auto"}</Text>
        </View>

        {mode === "reveal" && <Text style={styles.decryptHint}>The hidden payload is decrypted on this device. Your password is never uploaded.</Text>}

        {mode === "hide" && carrierUri && secretUri && (
          <View style={styles.meterCard}>
            <View style={styles.meterHeader}>
              <View>
                <Text style={styles.meterTitle}>Live capacity</Text>
                <Text style={styles.meterSubtitle}>{capacityBusy ? "Estimating encrypted payload…" : capacity ? `${formatBytes(capacity.payloadBytes)} of ${formatBytes(capacity.maxPayloadBytes)} budget` : "Enter a password to estimate size"}</Text>
              </View>
              <Text style={[styles.meterPercent, capacity && !capacity.fits && { color: COLORS.danger }]}>{capacity ? `${Math.min(999, Math.round((capacity.payloadBytes / Math.max(1, capacity.maxPayloadBytes)) * 100))}%` : "—"}</Text>
            </View>
            <View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${Math.min(100, capacity ? (capacity.payloadBytes / Math.max(1, capacity.maxPayloadBytes)) * 100 : 0)}%` }, capacity && !capacity.fits && styles.meterFillDanger]} /></View>
            <View style={styles.meterFooter}>
              <Text style={styles.meterFooterText}>{capacity?.fits ? "Fits safely" : capacity ? "Auto-fit will resize/compress the secret" : "Encrypted after you add a password"}</Text>
              {capacity && <MaterialIcons name={capacity.fits ? "check" : "auto-fix-high"} size={14} color={capacity.fits ? COLORS.green : COLORS.orange} />}
            </View>
          </View>
        )}

        <View style={styles.tipRow}>
          <MaterialIcons name="info-outline" size={17} color={COLORS.cyan} />
          <Text style={styles.tipText}>Capacity uses a conservative pixel budget so hidden images fit reliably.</Text>
        </View>

        {capacityNotice && (
          <View style={[styles.capacityNotice, capacityNotice.ok ? styles.capacitySuccess : styles.capacityError]}>
            <MaterialIcons name={capacityNotice.ok ? "check-circle" : "warning-amber"} size={17} color={capacityNotice.ok ? COLORS.green : COLORS.danger} />
            <Text style={styles.capacityText}>{capacityNotice.text}</Text>
          </View>
        )}

        <Pressable
          onPress={processImages}
          disabled={!ready || busy}
          style={({ pressed }) => [styles.primaryButton, (!ready || busy) && styles.primaryButtonDisabled, pressed && ready && styles.pressed]}
        >
          {busy ? <ActivityIndicator color={COLORS.background} /> : <MaterialIcons name={mode === "hide" ? "auto-fix-high" : "visibility"} size={21} color={COLORS.background} />}
          <Text style={styles.primaryButtonText}>{busy ? "Processing locally…" : actionLabel}</Text>
          {!busy && <MaterialIcons name="arrow-forward" size={19} color={COLORS.background} />}
        </Pressable>

        {message && (
          <View style={[styles.message, message.includes("successfully") || message.includes("now contains") || message.includes("Saved") ? styles.messageSuccess : styles.messageError]}>
            <MaterialIcons name={message.includes("successfully") || message.includes("now contains") || message.includes("Saved") ? "check-circle" : "info-outline"} size={17} color={message.includes("successfully") || message.includes("now contains") || message.includes("Saved") ? COLORS.green : COLORS.danger} />
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        {resultUri && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={styles.resultEyebrow}>{mode === "hide" ? "READY TO EXPORT" : "EXTRACTED PAYLOAD"}</Text>
                <Text style={styles.resultTitle}>{mode === "hide" ? "Hidden image created" : "Secret image revealed"}</Text>
              </View>
              <View style={styles.resultCheck}><MaterialIcons name="check" size={17} color={COLORS.background} /></View>
            </View>
            <Image source={{ uri: resultUri }} style={styles.resultImage} resizeMode="cover" />
            <View style={styles.actionRow}>
              <Pressable onPress={saveResult} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><MaterialIcons name="download" size={18} color={COLORS.text} /><Text style={styles.secondaryText}>Save</Text></Pressable>
              <Pressable onPress={shareResult} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><MaterialIcons name="ios-share" size={18} color={COLORS.text} /><Text style={styles.secondaryText}>Share</Text></Pressable>
            </View>
          </View>
        )}

        <View style={styles.footerStats}>
          <View style={styles.stat}><Text style={styles.statValue}>100%</Text><Text style={styles.statLabel}>ON DEVICE</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={styles.statValue}>PNG</Text><Text style={styles.statLabel}>CARRIER FORMAT</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={styles.statValue}>0</Text><Text style={styles.statLabel}>UPLOADS</Text></View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingTop: 10, paddingBottom: 38 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.orange },
  brandName: { color: COLORS.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  brandCaption: { color: COLORS.muted, fontSize: 8, letterSpacing: 1.7, marginTop: 3, fontWeight: "700" },
  localPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 99, borderWidth: 1, borderColor: `${COLORS.green}45`, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: `${COLORS.green}0D` },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  localPillText: { color: COLORS.green, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  hero: { overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 22, marginBottom: 14 },
  heroGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, right: -72, top: -78, backgroundColor: `${COLORS.cyan}12` },
  eyebrow: { color: COLORS.cyan, fontSize: 10, letterSpacing: 1.8, fontWeight: "800", marginBottom: 11 },
  heroTitle: { color: COLORS.text, fontSize: 33, lineHeight: 36, fontWeight: "800", letterSpacing: -1.1 },
  heroDescription: { color: COLORS.muted, fontSize: 14, lineHeight: 21, marginTop: 13, maxWidth: 290 },
  heroMeta: { flexDirection: "row", gap: 16, marginTop: 21, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: COLORS.muted, fontSize: 11, fontWeight: "600" },
  modeSwitch: { flexDirection: "row", gap: 9, marginBottom: 26 },
  modeButton: { flex: 1, minHeight: 66, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: `${COLORS.surface}88` },
  modeCopy: { flex: 1 },
  modeTitle: { color: COLORS.muted, fontSize: 13, fontWeight: "800" },
  modeSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  activeDot: { width: 7, height: 7, borderRadius: 4 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 11 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  sectionSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  resetButton: { flexDirection: "row", alignItems: "center", gap: 4, padding: 5 },
  resetText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  card: { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 11 },
  imageSlot: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, backgroundColor: `${COLORS.surfaceRaised}AA`, borderWidth: 1, borderColor: `${COLORS.border}99` },
  slotImage: { width: 70, height: 70, borderRadius: 10, backgroundColor: COLORS.background },
  slotIcon: { width: 70, height: 70, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  slotCopy: { flex: 1, minWidth: 0 },
  slotLabel: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  slotHint: { color: COLORS.muted, fontSize: 11, marginTop: 5 },
  addButton: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  connector: { height: 27, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  connectorLine: { width: 58, height: 1, backgroundColor: COLORS.border },
  connectorBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  passwordCard: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: `${COLORS.surface}CC` },
  passwordIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${COLORS.orange}18` },
  passwordCopy: { flex: 1 },
  passwordLabel: { color: COLORS.text, fontSize: 12, fontWeight: "800", marginBottom: 3 },
  passwordInput: { color: COLORS.text, fontSize: 12, padding: 0, minHeight: 22 },
  filenameCard: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: `${COLORS.surface}CC` },
  filenameIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${COLORS.cyan}18` },
  filenameCopy: { flex: 1 },
  filenameExtension: { color: COLORS.muted, fontSize: 11, fontWeight: "800" },
  decryptHint: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 8, paddingHorizontal: 3 },
  meterCard: { marginTop: 11, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: `${COLORS.cyan}35`, backgroundColor: `${COLORS.cyan}0A` },
  meterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  meterTitle: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  meterSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  meterPercent: { color: COLORS.cyan, fontSize: 18, fontWeight: "900" },
  meterTrack: { height: 7, borderRadius: 4, backgroundColor: COLORS.border, overflow: "hidden", marginTop: 12 },
  meterFill: { height: "100%", borderRadius: 4, backgroundColor: COLORS.cyan },
  meterFillDanger: { backgroundColor: COLORS.danger },
  meterFooter: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  meterFooterText: { color: COLORS.muted, fontSize: 10, flex: 1 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 3, marginTop: 12, marginBottom: 15 },
  tipText: { flex: 1, color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  capacityNotice: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 13, padding: 12, marginTop: -3, marginBottom: 13, borderWidth: 1 },
  capacitySuccess: { backgroundColor: `${COLORS.green}10`, borderColor: `${COLORS.green}35` },
  capacityError: { backgroundColor: `${COLORS.danger}10`, borderColor: `${COLORS.danger}35` },
  capacityText: { flex: 1, color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  primaryButton: { minHeight: 56, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: COLORS.orange },
  primaryButtonDisabled: { opacity: 0.42 },
  primaryButtonText: { color: COLORS.background, fontSize: 14, fontWeight: "900", letterSpacing: -0.1 },
  message: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 13, padding: 12, marginTop: 13, borderWidth: 1 },
  messageSuccess: { backgroundColor: `${COLORS.green}10`, borderColor: `${COLORS.green}35` },
  messageError: { backgroundColor: `${COLORS.danger}10`, borderColor: `${COLORS.danger}35` },
  messageText: { flex: 1, color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  resultCard: { marginTop: 18, backgroundColor: COLORS.surface, borderRadius: 20, padding: 12, borderWidth: 1, borderColor: `${COLORS.green}3A` },
  resultHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 11 },
  resultEyebrow: { color: COLORS.green, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  resultTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800", marginTop: 4 },
  resultCheck: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.green },
  resultImage: { width: "100%", height: 190, borderRadius: 13, backgroundColor: COLORS.background },
  actionRow: { flexDirection: "row", gap: 9, marginTop: 10 },
  secondaryButton: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 11, borderWidth: 1, borderColor: COLORS.border, backgroundColor: `${COLORS.surfaceRaised}90` },
  secondaryText: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  footerStats: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginTop: 26, paddingTop: 17, borderTopWidth: 1, borderTopColor: COLORS.border },
  stat: { alignItems: "center", gap: 5 },
  statValue: { color: COLORS.text, fontSize: 14, fontWeight: "900" },
  statLabel: { color: COLORS.muted, fontSize: 8, letterSpacing: 1.1, fontWeight: "800" },
  statDivider: { width: 1, height: 25, backgroundColor: COLORS.border },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
