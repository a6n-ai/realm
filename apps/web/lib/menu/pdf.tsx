import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { NotFoundError } from "@tiffin/commons";
import { buildPosterColumns } from "@/lib/menu/poster";
import type { PlanType } from "@/lib/menu/meal-types";
import { menuService } from "@/lib/services/menu.service";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11 },
  title: { fontSize: 20, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  col: { width: "33%", marginBottom: 14, paddingRight: 8 },
  colTitle: { fontSize: 12, marginBottom: 4, textTransform: "uppercase" },
  slot: { fontSize: 9, marginTop: 4, color: "#666" },
  dish: { marginBottom: 2 },
});

export async function renderWeeklyMenuPdf(planType: PlanType, weekStart?: string): Promise<Uint8Array> {
  const pub = await menuService.getPublishedWeek(planType, weekStart);
  if (!pub) throw new NotFoundError("No published menu for this week");
  const columns = buildPosterColumns(pub.slots, pub.items);
  const buf = await renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={{ ...styles.title, color: pub.theme.accent }}>{pub.theme.titlePrefix} — {pub.weekStart}</Text>
        <View style={styles.grid}>
          {columns.map((col) => (
            <View key={col.label} style={styles.col}>
              <Text style={{ ...styles.colTitle, color: pub.theme.accent }}>{col.label}</Text>
              {col.groups.map((g, gi) => (
                <View key={g.slotLabel ?? gi}>
                  {g.slotLabel ? <Text style={styles.slot}>{g.slotLabel}</Text> : null}
                  {g.dishes.length === 0 ? <Text style={styles.dish}>—</Text>
                    : g.dishes.map((d, i) => <Text key={`${d.name}-${i}`} style={styles.dish}>• {d.name}</Text>)}
                </View>
              ))}
            </View>
          ))}
        </View>
      </Page>
    </Document>,
  );
  return new Uint8Array(buf);
}
