import type { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { palette } from '../theme';

export const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Nao informado';

export const formatTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--:--';

export const Screen = ({
  children,
  footer,
}: PropsWithChildren<{ footer?: ReactNode }>) => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.screenBackdrop}>
      <View style={styles.screenBackdropBand} />
      <ScrollView
        contentContainerStyle={[styles.content, footer ? styles.contentWithFooter : null]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentShell}>{children}</View>
      </ScrollView>
    </View>
    {footer ? (
      <View style={styles.footer}>
        <View style={styles.footerShell}>{footer}</View>
      </View>
    ) : null}
  </SafeAreaView>
);

export const HeroCard = ({
  title,
  subtitle,
  aside,
  eyebrow,
  helperText,
}: {
  title: string;
  subtitle: string;
  aside?: ReactNode;
  eyebrow?: string;
  helperText?: string;
}) => (
  <View style={styles.hero}>
    <View style={styles.heroTopBar} />
    <View style={styles.heroHeader}>
      <View style={styles.heroContent}>
        {eyebrow ? <Text style={styles.kicker}>{eyebrow}</Text> : null}
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroCopy}>{subtitle}</Text>
      </View>
      {aside ? <View style={styles.heroAside}>{aside}</View> : null}
    </View>
    {helperText ? (
      <View style={styles.heroFooter}>
        <Text style={styles.heroFooterText}>{helperText}</Text>
      </View>
    ) : null}
  </View>
);

export const Card = ({ children }: PropsWithChildren) => <View style={styles.card}>{children}</View>;

export const MetricCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
    {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
  </View>
);

export const SectionTitle = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {description ? <Text style={styles.copy}>{description}</Text> : null}
  </View>
);

const BaseButton = ({
  label,
  onPress,
  disabled,
  variant,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant: 'primary' | 'secondary' | 'ghost';
}) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.button,
      variant === 'primary'
        ? styles.primaryButton
        : variant === 'secondary'
          ? styles.secondaryButton
          : styles.ghostButton,
      disabled ? styles.buttonDisabled : null,
      pressed && !disabled ? styles.buttonPressed : null,
    ]}
  >
    <Text
      style={[
        styles.buttonText,
        variant === 'primary'
          ? styles.primaryText
          : variant === 'secondary'
            ? styles.secondaryText
            : styles.ghostText,
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

export const PrimaryButton = ({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => <BaseButton label={label} onPress={onPress} disabled={disabled} variant="primary" />;

export const SecondaryButton = ({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => <BaseButton label={label} onPress={onPress} disabled={disabled} variant="secondary" />;

export const GhostButton = ({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <BaseButton label={label} onPress={onPress} disabled={disabled} variant="ghost" />
);

export const ChipButton = ({
  label,
  onPress,
  selected,
  disabled,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.ghostChip,
      selected ? styles.ghostChipSelected : null,
      disabled ? styles.buttonDisabled : null,
      pressed && !disabled ? styles.buttonPressed : null,
    ]}
  >
    <Text style={[styles.ghostChipText, selected ? styles.ghostChipTextSelected : null]}>
      {label}
    </Text>
  </Pressable>
);

export const Field = ({
  label,
  value,
  placeholder,
  onChangeText,
  multiline,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
      multiline={multiline}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#8c9aa8"
      secureTextEntry={secureTextEntry}
      style={[styles.input, multiline ? styles.textarea : null]}
      textAlignVertical={multiline ? 'top' : 'center'}
      value={value}
    />
  </View>
);

export const Banner = ({
  tone,
  text,
}: {
  tone: 'neutral' | 'warning' | 'danger' | 'success';
  text: string;
}) => {
  const toneStyles =
    tone === 'danger'
      ? styles.bannerDanger
      : tone === 'warning'
        ? styles.bannerWarning
        : tone === 'success'
          ? styles.bannerSuccess
          : styles.bannerNeutral;

  const toneTextStyle =
    tone === 'danger'
      ? styles.bannerTextDanger
      : tone === 'warning'
        ? styles.bannerTextWarning
        : tone === 'success'
          ? styles.bannerTextSuccess
          : styles.bannerTextNeutral;

  return (
    <View style={[styles.banner, toneStyles]}>
      <Text style={[styles.bannerText, toneTextStyle]}>{text}</Text>
    </View>
  );
};

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.copy}>{description}</Text>
    {action}
  </View>
);

export const StatusPill = ({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) => {
  const toneStyles =
    tone === 'success'
      ? styles.statusSuccess
      : tone === 'warning'
        ? styles.statusWarning
        : tone === 'danger'
          ? styles.statusDanger
          : styles.statusNeutral;

  const textStyles =
    tone === 'neutral' ? styles.pillTextNeutral : styles.pillTextStrong;
  const dotStyle =
    tone === 'success'
      ? styles.pillDotSuccess
      : tone === 'warning'
        ? styles.pillDotWarning
        : tone === 'danger'
          ? styles.pillDotDanger
          : styles.pillDotNeutral;

  return (
    <View style={[styles.pill, toneStyles]}>
      <View style={[styles.pillDot, dotStyle]} />
      <Text style={[styles.pillText, textStyles]}>{label}</Text>
    </View>
  );
};

export const StepRail = ({
  steps,
}: {
  steps: Array<{ key: string; label: string; done: boolean; blocked: boolean }>;
}) => (
  <View style={styles.stepRail}>
    {steps.map((step, index) => (
      <View key={step.key} style={styles.stepRow}>
        <View style={styles.stepLineColumn}>
          <View
            style={[
              styles.stepDot,
              step.done
                ? styles.stepDotDone
                : step.blocked
                  ? styles.stepDotBlocked
                  : styles.stepDotOpen,
            ]}
          >
            <Text style={styles.stepDotText}>{index + 1}</Text>
          </View>
          {index < steps.length - 1 ? <View style={styles.stepConnector} /> : null}
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepLabel, step.blocked ? styles.stepLabelBlocked : null]}>
            {step.label}
          </Text>
          <Text style={styles.stepHint}>
            {step.done
              ? 'Etapa concluida'
              : step.blocked
                ? 'Bloqueada por etapa obrigatoria anterior'
                : 'Liberada para execucao'}
          </Text>
        </View>
      </View>
    ))}
  </View>
);

export const BottomTabs = ({
  value,
  onChange,
}: {
  value: 'dashboard' | 'clients' | 'history' | 'sync';
  onChange: (value: 'dashboard' | 'clients' | 'history' | 'sync') => void;
}) => {
  const tabs: Array<{ key: 'dashboard' | 'clients' | 'history' | 'sync'; label: string }> = [
    { key: 'dashboard', label: 'Inicio' },
    { key: 'clients', label: 'Roteiro' },
    { key: 'history', label: 'Historico' },
    { key: 'sync', label: 'Sync' },
  ];

  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={({ pressed }) => [
            styles.tab,
            value === tab.key ? styles.tabActive : null,
            pressed ? styles.tabPressed : null,
          ]}
        >
          <Text style={value === tab.key ? styles.tabTextActive : styles.tabText}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  screenBackdrop: {
    flex: 1,
    position: 'relative',
  },
  screenBackdropBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 108,
    backgroundColor: '#d4dee8',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 104,
    gap: 16,
  },
  contentWithFooter: {
    paddingBottom: 128,
  },
  contentShell: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    gap: 16,
  },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: 'rgba(234,240,245,0.98)',
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  footerShell: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
  },
  hero: {
    gap: 12,
    padding: 18,
    borderRadius: 20,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: palette.shadowStrong,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 4,
  },
  heroTopBar: {
    width: 72,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#4f7ea6',
  },
  heroHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroContent: {
    flex: 1,
    gap: 6,
  },
  heroAside: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  heroFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  heroFooterText: {
    color: 'rgba(243,246,250,0.72)',
    fontSize: 12,
    lineHeight: 18,
  },
  kicker: {
    width: 'auto',
    alignSelf: 'flex-start',
    color: '#9cc1e4',
    fontWeight: '800',
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 1.1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(31,93,145,0.18)',
  },
  heroTitle: {
    color: '#f3f6fa',
    fontWeight: '900',
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  heroCopy: {
    color: 'rgba(243,246,250,0.78)',
    fontSize: 14,
    lineHeight: 20,
  },
  copy: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    gap: 14,
    padding: 18,
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    shadowColor: palette.shadow,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 2,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 132,
    gap: 6,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceRaised,
  },
  metricLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  metricValue: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  metricHint: {
    color: palette.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    gap: 6,
  },
  sectionTitle: {
    color: palette.ink,
    fontWeight: '900',
    fontSize: 19,
    letterSpacing: -0.3,
  },
  button: {
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderWidth: 1,
    borderColor: palette.accentStrong,
  },
  secondaryButton: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: palette.border,
  },
  buttonText: {
    fontWeight: '800',
    fontSize: 16,
  },
  primaryText: {
    color: '#f3f6fa',
  },
  secondaryText: {
    color: palette.ink,
  },
  ghostText: {
    color: palette.inkSoft,
  },
  ghostChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostChipSelected: {
    borderColor: palette.accent,
    backgroundColor: 'rgba(31, 93, 145, 0.16)',
  },
  ghostChipText: {
    color: palette.inkSoft,
    fontWeight: '800',
    fontSize: 13,
  },
  ghostChipTextSelected: {
    color: palette.accentStrong,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: palette.inkSoft,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  input: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: '#fbfcfe',
    color: palette.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textarea: {
    minHeight: 132,
  },
  banner: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerNeutral: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
  },
  bannerWarning: {
    backgroundColor: palette.warningSoft,
    borderColor: 'rgba(184,109,32,0.18)',
  },
  bannerDanger: {
    backgroundColor: palette.dangerSoft,
    borderColor: 'rgba(178,71,66,0.18)',
  },
  bannerSuccess: {
    backgroundColor: palette.successSoft,
    borderColor: 'rgba(44,125,88,0.18)',
  },
  bannerText: {
    lineHeight: 20,
    fontWeight: '600',
  },
  bannerTextNeutral: {
    color: palette.inkSoft,
  },
  bannerTextWarning: {
    color: palette.warning,
  },
  bannerTextDanger: {
    color: palette.danger,
  },
  bannerTextSuccess: {
    color: palette.success,
  },
  emptyState: {
    gap: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyTitle: {
    color: palette.ink,
    fontWeight: '900',
    fontSize: 16,
  },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  pillDotNeutral: {
    backgroundColor: palette.inkSoft,
  },
  pillDotSuccess: {
    backgroundColor: palette.success,
  },
  pillDotWarning: {
    backgroundColor: palette.warning,
  },
  pillDotDanger: {
    backgroundColor: palette.danger,
  },
  statusNeutral: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
  },
  statusSuccess: {
    backgroundColor: palette.successSoft,
    borderColor: 'rgba(44,125,88,0.18)',
  },
  statusWarning: {
    backgroundColor: palette.warningSoft,
    borderColor: 'rgba(184,109,32,0.18)',
  },
  statusDanger: {
    backgroundColor: palette.dangerSoft,
    borderColor: 'rgba(178,71,66,0.18)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pillTextNeutral: {
    color: palette.inkSoft,
  },
  pillTextStrong: {
    color: palette.ink,
  },
  stepRail: {
    gap: 4,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  stepLineColumn: {
    width: 28,
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stepDotOpen: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accentMuted,
  },
  stepDotDone: {
    backgroundColor: palette.success,
    borderColor: palette.success,
  },
  stepDotBlocked: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
  },
  stepDotText: {
    color: palette.ink,
    fontWeight: '900',
    fontSize: 12,
  },
  stepConnector: {
    width: 2,
    flex: 1,
    marginTop: 6,
    marginBottom: -2,
    backgroundColor: palette.borderStrong,
  },
  stepContent: {
    flex: 1,
    gap: 4,
    paddingBottom: 14,
  },
  stepLabel: {
    color: palette.ink,
    fontWeight: '800',
    fontSize: 15,
  },
  stepLabelBlocked: {
    color: palette.muted,
  },
  stepHint: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#ffffff',
  },
  tab: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  tabActive: {
    backgroundColor: palette.surfaceStrong,
  },
  tabPressed: {
    opacity: 0.9,
  },
  tabText: {
    color: palette.muted,
    fontWeight: '700',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#f3f6fa',
    fontWeight: '800',
    fontSize: 13,
  },
});
