import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DailyLabelSheet, DeliveryLabel } from "@/lib/services/daily-labels.service";

// 2 x 5 on A4. Deliberately not a named Avery template: nobody has stated the stock yet, so
// this is a readable default that prints on plain paper and can be re-gridded once the
// label medium is known. Item lines are the constraint — a 5-item thali plus rotis needs
// the height a 3-column grid does not give.
const COLS = 2;
const ROWS = 5;
const PER_PAGE = COLS * ROWS;

const styles = StyleSheet.create({
  page: { padding: 18, fontSize: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / COLS}%`,
    height: `${100 / ROWS}%`,
    padding: 8,
    borderWidth: 0.5,
    borderColor: "#999",
    borderStyle: "dashed",
  },
  headRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  name: { fontSize: 12, fontWeight: "bold" },
  zone: { fontSize: 9 },
  meta: { fontSize: 7, color: "#555", marginBottom: 4 },
  line: { marginBottom: 1 },
  portion: { color: "#333" },
  note: { marginTop: 4, fontSize: 7, color: "#000" },
  footer: { marginTop: "auto", fontSize: 6, color: "#777" },
});

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function LabelCell({ label, date }: { label: DeliveryLabel; date: string }) {
  return (
    <View style={styles.cell}>
      <View style={styles.headRow}>
        <Text style={styles.name}>{label.customerName}</Text>
        {/* Driver + stop when routes are planned; the zone is only a stand-in. */}
        <Text style={styles.zone}>
          {label.routeDriver
            ? `${label.routeDriver}${label.routeStop != null ? ` · #${label.routeStop}` : ""}`
            : (label.zoneName ?? "—")}
        </Text>
      </View>
      <Text style={styles.meta}>
        {label.deploymentId} · {label.planName} · {label.mealSizeName}
        {label.persons > 1 ? ` · person ${label.personIndex}/${label.persons}` : ""}
      </Text>
      {label.lines.map((line, i) => (
        <Text key={`${line.category}-${i}`} style={styles.line}>
          • {line.dish}
          {line.portion ? <Text style={styles.portion}> ({line.portion})</Text> : null}
        </Text>
      ))}
      {label.deliveryNotes ? <Text style={styles.note}>Note: {label.deliveryNotes}</Text> : null}
      <Text style={styles.footer}>
        {date} · {label.addressLine}, {label.city} {label.postalCode}
        {label.phone ? ` · ${label.phone}` : ""}
      </Text>
    </View>
  );
}

export async function renderDailyLabelsPdf(sheet: DailyLabelSheet): Promise<Uint8Array> {
  // Already ordered by driver then stop (sortForPrinting) — one sort, in the service, so
  // the on-screen list and the printed sheet cannot disagree about the packing order.
  const pages = chunk(sheet.labels, PER_PAGE);

  const buf = await renderToBuffer(
    <Document>
      {(pages.length ? pages : [[]]).map((pageLabels, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          <View style={styles.grid}>
            {pageLabels.map((label) => (
              <LabelCell
                key={`${label.deliveryPublicId}-${label.personIndex}`}
                label={label}
                date={sheet.date}
              />
            ))}
          </View>
        </Page>
      ))}
    </Document>,
  );
  return new Uint8Array(buf);
}
