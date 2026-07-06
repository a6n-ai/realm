import { writeFileSync } from "node:fs";

export type Row = {
  label: string; viewport: string; url: string;
  skeletonFrames: number; doubleFlash: boolean;
};

export function writeReport(rows: Row[], outDir: string) {
  const cell = (r: Row) => {
    const skels = Array.from({ length: r.skeletonFrames }, (_, i) =>
      `<img src="${r.label}-${r.viewport}-skeleton-${i + 1}.png" width="320">`).join("");
    const flag = r.doubleFlash ? `<b style="color:#c00">DOUBLE-FLASH</b>` : (r.skeletonFrames ? "ok" : "no skeleton captured");
    return `<tr>
      <td>${r.label}<br><small>${r.viewport} · ${flag}</small></td>
      <td>${skels || "—"}</td>
      <td><img src="${r.label}-${r.viewport}-loaded.png" width="320"></td>
    </tr>`;
  };
  const html = `<!doctype html><meta charset=utf8><title>skeleton audit</title>
    <style>body{font:14px system-ui}table{border-collapse:collapse}td{border:1px solid #ccc;padding:6px;vertical-align:top}img{border:1px solid #eee}</style>
    <table><tr><th>route</th><th>skeleton frame(s)</th><th>loaded</th></tr>
    ${rows.map(cell).join("")}</table>`;
  writeFileSync(`${outDir}/report.html`, html);
}
