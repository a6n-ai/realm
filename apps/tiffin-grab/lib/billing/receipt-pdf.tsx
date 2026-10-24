import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Line } from "@/app/(customer)/me/pay/[paymentId]/lines";
import type { Receipt } from "./receipt";

// Built-in Helvetica only covers WinAnsi: no U+2212 minus, so negatives use "-".
const SAFFRON = "#E8590C";
const MUTED = "#6E6558";
const BORDER = "#E7E1D8";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1F1A14", fontFamily: "Helvetica" },
  head: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: SAFFRON },
  muted: { color: MUTED },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "right" },
  cols: { flexDirection: "row", gap: 24, marginBottom: 20 },
  col: { flex: 1 },
  label: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  section: { marginBottom: 18 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: BORDER },
  total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  table: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: BORDER },
  foot: { position: "absolute", bottom: 32, left: 40, right: 40, fontSize: 8, color: MUTED, textAlign: "center" },
});

export async function renderReceiptPdf(r: Receipt): Promise<Uint8Array> {
  const money = (n: number) => {
    const f = new Intl.NumberFormat("en-CA", { style: "currency", currency: r.currency, currencyDisplay: "narrowSymbol" }).format(Math.abs(n));
    return n < 0 ? `-${f}` : f;
  };
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: r.timezone, year: "numeric", month: "short", day: "numeric" }).format(ms);
  // Date-only strings are calendar days: format in UTC so they never shift.
  const calendar = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
  const rows = (lines: Line[]) => lines.map((l, i) => (
    <View key={`${l.label}-${i}`} style={s.row}>
      <Text>{l.label}</Text>
      <Text>{money(l.amount)}</Text>
    </View>
  ));

  const buf = await renderToBuffer(
    <Document title={`Receipt ${r.code}`} author={r.business.name}>
      <Page size="LETTER" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.brand}>{r.business.name}</Text>
            {r.business.address ? <Text style={s.muted}>{r.business.address}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>Receipt</Text>
            <Text style={[s.muted, { textAlign: "right" }]}>Order {r.code}</Text>
            <Text style={[s.muted, { textAlign: "right" }]}>Issued {day(r.issuedAt)}</Text>
          </View>
        </View>

        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.label}>Billed to</Text>
            <Text>{r.customer.name}</Text>
            {r.customer.email ? <Text style={s.muted}>{r.customer.email}</Text> : null}
            <Text style={s.muted}>{r.customer.address}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Plan</Text>
            <Text>{r.plan.title}</Text>
            <Text style={s.muted}>
              {r.plan.lastDate && r.plan.lastDate !== r.plan.startDate ? `${calendar(r.plan.startDate)} to ${calendar(r.plan.lastDate)}` : calendar(r.plan.startDate)}
            </Text>
            <Text style={s.muted}>{r.plan.tiffins} tiffins · {r.plan.weeks} {r.plan.weeks === 1 ? "week" : "weeks"} · ordered {day(r.orderedAt)}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>Order</Text>
          {rows(r.lines)}
          {rows(r.taxLines)}
          <View style={s.total}>
            <Text>Order total</Text>
            <Text>{money(r.orderTotal)}</Text>
          </View>
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.label}>Payments</Text>
          {r.payments.length === 0 ? <Text style={s.muted}>No payments yet.</Text> : r.payments.map((p, i) => (
            <View key={i} style={s.table}>
              <Text style={{ width: "18%" }}>{day(p.date)}</Text>
              <Text style={{ width: "40%" }}>
                {p.method}
                {p.reference ? <Text style={s.muted}>{`  ${p.reference}`}</Text> : null}
              </Text>
              <Text style={[s.muted, { width: "16%" }]}>{p.status === "paid" ? "Paid" : p.status === "refunded" ? "Refunded" : "Pending"}</Text>
              <Text style={{ width: "26%", textAlign: "right" }}>
                {money(p.amount)}
                {p.cardFee > 0 ? <Text style={s.muted}>{`\nincl. card fee ${money(p.cardFee)}`}</Text> : null}
                {p.refunded > 0 ? <Text style={s.muted}>{`\nrefunded ${money(-p.refunded)}`}</Text> : null}
              </Text>
            </View>
          ))}
          <View style={s.total}>
            <Text>Total paid</Text>
            <Text>{money(r.paid)}</Text>
          </View>
          {r.refunded > 0 ? (
            <View style={s.row}>
              <Text>Refunded</Text>
              <Text>{money(-r.refunded)}</Text>
            </View>
          ) : null}
          {r.balanceDue > 0 ? (
            <View style={[s.total, { color: SAFFRON }]}>
              <Text>Balance due</Text>
              <Text>{money(r.balanceDue)}</Text>
            </View>
          ) : null}
        </View>

        <Text style={s.foot} fixed>
          Thank you for eating with {r.business.name}. Questions about this receipt? Reply to the email it came with, or open Support in the app.
        </Text>
      </Page>
    </Document>,
  );
  return new Uint8Array(buf);
}
